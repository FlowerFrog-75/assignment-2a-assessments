import {
  ATTEMPT_STATUSES,
  MAX_COMPLEXITY,
  MIN_COMPLEXITY,
  SKILL_KEYS,
  type SkillKey,
} from "../constants";
import { Schema, Types, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";

/** A question as served in this attempt, fixed when the attempt starts. */
const questionSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: "AssessmentItem", required: true },
    skill: { type: String, enum: SKILL_KEYS, required: true },
    complexity: { type: Number, required: true, min: MIN_COMPLEXITY, max: MAX_COMPLEXITY },
    maxPoints: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const responseSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: "AssessmentItem", required: true },
    answer: { type: String, maxlength: 10_000 }, // option key or written response
    flagged: { type: Boolean, default: false }, // "Flag for review"
    answeredAt: { type: Date },
    // Filled in at marking.
    correct: { type: Boolean },
    pointsAwarded: { type: Number, min: 0 },
  },
  { _id: false },
);

const skillScoreSchema = new Schema(
  {
    skill: { type: String, enum: SKILL_KEYS, required: true },
    score: { type: Number, required: true, min: 0 },
    maxScore: { type: Number, required: true, min: 0 },
    percent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false },
);

const resultSchema = new Schema(
  {
    score: { type: Number, required: true, min: 0 },
    maxScore: { type: Number, required: true, min: 0 },
    percent: { type: Number, required: true, min: 0, max: 100 },
    grade: { type: String, trim: true, maxlength: 5 },
    skillScores: { type: [skillScoreSchema], default: [] },
    coinsAwarded: { type: Number, default: 0, min: 0 },
    feedback: { type: String, trim: true, maxlength: 5_000 },
  },
  { _id: false },
);

export type SkillSummaryRow = {
  skill: SkillKey;
  score: number;
  maxScore: number;
  percent: number;
  assessments: number;
};

/**
 * One student's sitting of an assessment, from start to results. Students
 * see `result` only after it is released.
 */
const assessmentAttemptSchema = new Schema(
  {
    template: { type: Schema.Types.ObjectId, ref: "AssessmentTemplate", required: true },
    student: { type: Schema.Types.ObjectId, ref: "User", required: true },
    classGroup: { type: Schema.Types.ObjectId, ref: "ClassGroup" },
    /** The engine's random seed. The same seed and item bank give the same paper. */
    seed: { type: String, required: true, maxlength: 128 },
    status: { type: String, enum: ATTEMPT_STATUSES, default: "in_progress" },
    questions: { type: [questionSchema], default: [] },
    responses: { type: [responseSchema], default: [] },
    startedAt: { type: Date, default: Date.now },
    /** When the countdown timer runs out. */
    endsAt: { type: Date },
    /** Last autosave, used when a student resumes after disconnecting. */
    lastSavedAt: { type: Date },
    submittedAt: { type: Date },
    markedAt: { type: Date },
    markedBy: { type: Schema.Types.ObjectId, ref: "User" },
    releasedAt: { type: Date },
    result: { type: resultSchema },
  },
  { timestamps: true },
);

// One unfinished attempt per student per template, so a student resumes it
// rather than starting a fresh paper.
assessmentAttemptSchema.index(
  { student: 1, template: 1 },
  { unique: true, partialFilterExpression: { status: "in_progress" } },
);
assessmentAttemptSchema.index({ student: 1, status: 1, releasedAt: -1 }); // student dashboard
assessmentAttemptSchema.index({ classGroup: 1, status: 1 }); // class results
assessmentAttemptSchema.index({ template: 1, status: 1 }); // completion rates

export type AssessmentAttempt = InferSchemaType<typeof assessmentAttemptSchema>;
export type AssessmentAttemptDocument = HydratedDocumentFromSchema<typeof assessmentAttemptSchema>;
export const AssessmentAttemptModel = model("AssessmentAttempt", assessmentAttemptSchema);

type IdLike = Types.ObjectId | string;

/**
 * Per-skill totals across released attempts. Filter by student for a skills
 * profile, by classGroup for class averages, or by template.
 */
export function skillSummary(filter: { student?: IdLike; classGroup?: IdLike; template?: IdLike }) {
  const match: Record<string, unknown> = { status: "released" };
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined) match[key] = new Types.ObjectId(String(value));
  }
  return AssessmentAttemptModel.aggregate<SkillSummaryRow>([
    { $match: match },
    { $unwind: "$result.skillScores" },
    {
      $group: {
        _id: "$result.skillScores.skill",
        score: { $sum: "$result.skillScores.score" },
        maxScore: { $sum: "$result.skillScores.maxScore" },
        assessments: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        skill: "$_id",
        score: 1,
        maxScore: 1,
        assessments: 1,
        percent: {
          $cond: [
            { $gt: ["$maxScore", 0] },
            { $round: [{ $multiply: [{ $divide: ["$score", "$maxScore"] }, 100] }, 0] },
            0,
          ],
        },
      },
    },
    { $sort: { skill: 1 } },
  ]);
}
