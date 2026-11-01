import { Context, Contract, Info, Transaction } from "fabric-contract-api";

/** The seven core skills. Must match lib/db/constants.ts in the web app. */
export const SKILLS = [
  "analytical-thinking",
  "research",
  "critical-thinking",
  "creativity",
  "decision-making",
  "collaboration",
  "adaptability",
] as const;
export type Skill = (typeof SKILLS)[number];

/**
 * Organisations allowed to issue and revoke coins. Each school joining the
 * network would be added here (or, later, to an on-chain issuer registry).
 */
const ISSUER_MSPS = ["SchoolMSP"];

/** One immutable entry on the ledger. Revoking adds a new entry. */
export interface CoinEvent {
  docType: "coin-event";
  /** Same ID as the walletevents document in MongoDB. */
  eventId: string;
  /** The student's public wallet ID. The ledger stores no names or emails. */
  walletId: string;
  skill: Skill;
  type: "issued" | "revoked";
  coins: number;
  /** SHA-256 of the assessment result that earned the coins ("issued" only). */
  evidenceHash?: string;
  /** The issued event this entry reverses ("revoked" only). */
  revokes?: string;
  reason?: string;
  issuer: { mspId: string; name: string };
  txId: string;
  timestamp: string;
}

// Ledger keys
const EVENT = "event"; // event | eventId                 -> CoinEvent
const WALLET_INDEX = "wallet~event"; // walletId | eventId -> marker (lists a wallet's events)
const EVIDENCE_INDEX = "evidence~skill"; // hash | skill   -> eventId (stops double issuing)
const REVOKED_INDEX = "revoked"; // eventId                -> revoking eventId (stops double revoking)

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const WALLET_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,39}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const MAX_COINS = 100_000;

/** JSON with sorted keys, so every endorsing peer writes byte-identical values. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function timestampToIso(ts: { seconds: unknown; nanos: number }): string {
  const seconds = typeof ts.seconds === "number" ? ts.seconds : Number(String(ts.seconds));
  return new Date(seconds * 1000 + Math.floor(ts.nanos / 1e6)).toISOString();
}

@Info({ title: "SkillCoin", description: "Verifiable skill coins for the Digital Skills Wallet" })
export class SkillCoinContract extends Contract {
  constructor() {
    super("SkillCoinContract");
  }

  /**
   * Records coins earned from an assessment. Only issuer organisations may
   * call it. Each event ID, and each (assessment evidence, skill) pair, can
   * be recorded only once.
   */
  @Transaction()
  async IssueCoins(
    ctx: Context,
    eventId: string,
    walletId: string,
    skill: string,
    coins: string,
    evidenceHash: string,
  ): Promise<string> {
    const issuer = this.requireIssuer(ctx);
    check(ID_PATTERN.test(eventId), `Invalid event ID "${eventId}"`);
    check(WALLET_PATTERN.test(walletId), `Invalid wallet ID "${walletId}"`);
    check((SKILLS as readonly string[]).includes(skill), `Unknown skill "${skill}"`);
    check(/^\d+$/.test(coins) && Number(coins) >= 1 && Number(coins) <= MAX_COINS, `Coins must be a whole number from 1 to ${MAX_COINS}`);
    check(HASH_PATTERN.test(evidenceHash), "Evidence hash must be a SHA-256 hex digest");

    const eventKey = ctx.stub.createCompositeKey(EVENT, [eventId]);
    check(!(await this.exists(ctx, eventKey)), `Event ${eventId} is already on the ledger`);
    const evidenceKey = ctx.stub.createCompositeKey(EVIDENCE_INDEX, [evidenceHash, skill]);
    const existing = await ctx.stub.getState(evidenceKey);
    check(
      existing.length === 0,
      `Coins for ${skill} have already been issued for this assessment (event ${Buffer.from(existing).toString()})`,
    );

    const event: CoinEvent = {
      docType: "coin-event",
      eventId,
      walletId,
      skill: skill as Skill,
      type: "issued",
      coins: Number(coins),
      evidenceHash,
      issuer,
      txId: ctx.stub.getTxID(),
      timestamp: ctx.stub.getDateTimestamp().toISOString(),
    };
    await this.writeEvent(ctx, event);
    await ctx.stub.putState(evidenceKey, Buffer.from(eventId));
    ctx.stub.setEvent("CoinsIssued", Buffer.from(stableStringify(event)));
    return stableStringify(event);
  }

  /** Reverses an earlier issuance by adding a "revoked" event. The original stays on the ledger. */
  @Transaction()
  async RevokeCoins(ctx: Context, eventId: string, revokesEventId: string, reason: string): Promise<string> {
    const issuer = this.requireIssuer(ctx);
    check(ID_PATTERN.test(eventId), `Invalid event ID "${eventId}"`);
    check(reason.length <= 500, "Reason must be 500 characters or fewer");

    const eventKey = ctx.stub.createCompositeKey(EVENT, [eventId]);
    check(!(await this.exists(ctx, eventKey)), `Event ${eventId} is already on the ledger`);
    const original = await this.readEvent(ctx, revokesEventId);
    check(original.type === "issued", `Event ${revokesEventId} is not an issuance`);
    const revokedKey = ctx.stub.createCompositeKey(REVOKED_INDEX, [revokesEventId]);
    check(!(await this.exists(ctx, revokedKey)), `Event ${revokesEventId} has already been revoked`);

    const event: CoinEvent = {
      docType: "coin-event",
      eventId,
      walletId: original.walletId,
      skill: original.skill,
      type: "revoked",
      coins: original.coins,
      revokes: revokesEventId,
      reason: reason || undefined,
      issuer,
      txId: ctx.stub.getTxID(),
      timestamp: ctx.stub.getDateTimestamp().toISOString(),
    };
    await this.writeEvent(ctx, event);
    await ctx.stub.putState(revokedKey, Buffer.from(eventId));
    ctx.stub.setEvent("CoinsRevoked", Buffer.from(stableStringify(event)));
    return stableStringify(event);
  }

  /** A wallet's balance per skill and every event behind it. Anyone on the channel can read it. */
  @Transaction(false)
  async GetWallet(ctx: Context, walletId: string): Promise<string> {
    check(WALLET_PATTERN.test(walletId), `Invalid wallet ID "${walletId}"`);
    const balances = Object.fromEntries(SKILLS.map((skill) => [skill, 0])) as Record<Skill, number>;
    const events: CoinEvent[] = [];

    for await (const { key } of ctx.stub.getStateByPartialCompositeKey(WALLET_INDEX, [walletId])) {
      const [, eventId] = ctx.stub.splitCompositeKey(key).attributes;
      const event = await this.readEvent(ctx, eventId);
      balances[event.skill] += event.type === "issued" ? event.coins : -event.coins;
      events.push(event);
    }
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.eventId.localeCompare(b.eventId));
    const totalCoins = Object.values(balances).reduce((sum, n) => sum + n, 0);
    return stableStringify({ walletId, balances, totalCoins, events });
  }

  @Transaction(false)
  async GetEvent(ctx: Context, eventId: string): Promise<string> {
    return stableStringify(await this.readEvent(ctx, eventId));
  }

  /** Every write to an event's key. Events are written once, so there should be exactly one entry. */
  @Transaction(false)
  async GetEventHistory(ctx: Context, eventId: string): Promise<string> {
    const key = ctx.stub.createCompositeKey(EVENT, [eventId]);
    const history = [];
    for await (const entry of ctx.stub.getHistoryForKey(key)) {
      history.push({
        txId: entry.txId,
        timestamp: timestampToIso(entry.timestamp),
        isDelete: entry.isDelete,
        value: entry.isDelete ? null : JSON.parse(Buffer.from(entry.value).toString("utf8")),
      });
    }
    return stableStringify(history);
  }

  /**
   * Checks an assessment result held off-chain (in MongoDB) against the hash
   * recorded when the coins were issued. A mismatch means the result changed
   * after it was recorded.
   */
  @Transaction(false)
  async VerifyEvidence(ctx: Context, eventId: string, evidenceHash: string): Promise<string> {
    const event = await this.readEvent(ctx, eventId);
    check(event.type === "issued", `Event ${eventId} is not an issuance`);
    return stableStringify({
      eventId,
      matches: event.evidenceHash === evidenceHash,
      recordedHash: event.evidenceHash,
      txId: event.txId,
      timestamp: event.timestamp,
    });
  }

  // --- helpers -------------------------------------------------------------

  private requireIssuer(ctx: Context): CoinEvent["issuer"] {
    const mspId = ctx.clientIdentity.getMSPID();
    check(ISSUER_MSPS.includes(mspId), `Access denied: ${mspId} is not authorised to issue or revoke skill coins`);
    const subject = ctx.clientIdentity.getID(); // "x509::<subject DN>::<issuer DN>"
    const name = /CN=([^/,:]+)/.exec(subject)?.[1] ?? "unknown";
    return { mspId, name };
  }

  private async exists(ctx: Context, key: string): Promise<boolean> {
    return (await ctx.stub.getState(key)).length > 0;
  }

  private async readEvent(ctx: Context, eventId: string): Promise<CoinEvent> {
    check(ID_PATTERN.test(eventId), `Invalid event ID "${eventId}"`);
    const data = await ctx.stub.getState(ctx.stub.createCompositeKey(EVENT, [eventId]));
    check(data.length > 0, `Event ${eventId} does not exist`);
    return JSON.parse(Buffer.from(data).toString("utf8")) as CoinEvent;
  }

  private async writeEvent(ctx: Context, event: CoinEvent): Promise<void> {
    await ctx.stub.putState(ctx.stub.createCompositeKey(EVENT, [event.eventId]), Buffer.from(stableStringify(event)));
    await ctx.stub.putState(ctx.stub.createCompositeKey(WALLET_INDEX, [event.walletId, event.eventId]), Buffer.from([0]));
  }
}
