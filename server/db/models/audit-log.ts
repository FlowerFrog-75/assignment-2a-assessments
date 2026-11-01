import { createHash } from "node:crypto";
import { AUDIT_ACTOR_ROLES, AUDIT_STATUSES } from "../constants";
import { Schema, Types, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";
import { appendOnly } from "../plugins/append-only";

/** prevHash of the very first entry. */
export const AUDIT_GENESIS_HASH = "0".repeat(64);

export type AuditEntryInput = {
  actor?: Types.ObjectId | string | null;
  actorRole: (typeof AUDIT_ACTOR_ROLES)[number];
  /** Dotted verb, e.g. "auth.login", "results.view", "wallet.coin.issue". */
  action: string;
  resource?: { type: string; id?: string };
  /** The student whose data was accessed. Students can see these entries. */
  subjectStudent?: Types.ObjectId | string | null;
  ip?: string;
  userAgent?: string;
  status?: (typeof AUDIT_STATUSES)[number];
  /** Small, plain-JSON details. Never put passwords, tokens or secrets here. */
  details?: Record<string, unknown>;
};

export type ChainVerification =
  | { ok: true; checked: number }
  | { ok: false; checked: number; brokenAt: number; reason: string };

/**
 * Converts a value to a canonical JSON-safe form: sorted keys, ISO dates,
 * hex ObjectIds, and empty values dropped (MongoDB drops them on save too).
 */
function canonicalise(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && (value as { _bsontype?: string })._bsontype === "ObjectId") {
    return (value as Types.ObjectId).toHexString();
  }
  if (Array.isArray(value)) return value.map(canonicalise);
  if (typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => [key, canonicalise((value as Record<string, unknown>)[key])] as const)
      .filter(([, v]) => v !== null);
    return entries.length > 0 ? Object.fromEntries(entries) : null;
  }
  return value;
}

/** SHA-256 over an entry's contents and the previous entry's hash. */
export function computeAuditHash(entry: Record<string, unknown>): string {
  const payload = canonicalise({
    seq: entry.seq,
    at: entry.at,
    prevHash: entry.prevHash,
    actor: entry.actor,
    actorRole: entry.actorRole,
    action: entry.action,
    resource: entry.resource,
    subjectStudent: entry.subjectStudent,
    ip: entry.ip,
    userAgent: entry.userAgent,
    status: entry.status,
    details: entry.details,
  });
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

/**
 * Hash-chained, append-only log of security-relevant events: logins, data
 * access, admin actions and coin issuance. Each entry stores the hash of the
 * entry before it, so editing or removing any entry in the middle breaks the
 * chain. verifyAuditChain() detects that.
 *
 * Always write entries with appendAuditLog(), never with AuditLogModel.create().
 */
const auditLogSchema = new Schema(
  {
    seq: { type: Number, required: true, min: 1 },
    at: { type: Date, required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    actorRole: { type: String, enum: AUDIT_ACTOR_ROLES, required: true },
    action: { type: String, required: true, maxlength: 100, match: /^[a-z][a-z0-9_.-]*$/ },
    resource: {
      type: { type: String, maxlength: 50 },
      id: { type: String, maxlength: 100 },
    },
    subjectStudent: { type: Schema.Types.ObjectId, ref: "User" },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 500 },
    status: { type: String, enum: AUDIT_STATUSES, default: "success" },
    details: { type: Schema.Types.Mixed },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
  },
  { versionKey: false },
);

appendOnly(auditLogSchema, { name: "AuditLog" });

auditLogSchema.index({ seq: 1 }, { unique: true });
auditLogSchema.index({ subjectStudent: 1, at: -1 }); // "who viewed my data"
auditLogSchema.index({ actor: 1, at: -1 });
auditLogSchema.index({ action: 1, at: -1 });

export type AuditLog = InferSchemaType<typeof auditLogSchema>;
export type AuditLogDocument = HydratedDocumentFromSchema<typeof auditLogSchema>;
export const AuditLogModel = model("AuditLog", auditLogSchema);

const queueHolder = globalThis as typeof globalThis & { _auditAppendQueue?: Promise<unknown> };

/**
 * Appends an entry to the end of the chain. Safe to call concurrently:
 * appends from this Node.js process run one at a time, and if another process
 * takes the next sequence number first, the append retries.
 */
export function appendAuditLog(input: AuditEntryInput): Promise<AuditLogDocument> {
  const run = (queueHolder._auditAppendQueue ?? Promise.resolve()).then(() => appendWithRetry(input));
  queueHolder._auditAppendQueue = run.catch(() => undefined); // one failure must not block later appends
  return run;
}

async function appendWithRetry(input: AuditEntryInput): Promise<AuditLogDocument> {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const last = await AuditLogModel.findOne({}, { seq: 1, hash: 1 }).sort({ seq: -1 }).lean();
    const entry = new AuditLogModel({
      ...input,
      seq: (last?.seq ?? 0) + 1,
      at: new Date(),
      prevHash: last?.hash ?? AUDIT_GENESIS_HASH,
    });
    // Hash the casted document (after trimming and defaults) so the hash
    // matches exactly what gets stored.
    entry.hash = computeAuditHash(entry.toObject());
    try {
      return await entry.save();
    } catch (error) {
      if (!isDuplicateKeyError(error) || attempt === maxAttempts) throw error;
      // Another process took this sequence number. Back off a random amount, then retry.
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 25 * attempt));
    }
  }
  throw new Error("unreachable");
}

/**
 * Walks the whole chain and checks sequence numbers, links and hashes.
 * Removing entries from the END of the log cannot be detected this way.
 * Periodically anchoring the latest hash on the Fabric ledger closes that gap.
 */
export async function verifyAuditChain(): Promise<ChainVerification> {
  let expectedSeq = 1;
  let expectedPrevHash = AUDIT_GENESIS_HASH;
  let checked = 0;
  for await (const entry of AuditLogModel.find().sort({ seq: 1 }).lean().cursor()) {
    const fail = (reason: string): ChainVerification => ({ ok: false, checked, brokenAt: entry.seq, reason });
    if (entry.seq !== expectedSeq) return fail(`expected seq ${expectedSeq}, found ${entry.seq}`);
    if (entry.prevHash !== expectedPrevHash) return fail("prevHash does not match the previous entry");
    if (computeAuditHash(entry) !== entry.hash) return fail("entry contents do not match its hash");
    expectedSeq += 1;
    expectedPrevHash = entry.hash;
    checked += 1;
  }
  return { ok: true, checked };
}
