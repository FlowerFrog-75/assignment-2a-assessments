import { createHash, randomBytes } from "node:crypto";
import { SKILL_KEYS, type SkillKey } from "../constants";
import { Schema, Types, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";

// Verification codes look like "K7Q2-M9XD-4PLA": 12 random characters from an
// alphabet without look-alikes (no I, O, 0 or 1), which is 60 random bits.
// They're short enough to type from a CV, and still impossible to guess
// before they expire.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols = 5 bits each
const CODE_LENGTH = 12;

function generateVerificationCode(): string {
  const chars = [...randomBytes(CODE_LENGTH)].map((byte) => CODE_ALPHABET[byte % 32]); // 256 % 32 = 0, so no bias
  return [0, 4, 8].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

/** Accepts codes typed in any case, with or without dashes or spaces. */
export function normalizeVerificationCode(input: string): string {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact.length === CODE_LENGTH
    ? [0, 4, 8].map((i) => compact.slice(i, i + 4)).join("-")
    : input.trim();
}

export function hashVerificationToken(code: string): string {
  return createHash("sha256").update(normalizeVerificationCode(code), "utf8").digest("hex");
}

/**
 * A shareable public verification link that the student controls. It reveals
 * only the skills the student picked (selective disclosure), and the student
 * can revoke it or let it expire.
 *
 * The database stores only a SHA-256 hash of the code, so a leaked database
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
 * Creates a link and returns its verification code. The code is shown to the
 * student once and is not stored.
 */
export async function createVerificationLink(input: {
  student: Types.ObjectId | string;
  disclosedSkills: SkillKey[];
  includeAchievements?: boolean;
  label?: string;
  expiresAt?: Date;
}) {
  const code = generateVerificationCode();
  const link = await VerificationLinkModel.create({ ...input, tokenHash: hashVerificationToken(code) });
  return { link, code };
}

/**
 * Looks up an active (not revoked, not expired) link by its code and records
 * the view. Returns null for unknown, revoked or expired codes.
 */
export function resolveVerificationToken(code: string) {
  const now = new Date();
  return VerificationLinkModel.findOneAndUpdate(
    {
      tokenHash: hashVerificationToken(code),
      revokedAt: { $exists: false },
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
    },
    { $inc: { viewCount: 1 }, $set: { lastViewedAt: now } },
    { returnDocument: "after" },
  );
}
