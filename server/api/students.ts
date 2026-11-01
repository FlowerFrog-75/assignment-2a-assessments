// Routes behind the student screens and the teacher's Individual Results screen.
// Each returns the same shape as the mock data in the matching src/pages file.
import { Router } from "express";
import { currentUser, requireAuth, requireRole } from "../auth/session";
import { Types } from "mongoose";
import { SKILLS } from "../db/constants";
import {
  AchievementModel,
  AssessmentAttemptModel,
  AssessmentTemplateModel,
  ClassGroupModel,
  TeacherNoteModel,
  UserModel,
  WalletEventModel,
  appendAuditLog,
  currentSchool,
  hasConsent,
  walletBalances,
} from "../db/models";
import {
  ApiError,
  findStudent,
  teachesStudent,
  groupSkillAverages,
  releasedAttempts,
  skillTotals,
  skillTrends,
  templateLookup,
} from "./data";
import {
  SKILL_SHORT,
  average,
  dueLabel,
  formatDate,
  formatLongDay,
  formatShortDate,
  initials,
  levelLabel,
  signed,
  skillLevel,
} from "./format";

export const studentRoutes = Router();

/** Student Dashboard */
studentRoutes.get("/me/dashboard", requireAuth(), requireRole("student"), async (req, res) => {
  const student = currentUser(req);
  const released = await releasedAttempts(student._id);
  const inProgress = await AssessmentAttemptModel.find({ student: student._id, status: "in_progress" });
  const classes = await ClassGroupModel.find({ students: student._id, archived: false }, { _id: 1 }).lean();
  const assigned = await AssessmentTemplateModel.find({
    status: "published",
    "assignments.classGroup": { $in: classes.map((c) => c._id) },
  });
  const templates = await templateLookup([...released, ...inProgress].map((a) => a.template));
  const totals = skillTotals(released);
  const trends = skillTrends(released);
  const coins = new Map((await walletBalances(student._id)).map((b) => [b.skill, b.coins]));
  const dueDate = (templateId: string) =>
    assigned.find((t) => t._id.toString() === templateId)?.assignments.find((a) => classes.some((c) => c._id.equals(a.classGroup)))?.dueAt;

  const startedIds = new Set([...released, ...inProgress].map((a) => a.template.toString()));
  const activeAssessments = [
    ...inProgress.map((a) => {
      const done = a.responses.filter((r) => r.answer).length;
      return {
        id: a._id.toString(),
        title: templates.get(a.template.toString())?.title ?? "Assessment",
        subject: templates.get(a.template.toString())?.subject ?? "",
        due: dueLabel(dueDate(a.template.toString())),
        progress: Math.round((done / Math.max(1, a.questions.length)) * 100),
        questions: a.questions.length,
        done,
      };
    }),
    ...assigned
      .filter((t) => !startedIds.has(t._id.toString()))
      .map((t) => ({
        id: t._id.toString(),
        title: t.title,
        subject: t.subject,
        due: dueLabel(dueDate(t._id.toString())),
        progress: 0,
        questions: t.questionCount,
        done: 0,
      })),
  ];

  res.json({
    student: {
      firstName: student.firstName,
      subtitle: [formatLongDay(new Date()), student.yearLevel ? `Grade ${student.yearLevel}` : null, (await currentSchool())?.name].filter(Boolean).join(" · "),
    },
    stats: {
      active: activeAssessments.length,
      completed: released.length,
      averageScore: average(released.map((a) => a.result!.percent)),
      badges: await AchievementModel.countDocuments({ student: student._id }),
    },
    skills: SKILLS.map((skill) => ({
      name: skill.label,
      short: SKILL_SHORT[skill.key],
      score: totals[skill.key].percent,
      coins: coins.get(skill.key) ?? 0,
      trend: signed(trends[skill.key]),
    })),
    activeAssessments,
    completedAssessments: [...released].reverse().slice(0, 5).map((a) => ({
      id: a._id.toString(),
      title: templates.get(a.template.toString())?.title ?? "Assessment",
      subject: templates.get(a.template.toString())?.subject ?? "",
      date: formatDate(a.releasedAt),
      score: a.result!.percent,
      grade: a.result!.grade ?? "",
    })),
  });
});

/** Digital Skills Wallet */
studentRoutes.get("/me/wallet", requireAuth(), requireRole("student"), async (req, res) => {
  const student = currentUser(req);
  const released = await releasedAttempts(student._id);
  const totals = skillTotals(released);
  const coins = new Map((await walletBalances(student._id)).map((b) => [b.skill, b.coins]));
  const events = await WalletEventModel.find({ student: student._id }).sort({ createdAt: 1 }).lean();
  const achievements = await AchievementModel.find({ student: student._id }).sort({ awardedAt: -1 }).lean();

  // Coins held at the end of each month, for the bar chart.
  const monthly = new Map<string, number>();
  let running = 0;
  for (const event of events) {
    running += event.type === "issued" ? event.coins : -event.coins;
    monthly.set(event.createdAt.toLocaleDateString("en-AU", { month: "short", year: "2-digit" }), running);
  }
  // An achievement counts as verified once every coin from its evidence is committed on the ledger.
  const committedAttempt = (attemptId?: Types.ObjectId | null) => {
    const related = events.filter((e) => attemptId && e.sourceAttempt?.equals(attemptId));
    return related.length > 0 && related.every((e) => e.ledger?.status === "committed");
  };
  const assessedLevels = SKILLS.filter((s) => totals[s.key].assessed).map((s) => skillLevel(totals[s.key].percent));

  res.json({
    student: { name: `${student.firstName} ${student.lastName}`, grade: `Grade ${student.yearLevel}`, walletId: student.walletId },
    stats: {
      assessments: released.length,
      badges: achievements.length,
      levelAverage: assessedLevels.length ? (assessedLevels.reduce((a, b) => a + b, 0) / assessedLevels.length).toFixed(1) : "0",
    },
    skills: SKILLS.map((skill) => ({
      key: skill.key,
      name: skill.label,
      coins: coins.get(skill.key) ?? 0,
      level: totals[skill.key].assessed ? skillLevel(totals[skill.key].percent) : 0,
      maxLevel: 5,
      progress: totals[skill.key].percent,
    })),
    achievements: achievements.map((a) => ({
      id: a._id.toString(),
      code: a.code,
      title: a.title,
      desc: a.description ?? "",
      date: formatDate(a.awardedAt),
      verified: committedAttempt(a.evidence),
    })),
    coinHistory: [...monthly].slice(-6).map(([month, total]) => ({ month: month.split(" ")[0], coins: total })),
    ledger: {
      committed: events.filter((e) => e.ledger?.status === "committed").length,
      total: events.length,
    },
  });
});

/** Assessment Results: the student's most recently released result (or ?attempt=<id>). */
studentRoutes.get("/me/results/latest", requireAuth(), requireRole("student"), async (req, res) => {
  const student = currentUser(req);
  const requested = typeof req.query.attempt === "string" && Types.ObjectId.isValid(req.query.attempt) ? new Types.ObjectId(req.query.attempt) : null;
  const attempt = await AssessmentAttemptModel.findOne({ student: student._id, status: "released", ...(requested ? { _id: requested } : {}) }).sort({ releasedAt: -1 });
  if (!attempt?.result) throw new ApiError(404, "no_results", "You don't have any released results yet. They appear here once your teacher releases them.");
  const template = await AssessmentTemplateModel.findById(attempt.template);
  const classmates = await AssessmentAttemptModel.find({ template: attempt.template, status: "released" }, { result: 1 }).lean();
  const history = await AssessmentAttemptModel.find({ student: student._id, status: "released" }, { template: 1, releasedAt: 1 }).sort({ releasedAt: -1 }).lean();
  const historyTemplates = await templateLookup(history.map((a) => a.template));
  const minutes = attempt.submittedAt ? Math.round((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 60_000) : 0;

  res.json({
    title: template?.title ?? "Assessment",
    subtitle: `Completed ${formatDate(attempt.releasedAt)} · ${template?.subject ?? ""} · Grade ${student.yearLevel}`,
    totalScore: attempt.result.percent,
    classAvg: average(classmates.map((a) => a.result?.percent ?? 0)),
    grade: attempt.result.grade ?? "",
    attempts: history.map((a) => ({ id: a._id.toString(), title: historyTemplates.get(a.template.toString())?.title ?? "Assessment", date: formatDate(a.releasedAt) })),
    attemptId: attempt._id.toString(),
    feedback: attempt.result.feedback ?? "",
    timeTaken: `${minutes} min`,
    timeRemaining: `${Math.max(0, (template?.durationMinutes ?? minutes) - minutes)} min remaining`,
    coinsEarned: attempt.result.coinsAwarded,
    skillResults: attempt.result.skillScores.map((s) => ({
      skill: SKILL_SHORT[s.skill],
      score: s.percent,
      max: 100,
      level: levelLabel(s.percent),
    })),
    questionBreakdown: attempt.questions.map((q, i) => ({
      q: `Q${i + 1}`,
      score: attempt.responses.find((r) => r.item.equals(q.item))?.pointsAwarded ?? 0,
      max: q.maxPoints,
    })),
  });
});

/**
 * Individual Results (teacher view). Only shown if the student has given the
 * teacher consent, and only for students in the teacher's classes. Admins
 * can see every student (oversight). Every view, allowed or not, is written
 * to the audit log, which the student can see.
 */
studentRoutes.get("/students/:walletId/profile", requireAuth(), requireRole("teacher", "admin"), async (req, res) => {
  const student = await findStudent(String(req.params.walletId));
  const viewer = currentUser(req);
  const name = `${student.firstName} ${student.lastName}`;
  let denied: string | null = null;
  if (viewer.role === "teacher") {
    if (!(await teachesStudent(viewer._id, student._id))) denied = "not in your classes";
    else if (!(await hasConsent(student._id, viewer._id, "individual_results"))) denied = "no consent";
  }
  await appendAuditLog({
    actor: viewer._id,
    actorRole: viewer.role,
    action: "results.view",
    subjectStudent: student._id,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    status: denied ? "denied" : "success",
    details: { label: `${name}: individual results`, ...(denied ? { reason: denied } : {}) },
  });
  if (denied === "not in your classes") throw new ApiError(403, "forbidden", `${name} isn't in any of your classes.`);
  if (denied) throw new ApiError(403, "consent_required", `${name} hasn't given consent for teachers to see their individual results.`);

  const released = await releasedAttempts(student._id);
  const all = await AssessmentAttemptModel.find({ student: student._id }).sort({ startedAt: -1 });
  const templates = await templateLookup(all.map((a) => a.template));
  const totals = skillTotals(released);
  const classes = await ClassGroupModel.find({ students: student._id, ...(viewer.role === "teacher" ? { teachers: viewer._id } : {}) }).lean();
  const classmates = [...new Set(classes.flatMap((c) => c.students.map(String)))];
  const classAverages = await groupSkillAverages(classmates);
  const assessed = SKILLS.filter((s) => totals[s.key].assessed);
  const ranked = [...assessed].sort((a, b) => totals[b.key].percent - totals[a.key].percent);
  const overall = average(released.map((a) => a.result!.percent));
  const previous = average(released.slice(0, -1).map((a) => a.result!.percent));
  const notes = await TeacherNoteModel.find({ student: student._id }).sort({ createdAt: -1 }).lean();
  const authors = new Map(
    (await UserModel.find({ _id: { $in: notes.map((n) => n.author) } }, { firstName: 1, lastName: 1 }).lean()).map((u) => [
      u._id.toString(),
      `${u.firstName} ${u.lastName}`,
    ]),
  );

  res.json({
    student: {
      name,
      id: student.walletId,
      grade: `Grade ${student.yearLevel}`,
      avatar: initials(name),
      overall,
      trend: released.length > 1 ? `${signed(overall - previous)}% since last result` : "First results this term",
      topSkill: ranked[0] ? ranked[0].label : "-",
      focusArea: ranked.at(-1) ? ranked.at(-1)!.label : "-",
      assessments: all.map((a) => ({
        title: templates.get(a.template.toString())?.title ?? "Assessment",
        subject: templates.get(a.template.toString())?.subject ?? "",
        date: formatShortDate(a.releasedAt ?? a.startedAt),
        score: a.result?.percent ?? 0,
        status: a.status === "released" ? "Graded" : "In Progress",
      })),
      skills: SKILLS.map((skill) => ({
        name: skill.label,
        short: SKILL_SHORT[skill.key],
        score: totals[skill.key].percent,
        level: totals[skill.key].assessed ? skillLevel(totals[skill.key].percent) : 0,
        classAvg: classAverages[skill.key],
      })),
      notes: notes.map((n) => ({
        date: formatShortDate(n.createdAt),
        teacher: authors.get(n.author.toString()) ?? "Teacher",
        note: n.body,
      })),
    },
  });
});

/** POST /api/students/:walletId/notes { body }: a teacher's note (needs the same access as viewing). */
studentRoutes.post("/students/:walletId/notes", requireAuth(), requireRole("teacher", "admin"), async (req, res) => {
  const student = await findStudent(String(req.params.walletId));
  const viewer = currentUser(req);
  if (viewer.role === "teacher") {
    if (!(await teachesStudent(viewer._id, student._id))) throw new ApiError(403, "forbidden", "This student isn't in any of your classes.");
    if (!(await hasConsent(student._id, viewer._id, "individual_results"))) throw new ApiError(403, "consent_required", "This student hasn't given you consent.");
  }
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) throw new ApiError(400, "empty_note", "Write a note first");
  await TeacherNoteModel.create({ student: student._id, author: viewer._id, body: body.slice(0, 2000) });
  await appendAuditLog({
    actor: viewer._id,
    actorRole: viewer.role,
    action: "note.create",
    subjectStudent: student._id,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    status: "success",
    details: { label: `${student.firstName} ${student.lastName}: note added` },
  });
  res.status(201).json({ ok: true });
});
