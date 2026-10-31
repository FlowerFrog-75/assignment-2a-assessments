import { CONSENT_SCOPES, type ConsentScope } from "../constants";
import { Schema, Types, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";

/**
 * A student's permission for a teacher to see their individual data.
 * Without an active consent, teachers only see class-level results.
 * Revoking sets `active: false` and keeps the record for the audit trail.
 */
const consentSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true },
    grantee: { type: Schema.Types.ObjectId, ref: "User", required: true },
    scope: { type: String, enum: CONSENT_SCOPES, required: true },
    active: { type: Boolean, default: true },
    grantedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date },
  },
  { timestamps: true },
);

consentSchema.pre("validate", function () {
  if (!this.active && !this.revokedAt) this.revokedAt = new Date();
});

// At most one active consent per student, teacher and scope.
consentSchema.index(
  { student: 1, grantee: 1, scope: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
consentSchema.index({ grantee: 1, scope: 1, active: 1 });

export type Consent = InferSchemaType<typeof consentSchema>;
export type ConsentDocument = HydratedDocumentFromSchema<typeof consentSchema>;
export const ConsentModel = model("Consent", consentSchema);

/** True if the student currently allows `grantee` to see data in `scope`. */
export async function hasConsent(
  student: Types.ObjectId | string,
  grantee: Types.ObjectId | string,
  scope: ConsentScope,
): Promise<boolean> {
  return (await ConsentModel.exists({ student, grantee, scope, active: true })) !== null;
}
