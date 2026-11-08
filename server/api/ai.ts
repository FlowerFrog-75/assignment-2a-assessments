// The AI question generator's API. Jobs run in the background; the teacher's
// screen polls the job to show the agents' steps as they happen.
import { Router, type Request } from "express";
import { Types } from "mongoose";
import { SKILL_KEYS, skillLabel, type SkillKey } from "../db/constants";
import { AiJobModel, AssessmentItemModel, AssessmentTemplateModel, appendAuditLog, currentSchool, type UserDocument } from "../db/models";
import { currentUser, requireAuth, requireRole } from "../auth/session";
import { blueprintAvailability } from "../assessment/engine";
import { generateItems, planTargets, type ItemRequest, type Target } from "../ai/item-agent";
import { aiMode, aiStatus, describeAiError } from "../ai/provider";
import { ApiError } from "./data";

export const aiRoutes = Router();
const staff = [requireAuth(), requireRole("teacher", "admin")];

const MAX_ITEMS = () => Math.max(1, Number(process.env.AI_MAX_ITEMS_PER_JOB ?? 10));
const DAILY_JOBS = () => Math.max(1, Number(process.env.AI_DAILY_JOBS ?? 20));

function audit(req: Request, me: UserDocument, action: string, label: string, details: Record<string, unknown> = {}) {
  return appendAuditLog({ actor: me._id, actorRole: me.role, action, ip: req.ip, userAgent: req.get("user-agent"), status: "success", details: { label, ...details } });
}

/** GET /api/ai/status */
aiRoutes.get("/ai/status", ...staff, async (_req, res) => {
  const school = await currentSchool();
  res.json({ ...aiStatus(), markingEnabled: Boolean(school?.aiMarkingEnabled) });
});

async function startJob(req: Request, request: ItemRequest, label: string) {
  const me = currentUser(req);
  const mode = aiMode();
  if (mode === "off") throw new ApiError(409, "ai_off", "AI isn't set up on this server. An administrator needs to add ANTHROPIC_API_KEY.");
  if (await AiJobModel.exists({ requestedBy: me._id, status: { $in: ["queued", "running"] } })) {
    throw new ApiError(409, "ai_busy", "You already have an AI job running. Wait for it to finish.");
  }
  const today = await AiJobModel.countDocuments({ requestedBy: me._id, createdAt: { $gt: new Date(Date.now() - 86_400_000) } });
  if (today >= DAILY_JOBS()) throw new ApiError(429, "ai_daily_limit", `You've reached today's limit of ${DAILY_JOBS()} AI jobs.`);
  const total = request.targets.reduce((t, x) => t + x.count, 0);
  if (total < 1) throw new ApiError(400, "nothing_to_do", "There are no questions to generate.");
  if (total > MAX_ITEMS()) throw new ApiError(400, "too_many", `Ask for at most ${MAX_ITEMS()} questions at a time.`);

  const job = await AiJobModel.create({ kind: "generate_items", status: "running", requestedBy: me._id, params: request, mode, model: aiStatus().model ?? undefined });
  await audit(req, me, "ai.generate", label, { job: job._id.toString(), mode });

  // Run in the background. Each step is appended to the job for the live timeline.
  const log = async (actor: "author" | "validator" | "system", text: string) => {
    await AiJobModel.updateOne({ _id: job._id }, { $push: { steps: { actor, text: text.slice(0, 1_000), at: new Date() } } });
  };
  generateItems({ request, requestedBy: me._id, log, mode })
    .then(async (result) => {
      await log("system", `Done: ${result.queued.length} question${result.queued.length === 1 ? "" : "s"} queued for your review${result.drafts.length ? `, ${result.drafts.length} kept as draft${result.drafts.length === 1 ? "" : "s"} (didn't pass review)` : ""}. Nothing is used until a teacher approves it.`);
      await AiJobModel.updateOne(
        { _id: job._id },
        { $set: { status: "succeeded", queuedItems: result.queued, draftItems: result.drafts, usage: result.usage, model: result.model, finishedAt: new Date() } },
      );
    })
    .catch(async (error) => {
      const message = describeAiError(error);
      console.warn("[ai] job failed:", message);
      await log("system", `Stopped: ${message}`).catch(() => undefined);
      await AiJobModel.updateOne({ _id: job._id }, { $set: { status: "failed", error: message, finishedAt: new Date() } });
    });
  return job;
}

/** POST /api/ai/item-jobs { subject, skills[], complexities[], count, types, yearLevel?, topic? } */
aiRoutes.post("/ai/item-jobs", ...staff, async (req, res) => {
  const body = req.body ?? {};
  const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 80) : "";
  if (!subject) throw new ApiError(400, "missing_field", "Subject is required");
  const skills = [...new Set((Array.isArray(body.skills) ? body.skills : []).filter((s: unknown): s is SkillKey => SKILL_KEYS.includes(s as SkillKey)))] as SkillKey[];
  if (!skills.length) throw new ApiError(400, "no_skills", "Choose at least one skill");
  const complexities = [...new Set((Array.isArray(body.complexities) ? body.complexities : []).map(Number).filter((c: number) => Number.isInteger(c) && c >= 1 && c <= 5))] as number[];
  if (!complexities.length) throw new ApiError(400, "no_complexity", "Choose at least one complexity level");
  const count = Number(body.count);
  if (!Number.isInteger(count) || count < 1) throw new ApiError(400, "invalid_count", "Choose how many questions to generate");
  const types = ["multiple_choice", "short_response", "mixed"].includes(body.types) ? body.types : "mixed";
  const yearLevel = Number(body.yearLevel) >= 1 && Number(body.yearLevel) <= 12 ? Number(body.yearLevel) : null;
  const topic = typeof body.topic === "string" && body.topic.trim() ? body.topic.trim().slice(0, 300) : null;
  const request: ItemRequest = { subject, targets: planTargets(skills, complexities, count), types, yearLevel, topic };
  const job = await startJob(req, request, `AI asked for ${count} question${count === 1 ? "" : "s"} (${subject})`);
  res.status(202).json({ jobId: job._id.toString() });
});

/** POST /api/ai/templates/:id/fill: generate exactly the questions a template's blueprint is missing. */
aiRoutes.post("/ai/templates/:id/fill", ...staff, async (req, res) => {
  const id = String(req.params.id);
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_id", "That template ID isn't valid");
  const template = await AssessmentTemplateModel.findById(id);
  if (!template) throw new ApiError(404, "template_not_found", "Assessment template not found");
  const missing: Target[] = (await blueprintAvailability(template))
    .filter((row) => row.available < row.count)
    .map((row) => ({ skill: row.skill as SkillKey, complexity: row.complexity, count: row.count - row.available }));
  if (!missing.length) throw new ApiError(409, "nothing_missing", "This template already has enough approved questions.");
  const yearLevel = template.yearLevels ? Math.round((template.yearLevels.min + template.yearLevels.max) / 2) : null;
  const job = await startJob(req, { subject: template.subject, targets: missing, types: "mixed", yearLevel, topic: template.title }, `AI asked to fill missing questions for ${template.title}`);
  res.status(202).json({ jobId: job._id.toString(), missing: missing.map((m) => `${m.count} × ${skillLabel(m.skill)} (complexity ${m.complexity})`) });
});

async function jobView(job: InstanceType<typeof AiJobModel>) {
  const ids = [...job.queuedItems, ...job.draftItems];
  const items = await AssessmentItemModel.find({ _id: { $in: ids } }, { prompt: 1, skill: 1, complexity: 1, type: 1, status: 1, generation: 1 }).lean();
  return {
    id: job._id.toString(),
    status: job.status,
    mode: job.mode,
    model: job.model ?? null,
    params: job.params,
    steps: job.steps.map((s) => ({ at: s.at, actor: s.actor, text: s.text })),
    items: items.map((i) => ({
      id: i._id.toString(),
      prompt: i.prompt,
      skill: i.skill,
      skillLabel: skillLabel(i.skill as SkillKey),
      complexity: i.complexity,
      type: i.type,
      status: i.status,
      passed: Boolean(i.generation?.validation?.passed),
      notes: i.generation?.validation?.notes ?? "",
    })),
    usage: job.usage,
    error: job.error ?? null,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt ?? null,
  };
}

/** GET /api/ai/jobs/:id (the person who started it, or an admin) */
aiRoutes.get("/ai/jobs/:id", ...staff, async (req, res) => {
  const me = currentUser(req);
  const id = String(req.params.id);
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_id", "That job ID isn't valid");
  const job = await AiJobModel.findOne({ _id: id, ...(me.role === "admin" ? {} : { requestedBy: me._id }) });
  if (!job) throw new ApiError(404, "job_not_found", "AI job not found");
  res.json(await jobView(job));
});

/** GET /api/ai/jobs: recent jobs (yours; admins see everyone's). */
aiRoutes.get("/ai/jobs", ...staff, async (req, res) => {
  const me = currentUser(req);
  const jobs = await AiJobModel.find(me.role === "admin" ? {} : { requestedBy: me._id }).sort({ createdAt: -1 }).limit(20);
  res.json({ jobs: await Promise.all(jobs.map(jobView)) });
});
