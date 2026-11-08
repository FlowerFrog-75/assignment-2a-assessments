import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";

/** One step of an agent run, shown to the teacher as a timeline. */
const stepSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    actor: { type: String, enum: ["author", "validator", "system"], required: true },
    text: { type: String, required: true, maxlength: 1_000 },
  },
  { _id: false },
);

/**
 * A run of the AI question generator. The teacher watches its steps live,
 * then reviews the questions it queued (nothing is used until approved).
 */
const aiJobSchema = new Schema(
  {
    kind: { type: String, enum: ["generate_items"], required: true },
    status: { type: String, enum: ["queued", "running", "succeeded", "failed"], default: "queued" },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    params: { type: Schema.Types.Mixed },
    mode: { type: String, enum: ["claude", "offline"], required: true },
    model: { type: String },
    steps: { type: [stepSchema], default: [] },
    queuedItems: { type: [{ type: Schema.Types.ObjectId, ref: "AssessmentItem" }], default: [] },
    draftItems: { type: [{ type: Schema.Types.ObjectId, ref: "AssessmentItem" }], default: [] },
    usage: { inputTokens: { type: Number, default: 0 }, outputTokens: { type: Number, default: 0 } },
    error: { type: String, maxlength: 2_000 },
    finishedAt: { type: Date },
  },
  { timestamps: true },
);

aiJobSchema.index({ requestedBy: 1, createdAt: -1 });

export type AiJob = InferSchemaType<typeof aiJobSchema>;
export type AiJobDocument = HydratedDocumentFromSchema<typeof aiJobSchema>;
export const AiJobModel = model("AiJob", aiJobSchema);
