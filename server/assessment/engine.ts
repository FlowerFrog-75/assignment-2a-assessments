// The assessment engine: builds each student's paper from the item bank,
// and marks it.
//
// Papers are reproducible. Each attempt stores a random seed; the same seed,
// template and item bank always give the same questions in the same order,
// so a paper can be rebuilt later to check it.
import { createHash, randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import { SKILL_KEYS, type SkillKey } from "../db/constants";
import {
  AssessmentItemModel,
  type AssessmentAttemptDocument,
  type AssessmentTemplateDocument,
} from "../db/models";
import { ApiError } from "../api/data";

/** mulberry32: a small, fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turns any seed string into a 32-bit PRNG seed. */
export function seedNumber(seed: string, salt = ""): number {
  return createHash("sha256").update(`${seed}:${salt}`).digest().readUInt32BE(0);
}

export function newSeed(): string {
  return randomBytes(16).toString("hex");
}

/** Fisher-Yates shuffle driven by `random` (returns a new array). */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type PaperQuestion = { item: Types.ObjectId; skill: SkillKey; complexity: number; maxPoints: number };

/** How many approved items each blueprint row can draw from. */
export async function blueprintAvailability(template: Pick<AssessmentTemplateDocument, "subject" | "blueprint">) {
  return Promise.all(
    template.blueprint.map(async (row) => ({
      skill: row.skill,
      complexity: row.complexity,
      count: row.count,
      available: await AssessmentItemModel.countDocuments({ status: "approved", subject: template.subject, skill: row.skill, complexity: row.complexity }),
    })),
  );
}

/**
 * Draws the paper: for each blueprint row, `count` approved items of that
 * subject, skill and complexity, chosen by the seed. Then the whole paper is
 * shuffled (also by the seed).
 */
export async function buildPaper(template: AssessmentTemplateDocument, seed: string): Promise<PaperQuestion[]> {
  const chosen: PaperQuestion[] = [];
  for (const [index, row] of template.blueprint.entries()) {
    const pool = await AssessmentItemModel.find(
      { status: "approved", subject: template.subject, skill: row.skill, complexity: row.complexity },
      { _id: 1, points: 1, skill: 1, complexity: 1 },
    )
      .sort({ _id: 1 }) // a stable order, so the seed alone decides the draw
      .lean();
    if (pool.length < row.count) {
      throw new ApiError(
        409,
        "not_enough_items",
        `This assessment needs ${row.count} approved ${row.skill} items at complexity ${row.complexity} for ${template.subject}, but the item bank has ${pool.length}.`,
      );
    }
    for (const item of shuffle(pool, mulberry32(seedNumber(seed, `row-${index}`))).slice(0, row.count)) {
      chosen.push({ item: item._id, skill: item.skill as SkillKey, complexity: item.complexity, maxPoints: item.points ?? 1 });
    }
  }
  return shuffle(chosen, mulberry32(seedNumber(seed, "order")));
}

/** Australian A-E grades. */
export function gradeFor(percent: number): string {
  if (percent >= 85) return "A";
  if (percent >= 70) return "B";
  if (percent >= 50) return "C";
  if (percent >= 35) return "D";
  return "E";
}

/** Skill coins for a skill score: 10 coins per mark. */
export const COINS_PER_POINT = 10;

/**
 * Marks multiple-choice answers automatically. Short responses keep the
 * marks a teacher gave (or stay unmarked). Returns true if every question
 * now has a mark.
 */
export async function autoMark(attempt: AssessmentAttemptDocument): Promise<boolean> {
  const items = await AssessmentItemModel.find({ _id: { $in: attempt.questions.map((q) => q.item) } }).select("+answer").lean();
  const byId = new Map(items.map((i) => [i._id.toString(), i]));
  for (const question of attempt.questions) {
    const item = byId.get(question.item.toString());
    let response = attempt.responses.find((r) => r.item.equals(question.item));
    if (!response) {
      attempt.responses.push({ item: question.item });
      response = attempt.responses[attempt.responses.length - 1];
    }
    if (item?.type === "multiple_choice") {
      response.correct = Boolean(response.answer) && response.answer === item.answer?.correctOption;
      response.pointsAwarded = response.correct ? question.maxPoints : 0;
    } else if (!response.answer?.trim()) {
      response.correct = false;
      response.pointsAwarded = 0; // nothing written, nothing to mark
    }
  }
  return attempt.responses.every((r) => typeof r.pointsAwarded === "number");
}

/** Works out the result from the marks. Call once every question is marked. */
export function computeResult(attempt: AssessmentAttemptDocument, feedback?: string) {
  const perSkill = new Map<SkillKey, { score: number; maxScore: number }>();
  let score = 0;
  let maxScore = 0;
  for (const question of attempt.questions) {
    const points = attempt.responses.find((r) => r.item.equals(question.item))?.pointsAwarded ?? 0;
    const skill = question.skill as SkillKey;
    const totals = perSkill.get(skill) ?? { score: 0, maxScore: 0 };
    totals.score += points;
    totals.maxScore += question.maxPoints;
    perSkill.set(skill, totals);
    score += points;
    maxScore += question.maxPoints;
  }
  const pct = (s: number, m: number) => (m > 0 ? Math.round((s / m) * 100) : 0);
  const skillScores = SKILL_KEYS.filter((k) => perSkill.has(k)).map((skill) => {
    const t = perSkill.get(skill)!;
    return { skill, score: t.score, maxScore: t.maxScore, percent: pct(t.score, t.maxScore) };
  });
  const percent = pct(score, maxScore);
  return {
    score,
    maxScore,
    percent,
    grade: gradeFor(percent),
    skillScores,
    coinsAwarded: skillScores.reduce((total, s) => total + Math.round(s.score * COINS_PER_POINT), 0),
    feedback: feedback?.trim() || undefined,
  };
}
