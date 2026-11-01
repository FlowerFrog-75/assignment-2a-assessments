import {
  ITEM_SOURCES,
  ITEM_STATUSES,
  ITEM_TYPES,
  MAX_COMPLEXITY,
  MIN_COMPLEXITY,
  SKILL_KEYS,
} from "../constants";
import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";

const optionSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 5 }, // "A", "B", ...
    text: { type: String, required: true, trim: true, maxlength: 1_000 },
  },
  { _id: false },
);

/** Marking information. Hidden by default so it is never sent to students. */
const answerSchema = new Schema(
  {
    correctOption: { type: String, trim: true }, // multiple choice
    modelAnswer: { type: String, trim: true, maxlength: 5_000 }, // short response
    rubric: { type: String, trim: true, maxlength: 5_000 }, // short response marking guide
  },
  { _id: false },
);

/** Details for AI-drafted items: how the item was generated and the AI's own validation check. */
const generationSchema = new Schema(
  {
    model: { type: String, trim: true },
    promptVersion: { type: String, trim: true },
    generatedAt: { type: Date },
    validation: {
      passed: { type: Boolean },
      notes: { type: String, maxlength: 5_000 },
      validatedAt: { type: Date },
    },
  },
  { _id: false },
);

/**
 * One question in the item bank. Items are tagged by subject, skill and
 * complexity, and templates draw on them through their blueprint.
 */
const assessmentItemSchema = new Schema(
  {
    subject: { type: String, required: true, trim: true, maxlength: 80 },
    skill: { type: String, enum: SKILL_KEYS, required: true },
    complexity: { type: Number, required: true, min: MIN_COMPLEXITY, max: MAX_COMPLEXITY },
    type: { type: String, enum: ITEM_TYPES, required: true },
    prompt: { type: String, required: true, trim: true, maxlength: 5_000 },
    options: { type: [optionSchema], default: [] },
    answer: { type: answerSchema, select: false },
    /** Base marks. Scoring may weight these by complexity. */
    points: { type: Number, default: 1, min: 0, max: 100 },
    source: { type: String, enum: ITEM_SOURCES, required: true },
    generation: { type: generationSchema },
    status: { type: String, enum: ITEM_STATUSES, default: "draft" },
    review: {
      reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
      reviewedAt: { type: Date },
      comments: { type: String, trim: true, maxlength: 2_000 },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

assessmentItemSchema.pre("validate", function () {
  if (this.type === "multiple_choice") {
    if (this.options.length < 2) {
      this.invalidate("options", "Multiple-choice items need at least two options");
    }
    const keys = this.options.map((option) => option.key);
    if (new Set(keys).size !== keys.length) {
      this.invalidate("options", "Option keys must be unique");
    }
    const correct = this.answer?.correctOption;
    if (correct && !keys.includes(correct)) {
      this.invalidate("answer.correctOption", `"${correct}" is not one of the option keys`);
    }
  }

  // Educator approval is required before an item can be used.
  if (this.status === "approved" && !this.review?.reviewedBy) {
    this.invalidate("status", "An item can only be approved by a reviewing educator (review.reviewedBy)");
  }
  if (this.status === "approved" && this.isSelected("answer") && !this.answer) {
    this.invalidate("answer", "An approved item needs marking information");
  }
});

// Matches how the engine looks up items: approved, by subject, skill and complexity.
assessmentItemSchema.index({ status: 1, subject: 1, skill: 1, complexity: 1 });
assessmentItemSchema.index({ source: 1, status: 1, createdAt: -1 }); // teacher review queue

export type AssessmentItem = InferSchemaType<typeof assessmentItemSchema>;
export type AssessmentItemDocument = HydratedDocumentFromSchema<typeof assessmentItemSchema>;
export const AssessmentItemModel = model("AssessmentItem", assessmentItemSchema);
