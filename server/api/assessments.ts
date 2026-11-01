// Students: sitting assessments, consent for teachers, and verification links.
import { Router, type Request } from "express";
import { Types } from "mongoose";
import { SKILL_KEYS, skillLabel, type SkillKey } from "../db/constants";
import {
  AssessmentAttemptModel,
  AssessmentItemModel,
  AssessmentTemplateModel,
  ClassGroupModel,
  ConsentModel,
  UserModel,
  VerificationLinkModel,
  appendAuditLog,
  createVerificationLink,
  type AssessmentAttemptDocument,
  type UserDocument,
} from "../db/models";
import { currentUser, requireAuth, requireRole } from "../auth/session";
import { autoMark, buildPaper, computeResult, newSeed } from "../assessment/engine";
import { ApiError } from "./data";
import { formatDate } from "./format";

export const assessmentRoutes = Router();
const student = [requireAuth(), requireRole("student")];

function objectId(value: unknown, what = "ID"): Types.ObjectId {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) throw new ApiError(400, "invalid_id", `That ${what} isn't valid`);
  return new Types.ObjectId(value);
}

function log(req: Request, user: UserDocument, action: string, label: string, extra: Record<string, unknown> = {}) {
  return appendAuditLog({
    actor: user._id,
    actorRole: user.role,
    action,
    subjectStudent: user.role === "student" ? user._id : undefined,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    status: "success",
    details: { label, ...extra },
  });
}

/** Templates assigned to the student's classes, with due dates. */
async function assignedTemplates(studentId: Types.ObjectId) {
  const classes = await ClassGroupModel.find({ students: studentId, archived: false }, { _id: 1 }).lean();
  const classIds = classes.map((c) => c._id);
  const templates = await AssessmentTemplateModel.find({ status: "published", "assignments.classGroup": { $in: classIds } });
  return templates.map((t) => {
    const assignment = t.assignments.find((a) => classIds.some((id) => id.equals(a.classGroup)));
    return { template: t, classGroup: assignment!.classGroup, dueAt: assignment?.dueAt ?? null };
  });
}

/** Submits an attempt whose time ran out, so it can't be left open forever. */
async function closeIfExpired(attempt: AssessmentAttemptDocument) {
  if (attempt.status === "in_progress" && attempt.endsAt && attempt.endsAt.getTime() + 30_000 < Date.now()) {
    await submit(attempt, true);
  }
}

async function submit(attempt: AssessmentAttemptDocument, timedOut = false) {
  attempt.status = "submitted";
  attempt.submittedAt = timedOut && attempt.endsAt ? attempt.endsAt : new Date();
  if (await autoMark(attempt)) {
    // Everything was multiple choice: the result is ready for the teacher to release.
    attempt.set("result", computeResult(attempt));
    attempt.status = "marked";
    attempt.markedAt = new Date();
  }
  await attempt.save();
}

/** GET /api/me/assessments: everything assigned to the student, and where they're up to. */
assessmentRoutes.get("/me/assessments", ...student, async (req, res) => {
  const me = currentUser(req);
  const assigned = await assignedTemplates(me._id);
  const attempts = await AssessmentAttemptModel.find({ student: me._id }).sort({ createdAt: -1 });
  for (const a of attempts) await closeIfExpired(a);
  res.json({
    assessments: assigned.map(({ template, dueAt }) => {
      const attempt = attempts.find((a) => a.template.equals(template._id));
      return {
        templateId: template._id.toString(),
        title: template.title,
        subject: template.subject,
        description: template.description ?? "",
        durationMinutes: template.durationMinutes,
        questions: template.questionCount,
        skills: template.skills.map((s) => skillLabel(s as SkillKey)),
        due: dueAt ? formatDate(dueAt) : null,
        overdue: Boolean(dueAt && dueAt < new Date() && !attempt),
        status: attempt?.status ?? "not_started",
        attemptId: attempt?._id.toString() ?? null,
        percent: attempt?.status === "released" ? attempt.result?.percent ?? null : null,
      };
    }),
  });
});

/** POST /api/me/assessments/:templateId/start: starts (or resumes) an attempt. */
assessmentRoutes.post("/me/assessments/:templateId/start", ...student, async (req, res) => {
  const me = currentUser(req);
  const templateId = objectId(req.params.templateId, "assessment");
  const assignment = (await assignedTemplates(me._id)).find((a) => a.template._id.equals(templateId));
  if (!assignment) throw new ApiError(404, "not_assigned", "This assessment hasn't been assigned to you");

  const existing = await AssessmentAttemptModel.findOne({ student: me._id, template: templateId }).sort({ createdAt: -1 });
  if (existing) {
    await closeIfExpired(existing);
    if (existing.status !== "in_progress") throw new ApiError(409, "already_submitted", "You've already submitted this assessment");
    res.json({ attemptId: existing._id.toString() });
    return;
  }

  const seed = newSeed();
  const questions = await buildPaper(assignment.template, seed);
  const now = new Date();
  try {
    const attempt = await AssessmentAttemptModel.create({
      template: templateId,
      student: me._id,
      classGroup: assignment.classGroup,
      seed,
      questions,
      responses: questions.map((q) => ({ item: q.item })),
      startedAt: now,
      endsAt: new Date(now.getTime() + assignment.template.durationMinutes * 60_000),
    });
    await log(req, me, "assessment.start", `Started ${assignment.template.title}`, { attempt: attempt._id.toString() });
    res.status(201).json({ attemptId: attempt._id.toString() });
  } catch (error) {
    // Two tabs pressed Start at once: use the attempt the other one made.
    if ((error as { code?: number }).code !== 11000) throw error;
    const attempt = await AssessmentAttemptModel.findOne({ student: me._id, template: templateId, status: "in_progress" });
    res.json({ attemptId: attempt!._id.toString() });
  }
});

async function myAttempt(req: Request) {
  const attempt = await AssessmentAttemptModel.findOne({ _id: objectId(req.params.attemptId, "attempt"), student: currentUser(req)._id });
  if (!attempt) throw new ApiError(404, "attempt_not_found", "Assessment attempt not found");
  return attempt;
}

/** GET /api/me/attempts/:attemptId: the paper (without answers) and saved responses. */
assessmentRoutes.get("/me/attempts/:attemptId", ...student, async (req, res) => {
  const attempt = await myAttempt(req);
  await closeIfExpired(attempt);
  const template = await AssessmentTemplateModel.findById(attempt.template, { title: 1, subject: 1, durationMinutes: 1 }).lean();
  const items = await AssessmentItemModel.find({ _id: { $in: attempt.questions.map((q) => q.item) } }, { prompt: 1, options: 1, type: 1 }).lean();
  const byId = new Map(items.map((i) => [i._id.toString(), i]));
  res.json({
    attemptId: attempt._id.toString(),
    title: template?.title ?? "Assessment",
    subject: template?.subject ?? "",
    status: attempt.status,
    endsAt: attempt.endsAt?.toISOString() ?? null,
    serverTime: new Date().toISOString(),
    questions: attempt.questions.map((q, index) => {
      const item = byId.get(q.item.toString());
      const response = attempt.responses.find((r) => r.item.equals(q.item));
      return {
        number: index + 1,
        itemId: q.item.toString(),
        skill: skillLabel(q.skill as SkillKey),
        type: item?.type ?? "multiple_choice",
        prompt: item?.prompt ?? "(This question is no longer available)",
        options: (item?.options ?? []).map((o) => ({ key: o.key, text: o.text })),
        points: q.maxPoints,
        answer: response?.answer ?? "",
        flagged: Boolean(response?.flagged),
      };
    }),
  });
});

/** PUT /api/me/attempts/:attemptId/responses { itemId, answer?, flagged? }: autosave. */
assessmentRoutes.put("/me/attempts/:attemptId/responses", ...student, async (req, res) => {
  const attempt = await myAttempt(req);
  await closeIfExpired(attempt);
  if (attempt.status !== "in_progress") throw new ApiError(409, "attempt_closed", "This assessment has been submitted, so answers can't be changed");
  const itemId = objectId(req.body?.itemId, "question");
  const question = attempt.questions.find((q) => q.item.equals(itemId));
  if (!question) throw new ApiError(400, "not_on_paper", "That question isn't on your paper");
  let response = attempt.responses.find((r) => r.item.equals(itemId));
  if (!response) {
    attempt.responses.push({ item: itemId });
    response = attempt.responses[attempt.responses.length - 1];
  }
  if (typeof req.body?.answer === "string") {
    if (req.body.answer.length > 10_000) throw new ApiError(400, "too_long", "Answers can be at most 10,000 characters");
    response.answer = req.body.answer;
    response.answeredAt = new Date();
  }
  if (typeof req.body?.flagged === "boolean") response.flagged = req.body.flagged;
  attempt.lastSavedAt = new Date();
  await attempt.save();
  res.json({ savedAt: attempt.lastSavedAt.toISOString() });
});

/** POST /api/me/attempts/:attemptId/submit */
assessmentRoutes.post("/me/attempts/:attemptId/submit", ...student, async (req, res) => {
  const me = currentUser(req);
  const attempt = await myAttempt(req);
  if (attempt.status === "in_progress") {
    await submit(attempt);
    await log(req, me, "assessment.submit", "Submitted an assessment", { attempt: attempt._id.toString() });
  }
  res.json({ status: attempt.status });
});

// ---------------------------------------------------------------- consent

/** GET /api/me/consents: the student's teachers and what each may see. */
assessmentRoutes.get("/me/consents", ...student, async (req, res) => {
  const me = currentUser(req);
  const classes = await ClassGroupModel.find({ students: me._id, archived: false }, { name: 1, teachers: 1 }).lean();
  const teacherIds = [...new Set(classes.flatMap((c) => c.teachers.map(String)))];
  const teachers = await UserModel.find({ _id: { $in: teacherIds }, status: "active" }, { firstName: 1, lastName: 1, email: 1 }).lean();
  const consents = await ConsentModel.find({ student: me._id }).sort({ createdAt: -1 }).lean();
  res.json({
    teachers: teachers.map((t) => {
      const active = consents.find((c) => c.grantee.equals(t._id) && c.active && c.scope === "individual_results");
      return {
        id: t._id.toString(),
        name: `${t.firstName} ${t.lastName}`,
        email: t.email,
        classes: classes.filter((c) => c.teachers.some((id) => id.equals(t._id))).map((c) => c.name),
        consent: active ? { id: active._id.toString(), grantedAt: formatDate(active.grantedAt) } : null,
      };
    }),
    history: consents.map((c) => ({
      id: c._id.toString(),
      teacher: teachers.find((t) => t._id.equals(c.grantee)) ? `${teachers.find((t) => t._id.equals(c.grantee))!.firstName} ${teachers.find((t) => t._id.equals(c.grantee))!.lastName}` : "Former teacher",
      active: c.active,
      grantedAt: formatDate(c.grantedAt),
      revokedAt: c.revokedAt ? formatDate(c.revokedAt) : null,
    })),
  });
});

/** POST /api/me/consents { teacherId }: let a teacher see your individual results. */
assessmentRoutes.post("/me/consents", ...student, async (req, res) => {
  const me = currentUser(req);
  const teacherId = objectId(req.body?.teacherId, "teacher");
  const teachesMe = await ClassGroupModel.exists({ students: me._id, teachers: teacherId, archived: false });
  if (!teachesMe) throw new ApiError(400, "not_your_teacher", "You can only give consent to your own teachers");
  const existing = await ConsentModel.findOne({ student: me._id, grantee: teacherId, scope: "individual_results", active: true });
  if (!existing) await ConsentModel.create({ student: me._id, grantee: teacherId, scope: "individual_results" });
  const teacher = await UserModel.findById(teacherId, { firstName: 1, lastName: 1 }).lean();
  await log(req, me, "consent.grant", `Consent given to ${teacher?.firstName} ${teacher?.lastName}`);
  res.status(201).json({ ok: true });
});

/** DELETE /api/me/consents/:consentId: withdraw consent (kept in history). */
assessmentRoutes.delete("/me/consents/:consentId", ...student, async (req, res) => {
  const me = currentUser(req);
  const consent = await ConsentModel.findOne({ _id: objectId(req.params.consentId, "consent"), student: me._id, active: true });
  if (!consent) throw new ApiError(404, "consent_not_found", "That consent isn't active");
  consent.active = false;
  consent.revokedAt = new Date();
  await consent.save();
  const teacher = await UserModel.findById(consent.grantee, { firstName: 1, lastName: 1 }).lean();
  await log(req, me, "consent.revoke", `Consent withdrawn from ${teacher?.firstName} ${teacher?.lastName}`);
  res.json({ ok: true });
});

// ----------------------------------------------------- verification links

/** GET /api/me/verification-links */
assessmentRoutes.get("/me/verification-links", ...student, async (req, res) => {
  const links = await VerificationLinkModel.find({ student: currentUser(req)._id }).sort({ createdAt: -1 }).lean();
  const now = new Date();
  res.json({
    links: links.map((l) => ({
      id: l._id.toString(),
      label: l.label ?? "",
      skills: l.disclosedSkills.map((s) => skillLabel(s as SkillKey)),
      includeAchievements: Boolean(l.includeAchievements),
      created: formatDate(l.createdAt),
      expires: l.expiresAt ? formatDate(l.expiresAt) : null,
      status: l.revokedAt ? "revoked" : l.expiresAt && l.expiresAt < now ? "expired" : "active",
      views: l.viewCount ?? 0,
      lastViewed: l.lastViewedAt ? formatDate(l.lastViewedAt) : null,
    })),
  });
});

/** POST /api/me/verification-links { label, skills[], includeAchievements, expiresInDays } */
assessmentRoutes.post("/me/verification-links", ...student, async (req, res) => {
  const me = currentUser(req);
  const skills = Array.isArray(req.body?.skills) ? req.body.skills.filter((s: unknown): s is SkillKey => SKILL_KEYS.includes(s as SkillKey)) : [];
  if (skills.length === 0) throw new ApiError(400, "no_skills", "Choose at least one skill to share");
  const days = Number(req.body?.expiresInDays ?? 30);
  if (!Number.isFinite(days) || days < 1 || days > 365) throw new ApiError(400, "invalid_expiry", "Links can last from 1 to 365 days");
  const { link, code } = await createVerificationLink({
    student: me._id,
    disclosedSkills: skills,
    includeAchievements: Boolean(req.body?.includeAchievements),
    label: typeof req.body?.label === "string" ? req.body.label.slice(0, 200) : undefined,
    expiresAt: new Date(Date.now() + days * 86_400_000),
  });
  await log(req, me, "verification.create", `Shared ${skills.length} skill${skills.length === 1 ? "" : "s"}${link.label ? ` (${link.label})` : ""}`);
  res.status(201).json({ id: link._id.toString(), code });
});

/** POST /api/me/verification-links/:linkId/revoke */
assessmentRoutes.post("/me/verification-links/:linkId/revoke", ...student, async (req, res) => {
  const me = currentUser(req);
  const result = await VerificationLinkModel.updateOne(
    { _id: objectId(req.params.linkId, "link"), student: me._id, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
  if (result.matchedCount === 0) throw new ApiError(404, "link_not_found", "That link isn't active");
  await log(req, me, "verification.revoke", "Revoked a verification link");
  res.json({ ok: true });
});
