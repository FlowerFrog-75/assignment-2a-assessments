// Teachers (and admins): the item bank, assessment templates, marking and
// releasing results.
import { Router, type Request } from "express";
import { Types } from "mongoose";
import {
  DIFFICULTY_LEVELS,
  ITEM_STATUSES,
  ITEM_TYPES,
  MAX_COMPLEXITY,
  MIN_COMPLEXITY,
  SKILL_KEYS,
  skillLabel,
  type SkillKey,
} from "../db/constants";
import {
  AssessmentAttemptModel,
  AssessmentItemModel,
  AssessmentTemplateModel,
  ClassGroupModel,
  UserModel,
  appendAuditLog,
  type AssessmentTemplateDocument,
  type UserDocument,
} from "../db/models";
import { currentUser, requireAuth, requireRole } from "../auth/session";
import { blueprintAvailability, computeResult } from "../assessment/engine";
import { issueRewards, syncLedgerSoon } from "../assessment/coins";
import { ApiError } from "./data";
import { formatDate, formatTimestamp } from "./format";

export const teachingRoutes = Router();
const staff = [requireAuth(), requireRole("teacher", "admin")];

function objectId(value: unknown, what = "ID"): Types.ObjectId {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) throw new ApiError(400, "invalid_id", `That ${what} isn't valid`);
  return new Types.ObjectId(value);
}

function text(value: unknown, field: string, { required = false, max = 5000 } = {}): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ApiError(400, "missing_field", `${field} is required`);
    return undefined;
  }
  if (typeof value !== "string") throw new ApiError(400, "invalid_field", `${field} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new ApiError(400, "missing_field", `${field} is required`);
  if (trimmed.length > max) throw new ApiError(400, "too_long", `${field} can be at most ${max} characters`);
  return trimmed;
}

function int(value: unknown, field: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new ApiError(400, "invalid_field", `${field} must be a whole number from ${min} to ${max}`);
  return n;
}

function skill(value: unknown): SkillKey {
  if (!SKILL_KEYS.includes(value as SkillKey)) throw new ApiError(400, "invalid_skill", "Choose one of the seven skills");
  return value as SkillKey;
}

function audit(req: Request, user: UserDocument, action: string, label: string, extra: { subjectStudent?: Types.ObjectId; details?: Record<string, unknown>; resource?: { type: string; id?: string } } = {}) {
  return appendAuditLog({
    actor: user._id,
    actorRole: user.role,
    action,
    resource: extra.resource,
    subjectStudent: extra.subjectStudent,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    status: "success",
    details: { label, ...extra.details },
  });
}

const names = async (ids: (Types.ObjectId | null | undefined)[]) =>
  new Map(
    (await UserModel.find({ _id: { $in: ids.filter(Boolean) } }, { firstName: 1, lastName: 1 }).lean()).map((u) => [u._id.toString(), `${u.firstName} ${u.lastName}`]),
  );

// ------------------------------------------------------------- item bank

/** GET /api/items?status=&subject=&skill=&q= */
teachingRoutes.get("/items", ...staff, async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (typeof req.query.status === "string" && ITEM_STATUSES.includes(req.query.status as never)) filter.status = req.query.status;
  else filter.status = { $ne: "retired" };
  if (typeof req.query.subject === "string" && req.query.subject) filter.subject = req.query.subject;
  if (typeof req.query.skill === "string" && SKILL_KEYS.includes(req.query.skill as SkillKey)) filter.skill = req.query.skill;
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    filter.prompt = { $regex: req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  }
  const items = await AssessmentItemModel.find(filter).select("+answer").sort({ updatedAt: -1 }).limit(500).lean();
  const used = new Set((await AssessmentAttemptModel.distinct("questions.item", { "questions.item": { $in: items.map((i) => i._id) } })).map(String));
  const people = await names(items.flatMap((i) => [i.createdBy, i.review?.reviewedBy]));
  const subjects = await AssessmentItemModel.distinct("subject");
  const counts = await AssessmentItemModel.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]);
  res.json({
    subjects: subjects.sort(),
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    items: items.map((i) => ({
      id: i._id.toString(),
      subject: i.subject,
      skill: i.skill,
      skillLabel: skillLabel(i.skill as SkillKey),
      complexity: i.complexity,
      type: i.type,
      prompt: i.prompt,
      options: i.options.map((o) => ({ key: o.key, text: o.text })),
      answer: { correctOption: i.answer?.correctOption ?? "", modelAnswer: i.answer?.modelAnswer ?? "", rubric: i.answer?.rubric ?? "" },
      points: i.points ?? 1,
      source: i.source,
      status: i.status,
      createdBy: i.createdBy ? people.get(i.createdBy.toString()) ?? "" : "",
      reviewedBy: i.review?.reviewedBy ? people.get(i.review.reviewedBy.toString()) ?? "" : "",
      reviewComments: i.review?.comments ?? "",
      updated: formatDate(i.updatedAt),
      inUse: used.has(i._id.toString()),
    })),
  });
});

function itemFields(body: Record<string, unknown>) {
  const type = body.type;
  if (!ITEM_TYPES.includes(type as never)) throw new ApiError(400, "invalid_type", "Choose multiple choice or short response");
  const options = type === "multiple_choice"
    ? (Array.isArray(body.options) ? body.options : [])
        .map((o: { text?: unknown }, index: number) => ({ key: String.fromCharCode(65 + index), text: text(o?.text, `Option ${String.fromCharCode(65 + index)}`, { max: 1000 }) ?? "" }))
        .filter((o) => o.text)
    : [];
  const answer = (body.answer ?? {}) as Record<string, unknown>;
  if (type === "multiple_choice") {
    if (options.length < 2) throw new ApiError(400, "invalid_options", "Multiple-choice questions need at least two options");
    if (options.length > 8) throw new ApiError(400, "invalid_options", "Multiple-choice questions can have at most eight options");
    if (!options.some((o) => o.key === answer.correctOption)) throw new ApiError(400, "invalid_answer", "Mark which option is correct");
  }
  return {
    subject: text(body.subject, "Subject", { required: true, max: 80 })!,
    skill: skill(body.skill),
    complexity: int(body.complexity, "Complexity", MIN_COMPLEXITY, MAX_COMPLEXITY),
    type: type as (typeof ITEM_TYPES)[number],
    prompt: text(body.prompt, "Question", { required: true, max: 5000 })!,
    options,
    points: int(body.points ?? 1, "Marks", 1, 20),
    answer: {
      correctOption: type === "multiple_choice" ? String(answer.correctOption) : undefined,
      modelAnswer: text(answer.modelAnswer, "Model answer"),
      rubric: text(answer.rubric, "Marking guide"),
    },
  };
}

/** POST /api/items: a new question (starts as pending review). */
teachingRoutes.post("/items", ...staff, async (req, res) => {
  const me = currentUser(req);
  const item = await AssessmentItemModel.create({ ...itemFields(req.body ?? {}), source: "teacher", status: "pending_review", createdBy: me._id });
  await audit(req, me, "item.create", `Question added (${item.subject}, ${skillLabel(item.skill as SkillKey)})`, { resource: { type: "item", id: item._id.toString() } });
  res.status(201).json({ id: item._id.toString() });
});

/** PUT /api/items/:id: edit. Questions already used in a paper can't change (retire and replace them). */
teachingRoutes.put("/items/:id", ...staff, async (req, res) => {
  const me = currentUser(req);
  const item = await AssessmentItemModel.findById(objectId(req.params.id, "question")).select("+answer");
  if (!item) throw new ApiError(404, "item_not_found", "Question not found");
  if (await AssessmentAttemptModel.exists({ "questions.item": item._id })) {
    throw new ApiError(409, "item_in_use", "Students have already answered this question, so it can't be edited. Retire it and add a new one instead.");
  }
  item.set({ ...itemFields(req.body ?? {}), status: "pending_review", review: undefined });
  await item.save();
  await audit(req, me, "item.update", "Question edited (back to review)", { resource: { type: "item", id: item._id.toString() } });
  res.json({ ok: true });
});

/** POST /api/items/:id/review { decision: "approve" | "reject", comments } */
teachingRoutes.post("/items/:id/review", ...staff, async (req, res) => {
  const me = currentUser(req);
  const item = await AssessmentItemModel.findById(objectId(req.params.id, "question")).select("+answer");
  if (!item) throw new ApiError(404, "item_not_found", "Question not found");
  const decision = req.body?.decision;
  if (decision !== "approve" && decision !== "reject") throw new ApiError(400, "invalid_decision", "Approve or reject the question");
  if (item.status === "retired") throw new ApiError(409, "item_retired", "This question has been retired");
  if (decision === "approve" && item.type === "multiple_choice" && !item.answer?.correctOption) {
    throw new ApiError(400, "invalid_answer", "Set the correct option before approving");
  }
  item.status = decision === "approve" ? "approved" : "rejected";
  item.review = { reviewedBy: me._id, reviewedAt: new Date(), comments: text(req.body?.comments, "Comments", { max: 2000 }) };
  await item.save();
  await audit(req, me, `item.${decision}`, `Question ${decision === "approve" ? "approved" : "rejected"}`, { resource: { type: "item", id: item._id.toString() } });
  res.json({ ok: true });
});

/** POST /api/items/:id/retire: removes a question from future papers (kept for past ones). */
teachingRoutes.post("/items/:id/retire", ...staff, async (req, res) => {
  const me = currentUser(req);
  const result = await AssessmentItemModel.updateOne({ _id: objectId(req.params.id, "question") }, { $set: { status: "retired" } });
  if (result.matchedCount === 0) throw new ApiError(404, "item_not_found", "Question not found");
  await audit(req, me, "item.retire", "Question retired", { resource: { type: "item", id: String(req.params.id) } });
  res.json({ ok: true });
});

// ------------------------------------------------------------- templates

async function editableTemplate(req: Request): Promise<AssessmentTemplateDocument> {
  const me = currentUser(req);
  const template = await AssessmentTemplateModel.findById(objectId(req.params.id, "template"));
  if (!template) throw new ApiError(404, "template_not_found", "Assessment template not found");
  if (me.role !== "admin" && !template.createdBy.equals(me._id)) {
    throw new ApiError(403, "forbidden", "Only the teacher who created this template (or an administrator) can change it");
  }
  return template;
}

/** GET /api/templates/:id: everything needed to edit and assign a template. */
teachingRoutes.get("/templates/:id", ...staff, async (req, res) => {
  const me = currentUser(req);
  const template = await AssessmentTemplateModel.findById(objectId(req.params.id, "template"));
  if (!template) throw new ApiError(404, "template_not_found", "Assessment template not found");
  const classIds = template.assignments.map((a) => a.classGroup);
  const classes = await ClassGroupModel.find({ _id: { $in: classIds } }, { name: 1, students: 1 }).lean();
  const attempts = await AssessmentAttemptModel.find({ template: template._id }, { status: 1, classGroup: 1 }).lean();
  const myClasses = await ClassGroupModel.find(me.role === "admin" ? { archived: false } : { teachers: me._id, archived: false }, { name: 1 }).sort({ name: 1 }).lean();
  const author = await names([template.createdBy]);
  res.json({
    id: template._id.toString(),
    title: template.title,
    description: template.description ?? "",
    subject: template.subject,
    yearLevels: { min: template.yearLevels?.min ?? 7, max: template.yearLevels?.max ?? 12 },
    curriculumCode: template.curriculumLink?.code ?? "",
    curriculumDescription: template.curriculumLink?.description ?? "",
    skills: template.skills,
    difficulty: template.difficulty,
    status: template.status,
    durationMinutes: template.durationMinutes,
    blueprint: await blueprintAvailability(template),
    createdBy: author.get(template.createdBy.toString()) ?? "",
    canEdit: me.role === "admin" || template.createdBy.equals(me._id),
    locked: attempts.length > 0,
    assignments: template.assignments.map((a) => {
      const c = classes.find((x) => x._id.equals(a.classGroup));
      const mine = attempts.filter((x) => x.classGroup?.equals(a.classGroup));
      return {
        classId: a.classGroup.toString(),
        className: c?.name ?? "Deleted class",
        students: c?.students.length ?? 0,
        started: mine.length,
        submitted: mine.filter((x) => x.status !== "in_progress").length,
        due: a.dueAt ? a.dueAt.toISOString().slice(0, 10) : "",
      };
    }),
    classOptions: myClasses.map((c) => ({ id: c._id.toString(), name: c.name })),
  });
});

function templateFields(body: Record<string, unknown>) {
  const skills = [...new Set((Array.isArray(body.skills) ? body.skills : []).map(skill))];
  if (skills.length === 0) throw new ApiError(400, "no_skills", "Select at least one skill");
  const blueprint = (Array.isArray(body.blueprint) ? body.blueprint : []).map((row: Record<string, unknown>) => ({
    skill: skill(row?.skill),
    complexity: int(row?.complexity, "Complexity", MIN_COMPLEXITY, MAX_COMPLEXITY),
    count: int(row?.count, "Number of questions", 1, 50),
  }));
  const yl = (body.yearLevels ?? {}) as Record<string, unknown>;
  if (!DIFFICULTY_LEVELS.includes(body.difficulty as never)) throw new ApiError(400, "invalid_difficulty", "Choose a difficulty");
  return {
    title: text(body.title, "Title", { required: true, max: 200 })!,
    description: text(body.description, "Description", { max: 2000 }),
    subject: text(body.subject, "Subject", { required: true, max: 80 })!,
    yearLevels: { min: int(yl.min, "Lowest year level", 1, 12), max: int(yl.max, "Highest year level", 1, 12) },
    curriculumLink: { code: text(body.curriculumCode, "Curriculum code", { max: 50 }), description: text(body.curriculumDescription, "Curriculum description", { max: 500 }) },
    skills,
    difficulty: body.difficulty as (typeof DIFFICULTY_LEVELS)[number],
    durationMinutes: int(body.durationMinutes, "Duration", 1, 300),
    blueprint,
  };
}

/** POST /api/templates: a new draft. */
teachingRoutes.post("/templates", ...staff, async (req, res) => {
  const me = currentUser(req);
  const template = await AssessmentTemplateModel.create({ ...templateFields(req.body ?? {}), status: "draft", createdBy: me._id });
  await audit(req, me, "template.create", `Template created: ${template.title}`, { resource: { type: "template", id: template._id.toString() } });
  res.status(201).json({ id: template._id.toString() });
});

/** PUT /api/templates/:id. Once students have started it, the questions can't change. */
teachingRoutes.put("/templates/:id", ...staff, async (req, res) => {
  const me = currentUser(req);
  const template = await editableTemplate(req);
  const fields = templateFields(req.body ?? {});
  if (await AssessmentAttemptModel.exists({ template: template._id })) {
    const sameBlueprint = JSON.stringify(fields.blueprint) === JSON.stringify(template.blueprint.map((r) => ({ skill: r.skill, complexity: r.complexity, count: r.count })));
    if (!sameBlueprint || fields.subject !== template.subject) {
      throw new ApiError(409, "template_in_use", "Students have already sat this assessment, so its subject and questions can't change. Duplicate it instead.");
    }
  }
  template.set(fields);
  await template.save();
  await audit(req, me, "template.update", `Template edited: ${template.title}`, { resource: { type: "template", id: template._id.toString() } });
  res.json({ ok: true });
});

/** POST /api/templates/:id/status { status: "published" | "draft" | "archived" } */
teachingRoutes.post("/templates/:id/status", ...staff, async (req, res) => {
  const me = currentUser(req);
  const template = await editableTemplate(req);
  const status = req.body?.status;
  if (!["published", "draft", "archived"].includes(status)) throw new ApiError(400, "invalid_status", "Unknown status");
  if (status === "published") {
    const short = (await blueprintAvailability(template)).filter((row) => row.available < row.count);
    if (template.blueprint.length === 0) throw new ApiError(400, "empty_blueprint", "Add at least one row of questions before publishing");
    if (short.length) {
      const row = short[0];
      throw new ApiError(409, "not_enough_items", `Not enough approved questions: ${skillLabel(row.skill as SkillKey)} at complexity ${row.complexity} needs ${row.count}, the item bank has ${row.available}.`);
    }
  }
  template.status = status;
  await template.save();
  await audit(req, me, `template.${status === "published" ? "publish" : status === "archived" ? "archive" : "unpublish"}`, `${template.title}: ${status}`, { resource: { type: "template", id: template._id.toString() } });
  res.json({ ok: true });
});

/** POST /api/templates/:id/duplicate: a draft copy (for changing a template students have used). */
teachingRoutes.post("/templates/:id/duplicate", ...staff, async (req, res) => {
  const me = currentUser(req);
  const source = await AssessmentTemplateModel.findById(objectId(req.params.id, "template")).lean();
  if (!source) throw new ApiError(404, "template_not_found", "Assessment template not found");
  const { _id, createdAt, updatedAt, publishedAt, assignments, status, createdBy, ...rest } = source as Record<string, unknown>;
  void [_id, createdAt, updatedAt, publishedAt, assignments, status, createdBy];
  const copy = await AssessmentTemplateModel.create({ ...rest, title: `${source.title} (copy)`.slice(0, 200), status: "draft", createdBy: me._id, assignments: [] });
  await audit(req, me, "template.create", `Template duplicated: ${source.title}`, { resource: { type: "template", id: copy._id.toString() } });
  res.status(201).json({ id: copy._id.toString() });
});

/** PUT /api/templates/:id/assignments/:classId { dueAt }: assign to a class (or change the due date). */
teachingRoutes.put("/templates/:id/assignments/:classId", ...staff, async (req, res) => {
  const me = currentUser(req);
  const template = await AssessmentTemplateModel.findById(objectId(req.params.id, "template"));
  if (!template) throw new ApiError(404, "template_not_found", "Assessment template not found");
  if (template.status !== "published") throw new ApiError(409, "not_published", "Publish the template before assigning it");
  const classId = objectId(req.params.classId, "class");
  const classGroup = await ClassGroupModel.findOne({ _id: classId, archived: false, ...(me.role === "admin" ? {} : { teachers: me._id }) });
  if (!classGroup) throw new ApiError(403, "forbidden", "You can only assign assessments to your own classes");
  const dueAt = req.body?.dueAt ? new Date(`${req.body.dueAt}T23:59:00`) : undefined;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new ApiError(400, "invalid_date", "That due date isn't valid");
  const existing = template.assignments.find((a) => a.classGroup.equals(classId));
  if (existing) existing.dueAt = dueAt;
  else template.assignments.push({ classGroup: classId, assignedAt: new Date(), dueAt });
  await template.save();
  await audit(req, me, "template.assign", `${template.title} assigned to ${classGroup.name}`, { resource: { type: "template", id: template._id.toString() } });
  res.json({ ok: true });
});

/** DELETE /api/templates/:id/assignments/:classId */
teachingRoutes.delete("/templates/:id/assignments/:classId", ...staff, async (req, res) => {
  const me = currentUser(req);
  const template = await AssessmentTemplateModel.findById(objectId(req.params.id, "template"));
  if (!template) throw new ApiError(404, "template_not_found", "Assessment template not found");
  const classId = objectId(req.params.classId, "class");
  if (me.role !== "admin" && !(await ClassGroupModel.exists({ _id: classId, teachers: me._id }))) {
    throw new ApiError(403, "forbidden", "You can only change assignments for your own classes");
  }
  template.assignments = template.assignments.filter((a) => !a.classGroup.equals(classId)) as typeof template.assignments;
  await template.save();
  await audit(req, me, "template.unassign", `${template.title} unassigned from a class`, { resource: { type: "template", id: template._id.toString() } });
  res.json({ ok: true });
});

// --------------------------------------------------------------- marking

/** Attempts the viewer may mark: from their classes (admins: all). */
async function markingScope(me: UserDocument) {
  if (me.role === "admin") return {};
  const classes = await ClassGroupModel.find({ teachers: me._id }, { _id: 1 }).lean();
  return { classGroup: { $in: classes.map((c) => c._id) } };
}

/** GET /api/marking: submitted work waiting to be marked or released. */
teachingRoutes.get("/marking", ...staff, async (req, res) => {
  const me = currentUser(req);
  const attempts = await AssessmentAttemptModel.find({ ...(await markingScope(me)), status: { $in: ["submitted", "marked", "released"] } })
    .sort({ submittedAt: -1 })
    .limit(500)
    .lean();
  const people = await names(attempts.map((a) => a.student));
  const templates = new Map((await AssessmentTemplateModel.find({ _id: { $in: attempts.map((a) => a.template) } }, { title: 1 }).lean()).map((t) => [t._id.toString(), t.title]));
  const classes = new Map((await ClassGroupModel.find({ _id: { $in: attempts.flatMap((a) => (a.classGroup ? [a.classGroup] : [])) } }, { name: 1 }).lean()).map((c) => [c._id.toString(), c.name]));
  res.json({
    counts: {
      toMark: attempts.filter((a) => a.status === "submitted").length,
      toRelease: attempts.filter((a) => a.status === "marked").length,
      released: attempts.filter((a) => a.status === "released").length,
    },
    attempts: attempts.map((a) => ({
      id: a._id.toString(),
      student: people.get(a.student.toString()) ?? "Student",
      assessment: templates.get(a.template.toString()) ?? "Assessment",
      className: a.classGroup ? classes.get(a.classGroup.toString()) ?? "" : "",
      submitted: a.submittedAt ? formatTimestamp(a.submittedAt) : "",
      status: a.status,
      percent: a.result?.percent ?? null,
      grade: a.result?.grade ?? null,
      unmarked: a.responses.filter((r) => typeof r.pointsAwarded !== "number").length,
    })),
  });
});

/**
 * POST /api/marking/release { ids: [...] }: releases marked results to
 * students. Coins and achievements are issued, and the coins are written to
 * the blockchain in the background.
 */
teachingRoutes.post("/marking/release", ...staff, async (req, res) => {
  const me = currentUser(req);
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map((id: unknown) => objectId(id, "attempt"));
  if (ids.length === 0) throw new ApiError(400, "nothing_selected", "Choose at least one marked result to release");
  const attempts = await AssessmentAttemptModel.find({ _id: { $in: ids }, status: "marked", ...(await markingScope(me)) });
  let coins = 0;
  for (const attempt of attempts) {
    attempt.status = "released";
    attempt.releasedAt = new Date();
    await attempt.save();
    const rewards = await issueRewards(attempt, me._id);
    coins += rewards.coins;
    await audit(req, me, "results.release", `Result released (${attempt.result?.percent}%, ${rewards.coins} coins)`, {
      subjectStudent: attempt.student,
      resource: { type: "attempt", id: attempt._id.toString() },
      details: rewards.achievements.length ? { achievements: rewards.achievements } : {},
    });
  }
  if (attempts.length) syncLedgerSoon();
  res.json({ released: attempts.length, coins, skipped: ids.length - attempts.length });
});

async function markableAttempt(req: Request) {
  const me = currentUser(req);
  const attempt = await AssessmentAttemptModel.findOne({ _id: objectId(req.params.id, "attempt"), ...(await markingScope(me)) });
  if (!attempt) throw new ApiError(404, "attempt_not_found", "Submission not found (or not in your classes)");
  if (attempt.status === "in_progress") throw new ApiError(409, "not_submitted", "The student hasn't submitted this yet");
  return attempt;
}

/** GET /api/marking/:id: one submission with questions, answers and marking guides. */
teachingRoutes.get("/marking/:id", ...staff, async (req, res) => {
  const me = currentUser(req);
  const attempt = await markableAttempt(req);
  const student = await UserModel.findById(attempt.student, { firstName: 1, lastName: 1, walletId: 1 }).lean();
  const template = await AssessmentTemplateModel.findById(attempt.template, { title: 1, subject: 1 }).lean();
  const items = await AssessmentItemModel.find({ _id: { $in: attempt.questions.map((q) => q.item) } }).select("+answer").lean();
  const byId = new Map(items.map((i) => [i._id.toString(), i]));
  await audit(req, me, "marking.view", `${student?.firstName} ${student?.lastName}: ${template?.title}`, { subjectStudent: attempt.student });
  res.json({
    id: attempt._id.toString(),
    student: `${student?.firstName} ${student?.lastName}`,
    walletId: student?.walletId ?? "",
    assessment: template?.title ?? "Assessment",
    subject: template?.subject ?? "",
    status: attempt.status,
    submitted: attempt.submittedAt ? formatTimestamp(attempt.submittedAt) : "",
    feedback: attempt.result?.feedback ?? "",
    result: attempt.result ? { percent: attempt.result.percent, grade: attempt.result.grade, score: attempt.result.score, maxScore: attempt.result.maxScore, coins: attempt.result.coinsAwarded } : null,
    questions: attempt.questions.map((q, index) => {
      const item = byId.get(q.item.toString());
      const response = attempt.responses.find((r) => r.item.equals(q.item));
      return {
        number: index + 1,
        itemId: q.item.toString(),
        skill: skillLabel(q.skill as SkillKey),
        type: item?.type ?? "multiple_choice",
        prompt: item?.prompt ?? "",
        options: item?.options.map((o) => ({ key: o.key, text: o.text })) ?? [],
        correctOption: item?.answer?.correctOption ?? "",
        modelAnswer: item?.answer?.modelAnswer ?? "",
        rubric: item?.answer?.rubric ?? "",
        maxPoints: q.maxPoints,
        answer: response?.answer ?? "",
        points: typeof response?.pointsAwarded === "number" ? response.pointsAwarded : null,
      };
    }),
  });
});

/** POST /api/marking/:id { marks: { [itemId]: points }, feedback }: saves marks for written answers. */
teachingRoutes.post("/marking/:id", ...staff, async (req, res) => {
  const me = currentUser(req);
  const attempt = await markableAttempt(req);
  if (attempt.status === "released") throw new ApiError(409, "already_released", "Results have been released, so marks are final");
  const marks = (req.body?.marks ?? {}) as Record<string, unknown>;
  for (const question of attempt.questions) {
    const given = marks[question.item.toString()];
    if (given === undefined || given === null || given === "") continue;
    const points = Number(given);
    if (!Number.isFinite(points) || points < 0 || points > question.maxPoints) {
      throw new ApiError(400, "invalid_mark", `Marks for each question must be between 0 and its maximum (${question.maxPoints})`);
    }
    const response = attempt.responses.find((r) => r.item.equals(question.item));
    if (!response) attempt.responses.push({ item: question.item, pointsAwarded: points, correct: points === question.maxPoints });
    else {
      response.pointsAwarded = points;
      response.correct = points === question.maxPoints;
    }
  }
  const feedback = text(req.body?.feedback, "Feedback", { max: 5000 });
  const complete = attempt.questions.every((q) => typeof attempt.responses.find((r) => r.item.equals(q.item))?.pointsAwarded === "number");
  if (complete) {
    attempt.set("result", computeResult(attempt, feedback));
    attempt.status = "marked";
    attempt.markedAt = new Date();
    attempt.markedBy = me._id;
  }
  await attempt.save();
  await audit(req, me, "marking.save", complete ? "Marking completed" : "Marking saved", { subjectStudent: attempt.student, resource: { type: "attempt", id: attempt._id.toString() } });
  res.json({ status: attempt.status, result: attempt.result ?? null });
});
