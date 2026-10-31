import { createHash, randomBytes } from "node:crypto";
import { SKILL_KEYS, type SkillKey } from "../constants";
import { Schema, Types, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * A shareable public verification link that the student controls. It reveals
 * only the skills the student picked (selective disclosure), and the student
 * can revoke it or let it expire.
 *
 * The database stores only a SHA-256 hash of the token, so a leaked database
 * cannot be used to open anyone's links.
 */
const verificationLinkSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    /** Note for the student, e.g. "Work experience application, Acme Labs". */
    label: { type: String, trim: true, maxlength: 200 },
    disclosedSkills: {
      type: [{ type: String, enum: SKILL_KEYS }],
      validate: [(v: unknown[]) => v.length > 0, "Share at least one skill"],
    },
    includeAchievements: { type: Boolean, default: false },
    expiresAt: { type: Date },
    revokedAt: { type: Date },
    viewCount: { type: Number, default: 0, min: 0 },
    lastViewedAt: { type: Date },
  },
  { timestamps: true },
);

verificationLinkSchema.index({ student: 1, createdAt: -1 });

export type VerificationLink = InferSchemaType<typeof verificationLinkSchema>;
export type VerificationLinkDocument = HydratedDocumentFromSchema<typeof verificationLinkSchema>;
export const VerificationLinkModel = model("VerificationLink", verificationLinkSchema);

/**
 * Creates a link and returns the raw token. The token is shown to the student
 * once and is not stored.
 */
export async function createVerificationLink(input: {
  student: Types.ObjectId | string;
  disclosedSkills: SkillKey[];
  includeAchievements?: boolean;
  label?: string;
  expiresAt?: Date;
}) {
  const token = randomBytes(32).toString("base64url");
  const link = await VerificationLinkModel.create({ ...input, tokenHash: hashVerificationToken(token) });
  return { link, token };
}

/**
 * Looks up an active (not revoked, not expired) link by its raw token and
 * records the view. Returns null for unknown, revoked or expired tokens.
 */
export function resolveVerificationToken(token: string) {
  const now = new Date();
  return VerificationLinkModel.findOneAndUpdate(
    {
      tokenHash: hashVerificationToken(token),
      revokedAt: { $exists: false },
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
    },
    { $inc: { viewCount: 1 }, $set: { lastViewedAt: now } },
    { returnDocument: "after" },
  );
}
