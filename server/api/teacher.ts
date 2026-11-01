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
import { currentUser, requireAuth, requireRole } from "../auth/session";
import { ApiError, groupSkillAverages, skillTotals } from "./data";
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

/** Class Results: one of the teacher's classes (admins: any class). */
teacherRoutes.get("/classes/current/results", requireAuth(), requireRole("teacher", "admin"), async (req, res) => {
  const viewer = currentUser(req);
  // Teachers see their own classes; admins can open any class.
  const scope = viewer.role === "teacher" ? { teachers: viewer._id, archived: false } : { archived: false };
  const classes = await ClassGroupModel.find(scope, { name: 1 }).sort({ name: 1 }).lean();
  const requested = typeof req.query.classId === "string" ? req.query.classId : undefined;
  const chosen = classes.find((c) => c._id.toString() === requested) ?? classes[0];
  if (!chosen) {
    throw new ApiError(404, "class_not_found", viewer.role === "teacher" ? "You haven't been assigned to a class yet. Ask an administrator." : "No classes have been set up yet.");
  }
  const classGroup = (await ClassGroupModel.findById(chosen._id))!;
  const teacherDocs = await UserModel.find({ _id: { $in: classGroup.teachers } }, { firstName: 1, lastName: 1 }).lean();
  const teacherNames = teacherDocs.map((t) => `${t.firstName} ${t.lastName}`).join(", ");
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
      // null = not assessed yet (shown as a dash, not 0)
      skills: Object.fromEntries(SKILLS.map((s) => [SKILL_TABLE_KEY[s.key], totals[s.key].assessed ? totals[s.key].percent : null])),
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
      subtitle: [classGroup.yearLevel ? `Grade ${classGroup.yearLevel}` : classGroup.subject, teacherNames, classGroup.term ? `Term ${classGroup.term}, ${classGroup.academicYear}` : String(classGroup.academicYear)].filter(Boolean).join(" · "),
    },
    classes: classes.map((c) => ({ id: c._id.toString(), name: c.name })),
    classId: classGroup._id.toString(),
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
teacherRoutes.get("/templates", requireAuth(), requireRole("teacher", "admin"), async (_req, res) => {
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
  "auth.logout": "Logout",
  "auth.2fa": "2FA Code Rejected",
  "auth.2fa.enable": "2FA Turned On",
  "auth.password.change": "Password Changed",
  "assessment.start": "Assessment Started",
  "assessment.submit": "Assessment Submitted",
  "results.view": "Results Viewed",
  "results.release": "Results Released",
  "marking.view": "Work Opened for Marking",
  "marking.save": "Marks Saved",
  "note.create": "Teacher Note Added",
  "consent.grant": "Consent Given",
  "consent.revoke": "Consent Withdrawn",
  "verification.create": "Verification Link Created",
  "verification.revoke": "Verification Link Revoked",
  "verification.view": "Credential Verified",
  "item.create": "Question Added",
  "item.update": "Question Edited",
  "item.approve": "Question Approved",
  "item.reject": "Question Rejected",
  "item.retire": "Question Retired",
  "item.import": "Questions Imported",
  "template.create": "Template Created",
  "template.update": "Template Edited",
  "template.publish": "Assessment Published",
  "template.unpublish": "Assessment Unpublished",
  "template.archive": "Template Archived",
  "template.assign": "Assessment Assigned",
  "template.unassign": "Assessment Unassigned",
  "school.update": "School Settings Changed",
  "user.create": "Account Created",
  "user.update": "Account Updated",
  "user.password.reset": "Password Reset by Admin",
  "user.2fa.reset": "2FA Reset by Admin",
  "user.unlock": "Account Unlocked",
  "user.sessions.end": "Signed Out Everywhere",
  "class.create": "Class Created",
  "class.update": "Class Updated",
  "wallet.coins.issue": "Skill Coins Issued",
  "wallet.coins.revoke": "Skill Coins Revoked",
  "ledger.sync": "Blockchain Sync",
};

const STATUS_LABELS = { success: "Success", warning: "Warning", denied: "Warning", failure: "Error" } as const;

/** Access & Audit Logs: newest first, with a check of the hash chain. */
teacherRoutes.get("/audit-logs", requireAuth(), async (req, res) => {
  // Admins see everything. Teachers see their own actions and events about
  // their students. Students see who accessed their data.
  const viewer = currentUser(req);
  let filter = {};
  if (viewer.role === "teacher") {
    const classes = await ClassGroupModel.find({ teachers: viewer._id }, { students: 1 }).lean();
    filter = { $or: [{ actor: viewer._id }, { subjectStudent: { $in: classes.flatMap((c) => c.students) } }] };
  } else if (viewer.role === "student") {
    filter = { $or: [{ subjectStudent: viewer._id }, { actor: viewer._id }] };
  }
  const entries = await AuditLogModel.find(filter).sort({ seq: -1 }).limit(300).lean();
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
