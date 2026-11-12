// Routes behind the teacher screens: Class Results, Assessment Templates and
// Access Logs. Each returns the same shape as the mock data in its src/pages file.
import { Router, type Request } from "express";
import { isValidObjectId } from "mongoose";
import { DIFFICULTY_LEVELS, MAX_COMPLEXITY, MIN_COMPLEXITY, SKILLS, type SkillKey } from "../db/constants";
import {
  AssessmentAttemptModel,
  AssessmentItemModel,
  AssessmentTemplateModel,
  AuditLogModel,
  ClassGroupModel,
  UserModel,
  appendAuditLog,
  verifyAuditChain,
  type AssessmentAttemptDocument,
} from "../db/models";
import { ApiError, demoTeacher, groupSkillAverages, skillTotals } from "./data";
import {
  SKILL_SHORT,
  SKILL_TABLE_KEY,
  agoLabel,
  average,
  capitalize,
  formatTimestamp,
  skillName,
} from "./format";

export const teacherRoutes = Router();

/** Class Results: the demo teacher's class. */
teacherRoutes.get("/classes/current/results", async (_req, res) => {
  const teacher = await demoTeacher();
  const classGroup = await ClassGroupModel.findOne({ teachers: teacher._id, archived: false }).sort({ createdAt: 1 });
  if (!classGroup) throw new ApiError(404, "class_not_found", "This teacher has no class yet");
  const students = await UserModel.find({ _id: { $in: classGroup.students } }).sort({ lastName: 1 });
  const attempts = await AssessmentAttemptModel.find({ student: { $in: classGroup.students }, status: "released" }).sort({ releasedAt: 1 });
  const assigned = await AssessmentTemplateModel.countDocuments({ status: "published", "assignments.classGroup": classGroup._id });
  const averages = await groupSkillAverages(classGroup.students);

  const rows = students.map((student) => {
    const mine = attempts.filter((a) => a.student.equals(student._id));
    const totals = skillTotals(mine);
    const avg = average(mine.map((a) => a.result!.percent));
    const before = average(mine.slice(0, -1).map((a) => a.result!.percent));
    const latest = mine.at(-1)?.result?.percent ?? avg;
    return {
      id: student.walletId,
      name: `${student.firstName} ${student.lastName}`,
      grade: student.yearLevel,
      avg,
      trend: mine.length < 2 || Math.abs(latest - before) < 3 ? "flat" : latest > before ? "up" : "down",
      assessments: mine.length,
      skills: Object.fromEntries(SKILLS.map((s) => [SKILL_TABLE_KEY[s.key], totals[s.key].percent])),
    };
  });

  // Class average by week of release, for the "Progress over time" line.
  const weeks = new Map<number, AssessmentAttemptDocument[]>();
  const firstRelease = attempts[0]?.releasedAt?.getTime() ?? Date.now();
  for (const attempt of attempts) {
    const week = Math.floor((attempt.releasedAt!.getTime() - firstRelease) / (7 * 86_400_000)) + 1;
    weeks.set(week, [...(weeks.get(week) ?? []), attempt]);
  }

  res.json({
    header: {
      className: classGroup.name,
      subtitle: `Grade ${classGroup.yearLevel} · ${teacher.firstName} ${teacher.lastName} · Term ${classGroup.term}, ${classGroup.academicYear}`,
    },
    completed: { done: attempts.length, expected: assigned * students.length },
    students: rows,
    skillAverages: SKILLS.map((s) => ({ skill: SKILL_SHORT[s.key], avg: averages[s.key] })),
    classProgress: [...weeks].sort(([a], [b]) => a - b).map(([week, list]) => ({
      week: `Wk ${week}`,
      avg: average(list.map((a) => a.result!.percent)),
    })),
  });
});

/** Assessment Templates */
teacherRoutes.get("/templates", async (_req, res) => {
  const templates = await AssessmentTemplateModel.find().sort({ createdAt: 1 });
  const attempts = await AssessmentAttemptModel.find({}, { template: 1, status: 1, startedAt: 1, releasedAt: 1, result: 1 }).lean();
  const weekAgo = Date.now() - 7 * 86_400_000;
  const released = attempts.filter((a) => a.status === "released");

  res.json({
    stats: {
      total: templates.length,
      drafts: templates.filter((t) => t.status === "draft").length,
      active: templates.filter((t) => t.status === "published").length,
      inProgress: attempts.filter((a) => a.status === "in_progress").length,
      completions: released.length,
      completionsThisWeek: released.filter((a) => (a.releasedAt?.getTime() ?? 0) > weekAgo).length,
      averageScore: average(released.map((a) => a.result?.percent ?? 0)),
    },
    templates: templates.map((t) => {
      const mine = attempts.filter((a) => a.template.equals(t._id));
      const lastUsed = mine.reduce<Date | null>((latest, a) => (!latest || a.startedAt > latest ? a.startedAt : latest), null);
      return {
        id: t._id.toString(),
        title: t.title,
        subject: t.subject,
        grade: t.yearLevels ? `Grade ${t.yearLevels.min}–${t.yearLevels.max}` : "",
        duration: `${t.durationMinutes} min`,
        questions: t.questionCount,
        skills: t.skills.map(skillName),
        difficulty: capitalize(t.difficulty),
        status: capitalize(t.status ?? "draft"),
        lastUsed: agoLabel(lastUsed),
        completions: mine.filter((a) => a.status === "released").length,
      };
    }),
  });
});

// ---------------------------------------------------------------------------
// Template and question-bank authoring
// ---------------------------------------------------------------------------

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Turn a Mongoose validation failure into a readable 400. Anything else is rethrown. */
function rethrow(err: unknown, code: string): never {
  if (err instanceof Error && err.name === "ValidationError") {
    const fields = (err as unknown as { errors?: Record<string, { message: string }> }).errors ?? {};
    throw new ApiError(400, code, Object.values(fields).map((e) => e.message).join("; ") || err.message);
  }
  throw err;
}

function checkId(id: string, what: string): string {
  if (!isValidObjectId(id)) throw new ApiError(404, `${what}_not_found`, `That ${what} doesn't exist`);
  return id;
}

async function findTemplate(id: string) {
  const template = await AssessmentTemplateModel.findById(checkId(id, "template"));
  if (!template) throw new ApiError(404, "template_not_found", "That template doesn't exist");
  return template;
}

/** The fields a request may set on a template. Everything else (createdBy, assignments...) is ignored. */
function templateFields(b: Record<string, any>) {
  return {
    title: b.title,
    description: b.description,
    subject: b.subject,
    yearLevels: b.yearLevels,
    skills: b.skills,
    difficulty: b.difficulty,
    durationMinutes: b.durationMinutes,
    blueprint: b.blueprint ?? [],
    questions: b.questions ?? [],
  };
}

async function validateTemplateQuestions(
  questionIds: unknown,
  subject: unknown,
  skills: unknown,
) {
  if (!Array.isArray(questionIds)) {
    throw new ApiError(400, "invalid_questions", "Selected questions must be a list.");
  }

  const ids = questionIds.map(String);

  if (new Set(ids).size !== ids.length) {
    throw new ApiError(400, "invalid_questions", "A question cannot be selected more than once.");
  }

  if (ids.some((id) => !isValidObjectId(id))) {
    throw new ApiError(400, "invalid_questions", "One or more selected question IDs are invalid.");
  }

  if (ids.length === 0) return [];

  const selected = await AssessmentItemModel.find({
    _id: { $in: ids },
    status: "approved",
  });

  const allowedSkills = new Set(Array.isArray(skills) ? skills : []);
  const expectedSubject = String(subject ?? "").trim().toLowerCase();

  if (
    selected.length !== ids.length ||
    selected.some(
      (item) =>
        item.subject.toLowerCase() !== expectedSubject ||
        !allowedSkills.has(item.skill)
    )
  ) {
    throw new ApiError(
      400,
      "invalid_questions",
      "All selected questions must be approved and match the template subject and skills."
    );
  }

  return ids;
}

async function auditTemplate(req: Request, teacherId: Awaited<ReturnType<typeof demoTeacher>>["_id"], action: string, label: string) {
  await appendAuditLog({
    actor: teacherId,
    actorRole: "teacher",
    action,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    status: "success",
    details: { label },
  });
}

/** Choices for the template and question forms, so they use the same keys the database accepts. */
teacherRoutes.get("/templates/options", (_req, res) => {
  res.json({
    skills: SKILLS.map((s) => ({ key: s.key, name: skillName(s.key) })),
    difficulties: [...DIFFICULTY_LEVELS],
    complexity: { min: MIN_COMPLEXITY, max: MAX_COMPLEXITY },
  });
});

/** The teacher's classes, for the Launch form. */
teacherRoutes.get("/classes", async (_req, res) => {
  const teacher = await demoTeacher();
  const classes = await ClassGroupModel.find({ teachers: teacher._id, archived: false }).sort({ createdAt: 1 });
  res.json(classes.map((c) => ({ id: c._id.toString(), name: c.name, yearLevel: c.yearLevel, students: c.students.length })));
});

/** Create a template (as a draft or published). */
teacherRoutes.post("/templates", async (req, res) => {
  const teacher = await demoTeacher();
  const b = (req.body ?? {}) as Record<string, any>;
  try {
    const questions = await validateTemplateQuestions(
      b.questions ?? [],
      b.subject,
      b.skills
    );

    const template = await AssessmentTemplateModel.create({
      ...templateFields({ ...b, questions }),
      status: b.status === "published" ? "published" : "draft",
      createdBy: teacher._id,
    });

    if (template.status === "published") {
      await auditTemplate(req, teacher._id, "template.publish", `Published “${template.title}”`);
    }

    res.status(201).json({ id: template._id.toString(), status: template.status });
  } catch (err) {
    rethrow(err, "invalid_template");
  }
});

/** One template in full, for the Edit form. */
teacherRoutes.get("/templates/:id", async (req, res) => {
  const t = await findTemplate(req.params.id);
  const attempts = await AssessmentAttemptModel.countDocuments({ template: t._id });
  res.json({
    id: t._id.toString(),
    title: t.title,
    description: t.description ?? "",
    subject: t.subject,
    yearLevels: { min: t.yearLevels?.min ?? 1, max: t.yearLevels?.max ?? 12 },
    skills: [...t.skills],
    difficulty: t.difficulty,
    status: t.status ?? "draft",
    durationMinutes: t.durationMinutes,
    blueprint: t.blueprint.map((r) => ({ skill: r.skill, complexity: r.complexity, count: r.count })),
    questions: t.questions.map((id) => id.toString()),
    attempts,
  });
});

/**
 * Edit a template. Once students have attempted it, only the title and
 * description can change: the questions and timing must stay as they sat them.
 */
teacherRoutes.put("/templates/:id", async (req, res) => {
  const teacher = await demoTeacher();
  const t = await findTemplate(req.params.id);
  const b = (req.body ?? {}) as Record<string, any>;
  const attempts = await AssessmentAttemptModel.countDocuments({ template: t._id });
  const wasPublished = t.status === "published";

  if (attempts > 0) {
    if (b.title !== undefined) t.title = b.title;
    if (b.description !== undefined) t.description = b.description;
  } else {
    const questions = b.questions === undefined
  ? t.questions
  : await validateTemplateQuestions(b.questions, b.subject, b.skills);

t.set(templateFields({ ...b, questions }));
    if (b.status === "published") t.status = "published";
    if (b.status === "draft") {
      if (t.assignments.length > 0) {
        throw new ApiError(409, "template_assigned", "This template is assigned to a class, so it can't go back to draft.");
      }
      t.status = "draft";
    }
  }

  try {
    await t.save();
  } catch (err) {
    rethrow(err, "invalid_template");
  }
  if (!wasPublished && t.status === "published") await auditTemplate(req, teacher._id, "template.publish", `Published “${t.title}”`);
  res.json({ id: t._id.toString(), status: t.status });
});

/** Copy a template as a new draft. Class assignments and attempts are not copied. */
teacherRoutes.post("/templates/:id/duplicate", async (req, res) => {
  const teacher = await demoTeacher();
  const src = await findTemplate(req.params.id);
  try {
    const copy = await AssessmentTemplateModel.create({
      title: `Copy of ${src.title}`.slice(0, 200),
      description: src.description,
      subject: src.subject,
      yearLevels: { min: src.yearLevels!.min, max: src.yearLevels!.max },
      curriculumLink: src.curriculumLink?.code ? { code: src.curriculumLink.code, description: src.curriculumLink.description } : undefined,
      skills: [...src.skills],
      difficulty: src.difficulty,
      durationMinutes: src.durationMinutes,
      blueprint: src.blueprint.map((r) => ({ skill: r.skill, complexity: r.complexity, count: r.count })),
      status: "draft",
      createdBy: teacher._id,
    });
    res.status(201).json({ id: copy._id.toString() });
  } catch (err) {
    rethrow(err, "invalid_template");
  }
});

/**
 * Launch: assign a published template to one of the teacher's classes with a
 * due date. Refuses if the item bank can't fill the blueprint, so students are
 * never given an assessment that can't be built.
 */
teacherRoutes.post("/templates/:id/launch", async (req, res) => {
  const teacher = await demoTeacher();
  const t = await findTemplate(req.params.id);
  const b = (req.body ?? {}) as Record<string, any>;

  if (t.status !== "published") throw new ApiError(409, "template_not_published", "Publish this template before launching it.");
  const classGroup = isValidObjectId(b.classGroup)
    ? await ClassGroupModel.findOne({ _id: b.classGroup, teachers: teacher._id, archived: false })
    : null;
  if (!classGroup) throw new ApiError(404, "class_not_found", "Choose one of your classes.");

  if (classGroup.subject.toLowerCase() !== t.subject.toLowerCase()) {
    throw new ApiError(
      400,
      "subject_mismatch",
      "This class does not match the assessment subject.",
    );
  }

  const classYear = classGroup.yearLevel;
  const templateYears = t.yearLevels;

  if (
    classYear != null &&
    templateYears != null &&
    (classYear < templateYears.min || classYear > templateYears.max)
  ) {
    throw new ApiError(
      400,
      "year_mismatch",
      "This assessment is not intended for this class year level.",
    );
  }

  const dueAt = new Date(b.dueAt);
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
    throw new ApiError(400, "invalid_due_date", "Choose a due date in the future.");
  }

  // Can the item bank fill every blueprint row? Rows for the same skill and complexity share the same pool.
// Validate manually selected questions, or check that the blueprint can be filled.
if (t.questions.length > 0) {
  const selectedQuestions = await AssessmentItemModel.find({
    _id: { $in: t.questions },
    status: "approved",
  });

  const selectedIds = new Set(selectedQuestions.map((item) => item._id.toString()));

  const invalidQuestions = t.questions.some((id) => {
    const item = selectedQuestions.find(
      (question) => question._id.toString() === id.toString()
    );

    return (
      !selectedIds.has(id.toString()) ||
      !item ||
      item.subject.toLowerCase() !== t.subject.toLowerCase() ||
      !t.skills.includes(item.skill)
    );
  });

  if (invalidQuestions) {
    throw new ApiError(
      409,
      "invalid_selected_questions",
      "One or more selected questions are no longer approved or do not match this template."
    );
  }
} else {
  // Can the item bank fill every blueprint row?
  const needed = new Map<string, { skill: SkillKey; complexity: number; count: number }>();

  for (const row of t.blueprint) {
    const key = `${row.skill}|${row.complexity}`;
    needed.set(key, {
      skill: row.skill,
      complexity: row.complexity,
      count: (needed.get(key)?.count ?? 0) + row.count,
    });
  }

  const shortages: string[] = [];

  for (const row of needed.values()) {
    const have = await AssessmentItemModel.countDocuments({
      status: "approved",
      subject: t.subject,
      skill: row.skill,
      complexity: row.complexity,
    });

    if (have < row.count) {
      shortages.push(
        `${skillName(row.skill)} at complexity ${row.complexity} needs ${row.count} approved questions but has ${have}`
      );
    }
  }

  if (shortages.length > 0) {
    throw new ApiError(
      409,
      "not_enough_questions",
      `The question bank can't fill this template: ${shortages.join("; ")}.`
    );
  }
}

  const existing = t.assignments.find((a) => a.classGroup.equals(classGroup._id));
  if (existing) existing.dueAt = dueAt;
  else t.assignments.push({ classGroup: classGroup._id, dueAt });
  await t.save();
  await auditTemplate(req, teacher._id, "template.launch", `Launched “${t.title}” to ${classGroup.name}`);
  res.json({ ok: true, className: classGroup.name, students: classGroup.students.length });
});

// ---- Question bank ----

type ItemDoc = InstanceType<typeof AssessmentItemModel>;

function itemJson(item: ItemDoc, used: boolean) {
  return {
    id: item._id.toString(),
    subject: item.subject,
    skill: item.skill,
    complexity: item.complexity,
    type: item.type,
    prompt: item.prompt,
    options: item.options.map((o) => ({ key: o.key, text: o.text })),
    correctOption: item.answer?.correctOption ?? "",
    modelAnswer: item.answer?.modelAnswer ?? "",
    rubric: item.answer?.rubric ?? "",
    points: item.points,
    status: item.status,
    source: item.source,
    used,
  };
}

/** The fields a request may set on a question. */
function itemFields(b: Record<string, any>) {
  const multipleChoice = b.type === "multiple_choice";
  return {
    subject: b.subject,
    skill: b.skill,
    complexity: b.complexity,
    type: b.type,
    prompt: b.prompt,
    options: multipleChoice ? (b.options ?? []) : [],
    answer: multipleChoice ? { correctOption: b.correctOption } : { modelAnswer: b.modelAnswer, rubric: b.rubric },
    points: b.points ?? 1,
  };
}

/** An approved question must say how it is marked. */
function assertMarkable(item: ItemDoc) {
  if (item.status !== "approved") return;
  if (item.type === "multiple_choice" && !item.answer?.correctOption) {
    throw new ApiError(400, "invalid_item", "Choose the correct option before approving a multiple-choice question.");
  }
  if (item.type === "short_response" && !item.answer?.modelAnswer && !item.answer?.rubric) {
    throw new ApiError(400, "invalid_item", "Add a model answer or marking guide before approving a short-response question.");
  }
}

/** How many approved questions exist per skill and complexity for a subject. Used to warn while building a blueprint. */
teacherRoutes.get("/items/availability", async (req, res) => {
  const subject = String(req.query.subject ?? "").trim();
  if (!subject) return res.json([]);
  const rows = await AssessmentItemModel.aggregate<{ _id: { skill: string; complexity: number }; count: number }>([
    { $match: { status: "approved", subject } },
    { $group: { _id: { skill: "$skill", complexity: "$complexity" }, count: { $sum: 1 } } },
  ]);
  res.json(rows.map((r) => ({ skill: r._id.skill, complexity: r._id.complexity, count: r.count })));
});

/** The question bank, newest first, with answers (this is the teacher's view). */
teacherRoutes.get("/items", async (req, res) => {
  const filter: Record<string, unknown> = {};
  const subject = String(req.query.subject ?? "").trim();
  if (subject) filter.subject = new RegExp(escapeRegExp(subject), "i");
  for (const key of ["skill", "type", "status"] as const) {
    const value = String(req.query[key] ?? "");
    if (value) filter[key] = value;
  }
  const items = await AssessmentItemModel.find(filter).select("+answer").sort({ createdAt: -1 }).limit(200);
  const used = new Set((await AssessmentAttemptModel.distinct("questions.item")).map(String));
  res.json(items.map((i) => itemJson(i, used.has(i._id.toString()))));
});

/** Write a question: multiple choice or short response. Saved as a draft, or approved straight away. */
teacherRoutes.post("/items", async (req, res) => {
  const teacher = await demoTeacher();
  const b = (req.body ?? {}) as Record<string, any>;
  const approved = b.status === "approved";
  const item = new AssessmentItemModel({
    ...itemFields(b),
    source: "teacher",
    status: approved ? "approved" : "draft",
    // A teacher approving their own question counts as the reviewing educator.
    review: approved ? { reviewedBy: teacher._id, reviewedAt: new Date() } : undefined,
    createdBy: teacher._id,
  });
  assertMarkable(item);
  try {
    await item.save();
  } catch (err) {
    rethrow(err, "invalid_item");
  }
  res.status(201).json(itemJson(item, false));
});

/**
 * Edit a question. Once it has been used in an attempt, its content is locked
 * (results were marked against it); only its status can change, so it can be retired.
 */
teacherRoutes.put("/items/:id", async (req, res) => {
  const teacher = await demoTeacher();

  const item = await AssessmentItemModel.findById(
    checkId(req.params.id, "item")
  ).select("+answer");

  if (!item) {
    throw new ApiError(404, "item_not_found", "That question doesn't exist");
  }

  const b = (req.body ?? {}) as Record<string, any>;

  const used = !!(await AssessmentAttemptModel.exists({
    "questions.item": item._id,
  }));

  const hasContentChanges = [
    "subject",
    "skill",
    "complexity",
    "type",
    "prompt",
    "options",
    "correctOption",
    "modelAnswer",
    "rubric",
    "points",
  ].some((key) => b[key] !== undefined);

  // Update question content only when content fields are supplied.
  if (hasContentChanges) {
    if (used) {
      throw new ApiError(
        409,
        "item_locked",
        "This question has been used in an assessment and its content cannot be changed."
      );
    }

    // Reconstruct the existing question, including its nested answer fields.
    const current = {
      subject: item.subject,
      skill: item.skill,
      complexity: item.complexity,
      type: item.type,
      prompt: item.prompt,
      options: item.options.map((option) => ({
        key: option.key,
        text: option.text,
      })),
      correctOption: item.answer?.correctOption ?? "",
      modelAnswer: item.answer?.modelAnswer ?? "",
      rubric: item.answer?.rubric ?? "",
      points: item.points,
    };

    // Merge the submitted changes with the existing question.
    item.set(itemFields({ ...current, ...b }));
  }

  // Update question status independently of content.
  if (["draft", "approved", "retired"].includes(b.status)) {
    item.status = b.status;

    if (b.status === "approved" && !item.review?.reviewedBy) {
      item.review = {
        reviewedBy: teacher._id,
        reviewedAt: new Date(),
      } as any;
    }
  }

  assertMarkable(item);

  try {
    await item.save();
  } catch (err) {
    rethrow(err, "invalid_item");
  }

  res.json(itemJson(item, used));
});

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Login",
  "assessment.start": "Assessment Started",
  "assessment.submit": "Assessment Submitted",
  "assessment.abandon": "Assessment Abandoned",
  "assessment.timeout": "Assessment Time Expired",
  "results.view": "Results Viewed",
  "record.export": "Student Record Exported",
  "template.publish": "Assessment Published",
  "template.launch": "Assessment Launched",
  "wallet.view": "Wallet Accessed",
  "wallet.share": "Wallet Shared",
  "wallet.coins.issue": "Skill Coins Issued",
  "verification.view": "Credential Verified",
  "db.seed": "Demo Data Loaded",
};

const STATUS_LABELS = { success: "Success", warning: "Warning", denied: "Warning", failure: "Error" } as const;

/** Access & Audit Logs: newest first, with a check of the hash chain. */
teacherRoutes.get("/audit-logs", async (_req, res) => {
  const entries = await AuditLogModel.find().sort({ seq: -1 }).limit(200).lean();
  const people = new Map(
    (await UserModel.find({ _id: { $in: entries.flatMap((e) => (e.actor ? [e.actor] : [])) } }, { firstName: 1, lastName: 1 }).lean()).map(
      (u) => [u._id.toString(), `${u.firstName} ${u.lastName}`],
    ),
  );
  const chain = await verifyAuditChain();

  res.json({
    lastUpdated: entries[0] ? formatTimestamp(entries[0].at) : "-",
    chain: chain.ok ? { ok: true, checked: chain.checked } : { ok: false, checked: chain.checked, brokenAt: chain.brokenAt, reason: chain.reason },
    logs: entries.map((e) => {
      const details = (e.details ?? {}) as { label?: string; reason?: string };
      let action = ACTION_LABELS[e.action] ?? capitalize(e.action.replace(/[._]/g, " "));
      if (e.action === "auth.login") action = e.status === "success" ? "Login Success" : "Login Attempt Failed";
      if (e.action === "results.view" && e.status === "denied") action = "Results View Blocked";
      return {
        id: `LOG-${String(e.seq).padStart(4, "0")}`,
        user: e.actor ? (people.get(e.actor.toString()) ?? "Unknown") : e.actorRole === "system" ? "System" : "Unknown",
        role: e.actorRole === "anonymous" ? "External" : capitalize(e.actorRole),
        action,
        resource: details.label ?? e.resource?.type ?? "-",
        ip: e.ip ?? "-",
        time: formatTimestamp(e.at),
        status: STATUS_LABELS[e.status ?? "success"],
        flag: e.status !== "success",
        reason: details.reason ?? null,
        hash: e.hash,
      };
    }),
  });
});
