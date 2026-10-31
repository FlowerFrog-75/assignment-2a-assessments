import {
  DIFFICULTY_LEVELS,
  MAX_COMPLEXITY,
  MIN_COMPLEXITY,
  SKILL_KEYS,
  TEMPLATE_STATUSES,
} from "../constants";
import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";

/**
 * One blueprint row: "draw `count` approved items for `skill` at
 * `complexity`". The assessment engine fills the blueprint from the item bank
 * using the attempt's seed, so the same seed always produces the same paper.
 */
const blueprintRowSchema = new Schema(
  {
    skill: { type: String, enum: SKILL_KEYS, required: true },
    complexity: { type: Number, required: true, min: MIN_COMPLEXITY, max: MAX_COMPLEXITY },
    count: { type: Number, required: true, min: 1, max: 50 },
  },
  { _id: false },
);

const assignmentSchema = new Schema(
  {
    classGroup: { type: Schema.Types.ObjectId, ref: "ClassGroup", required: true },
    assignedAt: { type: Date, default: Date.now },
    dueAt: { type: Date },
  },
  { _id: false },
);

/**
 * A teacher-defined assessment linked to a subject. Skills are assessed
 * through normal subject work, not as separate tests.
 */
const assessmentTemplateSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2_000 },
    subject: { type: String, required: true, trim: true, maxlength: 80 },
    yearLevels: {
      min: { type: Number, required: true, min: 1, max: 12 },
      max: { type: Number, required: true, min: 1, max: 12 },
    },
    /** Curriculum outcome this task evidences (e.g. an ACARA content code). */
    curriculumLink: {
      code: { type: String, trim: true, maxlength: 50 },
      description: { type: String, trim: true, maxlength: 500 },
    },
    skills: {
      type: [{ type: String, enum: SKILL_KEYS }],
      validate: [(v: unknown[]) => v.length > 0, "Select at least one skill"],
    },
    difficulty: { type: String, enum: DIFFICULTY_LEVELS, required: true },
    status: { type: String, enum: TEMPLATE_STATUSES, default: "draft" },
    durationMinutes: { type: Number, required: true, min: 1, max: 300 },
    blueprint: { type: [blueprintRowSchema], default: [] },
    assignments: { type: [assignmentSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: { type: Date },
  },
  {
    timestamps: true,
    virtuals: {
      questionCount: {
        get(this: { blueprint?: { count: number }[] }) {
          return (this.blueprint ?? []).reduce((total, row) => total + row.count, 0);
        },
      },
    },
    toJSON: { virtuals: true },
  },
);

assessmentTemplateSchema.pre("validate", function () {
  const skills = new Set<string>(this.skills);
  for (const row of this.blueprint) {
    if (!skills.has(row.skill)) {
      this.invalidate("blueprint", `Blueprint skill "${row.skill}" is not one of the template's skills`);
    }
  }
  if (this.status === "published" && this.blueprint.length === 0) {
    this.invalidate("blueprint", "A published template needs at least one blueprint row");
  }
  if (this.yearLevels && this.yearLevels.min > this.yearLevels.max) {
    this.invalidate("yearLevels", "yearLevels.min must not be greater than yearLevels.max");
  }
  if (this.status === "published" && !this.publishedAt) {
    this.publishedAt = new Date();
  }
});

assessmentTemplateSchema.index({ createdBy: 1, status: 1, updatedAt: -1 });
assessmentTemplateSchema.index({ subject: 1, status: 1 });
assessmentTemplateSchema.index({ "assignments.classGroup": 1, status: 1 });
assessmentTemplateSchema.index({ title: "text", description: "text" }); // "Search templates..."

export type AssessmentTemplate = InferSchemaType<typeof assessmentTemplateSchema>;
export type AssessmentTemplateDocument = HydratedDocumentFromSchema<typeof assessmentTemplateSchema>;
export const AssessmentTemplateModel = model("AssessmentTemplate", assessmentTemplateSchema);
