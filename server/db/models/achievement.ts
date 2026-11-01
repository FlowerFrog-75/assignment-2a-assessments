import { SKILL_KEYS } from "../constants";
import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";

/** A badge earned by a student, e.g. "Research Pioneer" or "First Assessment". */
const achievementSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true },
    code: { type: String, required: true, trim: true, lowercase: true, maxlength: 60 }, // e.g. "research-pioneer"
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    skill: { type: String, enum: SKILL_KEYS },
    /** The attempt that earned the badge, kept as evidence. */
    evidence: { type: Schema.Types.ObjectId, ref: "AssessmentAttempt" },
    awardedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

achievementSchema.index({ student: 1, code: 1 }, { unique: true }); // each badge once per student

export type Achievement = InferSchemaType<typeof achievementSchema>;
export type AchievementDocument = HydratedDocumentFromSchema<typeof achievementSchema>;
export const AchievementModel = model("Achievement", achievementSchema);
