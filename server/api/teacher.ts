// Routes behind the teacher screens: Class Results, Assessment Templates and
// Access Logs. Each returns the same shape as the mock data in its src/pages file.
import { Router } from "express";
import { SKILLS } from "../db/constants";
import {
  AssessmentAttemptModel,
  AssessmentTemplateModel,
  AuditLogModel,
  ClassGroupModel,
  UserModel,
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

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Login",
  "assessment.start": "Assessment Started",
  "assessment.submit": "Assessment Submitted",
  "assessment.abandon": "Assessment Abandoned",
  "assessment.timeout": "Assessment Time Expired",
  "results.view": "Results Viewed",
  "record.export": "Student Record Exported",
  "template.publish": "Assessment Published",
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
