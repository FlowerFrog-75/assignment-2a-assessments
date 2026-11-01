// Shared queries for the API routes.
import type { Types } from "mongoose";
import { SKILL_KEYS, type SkillKey } from "../db/constants";
import {
  AssessmentAttemptModel,
  AssessmentTemplateModel,
  ClassGroupModel,
  UserModel,
  type AssessmentAttemptDocument,
} from "../db/models";
import { percent } from "./format";

/** An error the API turns into a JSON response with this status code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function findStudent(walletId: string) {
  const student = await UserModel.findOne({ walletId: walletId.toUpperCase(), role: "student" });
  if (!student) throw new ApiError(404, "student_not_found", `No student with wallet ID ${walletId}`);
  return student;
}

/** True if the teacher teaches the student in at least one active class. */
export async function teachesStudent(teacherId: Types.ObjectId, studentId: Types.ObjectId): Promise<boolean> {
  return (await ClassGroupModel.exists({ teachers: teacherId, students: studentId, archived: false })) !== null;
}

export type SkillTotals = Record<SkillKey, { score: number; maxScore: number; percent: number; assessed: boolean }>;

/** Per-skill totals across a set of released attempts. */
export function skillTotals(attempts: AssessmentAttemptDocument[]): SkillTotals {
  const totals = Object.fromEntries(
    SKILL_KEYS.map((key) => [key, { score: 0, maxScore: 0, percent: 0, assessed: false }]),
  ) as SkillTotals;
  for (const attempt of attempts) {
    for (const s of attempt.result?.skillScores ?? []) {
      totals[s.skill].score += s.score;
      totals[s.skill].maxScore += s.maxScore;
      totals[s.skill].assessed = true;
    }
  }
  for (const key of SKILL_KEYS) totals[key].percent = percent(totals[key].score, totals[key].maxScore);
  return totals;
}

/** How each skill's percentage changed with the student's most recent result for it. */
export function skillTrends(releasedOldestFirst: AssessmentAttemptDocument[]): Record<SkillKey, number> {
  const now = skillTotals(releasedOldestFirst);
  return Object.fromEntries(
    SKILL_KEYS.map((key) => {
      const lastIndex = releasedOldestFirst.findLastIndex((a) => a.result?.skillScores.some((s) => s.skill === key));
      if (lastIndex < 0) return [key, 0];
      const before = skillTotals(releasedOldestFirst.filter((_, i) => i !== lastIndex))[key];
      return [key, before.assessed ? now[key].percent - before.percent : 0];
    }),
  ) as Record<SkillKey, number>;
}

/** Released attempts for a student, oldest first. */
export function releasedAttempts(studentId: Types.ObjectId) {
  return AssessmentAttemptModel.find({ student: studentId, status: "released" }).sort({ releasedAt: 1 });
}

/** Template titles and subjects by ID. */
export async function templateLookup(ids: Types.ObjectId[]) {
  const templates = await AssessmentTemplateModel.find({ _id: { $in: ids } }, { title: 1, subject: 1, durationMinutes: 1 }).lean();
  return new Map(templates.map((t) => [t._id.toString(), t]));
}

/** Average skill percentage across a group of students (each student counts once). */
export async function groupSkillAverages(studentIds: (Types.ObjectId | string)[]): Promise<Record<SkillKey, number>> {
  const attempts = await AssessmentAttemptModel.find({ student: { $in: studentIds }, status: "released" });
  const byStudent = new Map<string, AssessmentAttemptDocument[]>();
  for (const attempt of attempts) {
    const key = attempt.student.toString();
    byStudent.set(key, [...(byStudent.get(key) ?? []), attempt]);
  }
  const perStudent = [...byStudent.values()].map(skillTotals);
  return Object.fromEntries(
    SKILL_KEYS.map((key) => {
      const values = perStudent.filter((t) => t[key].assessed).map((t) => t[key].percent);
      return [key, values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0];
    }),
  ) as Record<SkillKey, number>;
}
