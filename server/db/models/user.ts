import { USER_ROLES, USER_STATUSES } from "../constants";
import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";

/**
 * Public half of a user's key pair. Students' keys are generated in the
 * browser and staff keys come from certificates. The private key never
 * reaches the server.
 */
const publicKeySchema = new Schema({
  algorithm: { type: String, required: true, trim: true, maxlength: 50 }, // e.g. "Ed25519", "ECDSA-P256"
  publicKey: { type: String, required: true, maxlength: 10_000 }, // PEM or base64 SPKI
  fingerprint: { type: String, required: true, trim: true, maxlength: 200 },
  purpose: { type: String, enum: ["signing", "staff-certificate"], default: "signing" },
  createdAt: { type: Date, default: Date.now },
  revokedAt: { type: Date },
});

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address"],
    },
    // Hashed with server/security/password.ts. Not returned by queries unless
    // you ask for it: UserModel.findOne(...).select("+passwordHash")
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, required: true },
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, maxlength: 100 },
    school: { type: String, trim: true, maxlength: 200 },
    /** Students only: school year, e.g. 11. */
    yearLevel: { type: Number, min: 1, max: 12 },
    /** Students only: public wallet identifier shown on the wallet, e.g. "DSW-2026-JS-1147". */
    walletId: { type: String, trim: true, uppercase: true, maxlength: 40 },
    // 2FA is required for teachers and admins. The login flow enforces that.
    twoFactor: {
      enabled: { type: Boolean, default: false },
      // Encrypt the TOTP secret before storing it here.
      secret: { type: String, select: false },
      enrolledAt: { type: Date },
    },
    publicKeys: { type: [publicKeySchema], default: [] },
    status: { type: String, enum: USER_STATUSES, default: "active" },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    virtuals: {
      fullName: {
        get(this: { firstName: string; lastName: string }) {
          return `${this.firstName} ${this.lastName}`;
        },
      },
    },
    toJSON: {
      virtuals: true,
      // Defence in depth: secrets never leave the server, even if a query
      // explicitly selected them.
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        const twoFactor = ret.twoFactor as Record<string, unknown> | undefined;
        if (twoFactor) delete twoFactor.secret;
        return ret;
      },
    },
  },
);

userSchema.index({ role: 1, lastName: 1, firstName: 1 });
// Unique wallet IDs. Users without one (teachers, admins) are left out of the index.
userSchema.index(
  { walletId: 1 },
  { unique: true, partialFilterExpression: { walletId: { $type: "string" } } },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocumentFromSchema<typeof userSchema>;
export const UserModel = model("User", userSchema);
