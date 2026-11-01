import { LEDGER_STATUSES, SKILL_KEYS, WALLET_EVENT_TYPES, type SkillKey } from "../constants";
import { Schema, Types, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";
import { appendOnly } from "../plugins/append-only";

export type SkillBalance = { skill: SkillKey; coins: number };

/**
 * Append-only history of skill coins. A student's wallet is the sum of their
 * events. Removing a coin adds a "revoked" event and never deletes the
 * original, so the full history stays visible to the student.
 *
 * MongoDB is not the system of record for coins. Each event is also written
 * to Hyperledger Fabric, and `ledger` tracks that sync.
 */
const walletEventSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true },
    skill: { type: String, enum: SKILL_KEYS, required: true },
    type: { type: String, enum: WALLET_EVENT_TYPES, required: true },
    coins: {
      type: Number,
      required: true,
      min: 1,
      validate: [Number.isInteger, "Coins must be a whole number"],
    },
    reason: { type: String, trim: true, maxlength: 500 },
    /** The released attempt that earned the coins (for "issued" events). */
    sourceAttempt: { type: Schema.Types.ObjectId, ref: "AssessmentAttempt" },
    /** The event being reversed (for "revoked" events). */
    revokes: { type: Schema.Types.ObjectId, ref: "WalletEvent" },
    /** Who triggered the event. Empty means the system did. */
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    ledger: {
      status: { type: String, enum: LEDGER_STATUSES, default: "pending" },
      txId: { type: String, trim: true },
      blockNumber: { type: Number, min: 0 },
      committedAt: { type: Date },
      error: { type: String, maxlength: 2_000 },
    },
    createdAt: { type: Date, default: Date.now, immutable: true },
  },
);

walletEventSchema.pre("validate", function () {
  if (this.type === "revoked" && !this.revokes) {
    this.invalidate("revokes", "A revoked event must reference the event it reverses");
  }
});

appendOnly(walletEventSchema, { name: "WalletEvent", mutablePaths: ["ledger"] });

walletEventSchema.index({ student: 1, skill: 1, createdAt: -1 }); // wallet history
walletEventSchema.index({ "ledger.status": 1, createdAt: 1 }); // events waiting to sync to Fabric
// Never issue coins for the same skill from the same attempt twice, even if
// the issuing code is retried.
walletEventSchema.index(
  { sourceAttempt: 1, skill: 1 },
  { unique: true, partialFilterExpression: { type: "issued", sourceAttempt: { $exists: true } } },
);
// An issuance can only be revoked once.
walletEventSchema.index(
  { revokes: 1 },
  { unique: true, partialFilterExpression: { revokes: { $exists: true } } },
);

export type WalletEvent = InferSchemaType<typeof walletEventSchema>;
export type WalletEventDocument = HydratedDocumentFromSchema<typeof walletEventSchema>;
export const WalletEventModel = model("WalletEvent", walletEventSchema);

/** Current coin balance per skill for one student (issued minus revoked). */
export function walletBalances(studentId: Types.ObjectId | string) {
  return WalletEventModel.aggregate<SkillBalance>([
    { $match: { student: new Types.ObjectId(String(studentId)) } },
    {
      $group: {
        _id: "$skill",
        coins: { $sum: { $cond: [{ $eq: ["$type", "revoked"] }, { $multiply: ["$coins", -1] }, "$coins"] } },
      },
    },
    { $project: { _id: 0, skill: "$_id", coins: 1 } },
    { $sort: { skill: 1 } },
  ]);
}
