import { createHash } from "node:crypto";

/** Minimal shape of a released assessment attempt (an AssessmentAttempt document fits). */
export type EvidenceSource = {
  _id: { toString(): string };
  template: { toString(): string };
  seed: string;
  releasedAt?: Date | null;
  responses: { item: { toString(): string }; answer?: string | null; pointsAwarded?: number | null }[];
  result?: {
    score: number;
    maxScore: number;
    percent: number;
    grade?: string | null;
    coinsAwarded?: number | null;
    skillScores: { skill: string; score: number; maxScore: number; percent: number }[];
  } | null;
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * SHA-256 fingerprint of a released assessment result: the student's
 * answers, marks, per-skill scores and grade. It is written to the ledger
 * when coins are issued. Recomputing it later from MongoDB and comparing
 * shows whether the result has changed since then. The result itself (and
 * any personal data) stays off-chain.
 *
 * Changing these fields changes every hash. Bump `v` if you ever do.
 */
export function computeEvidenceHash(attempt: EvidenceSource, walletId: string): string {
  const result = attempt.result;
  if (!result) throw new Error(`Attempt ${attempt._id.toString()} has no released result to fingerprint`);

  const payload = {
    v: 1,
    attempt: attempt._id.toString(),
    template: attempt.template.toString(),
    walletId,
    seed: attempt.seed,
    releasedAt: attempt.releasedAt ? attempt.releasedAt.toISOString() : null,
    responses: attempt.responses
      .map((r) => ({ item: r.item.toString(), answer: r.answer ?? null, points: r.pointsAwarded ?? null }))
      .sort((a, b) => a.item.localeCompare(b.item)),
    score: result.score,
    maxScore: result.maxScore,
    percent: result.percent,
    grade: result.grade ?? null,
    coinsAwarded: result.coinsAwarded ?? null,
    skillScores: result.skillScores
      .map((s) => ({ skill: s.skill, score: s.score, maxScore: s.maxScore, percent: s.percent }))
      .sort((a, b) => a.skill.localeCompare(b.skill)),
  };
  return createHash("sha256").update(stableStringify(payload), "utf8").digest("hex");
}
