import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";

/**
 * A signed-in browser. The cookie holds a random token. Only its SHA-256
 * hash is stored here, so a copy of the database can't be used to take
 * over anyone's session. MongoDB deletes sessions automatically once they expire.
 */
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /** Password accepted, but the 2FA code hasn't been entered yet. */
    pendingTwoFactor: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, default: Date.now },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ user: 1 });

export type Session = InferSchemaType<typeof sessionSchema>;
export type SessionDocument = HydratedDocumentFromSchema<typeof sessionSchema>;
export const SessionModel = model("Session", sessionSchema);
