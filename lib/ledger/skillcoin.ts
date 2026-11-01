import type { SkillKey } from "../db/constants";
import type { LedgerOrg } from "./config";
import { getSkillcoinContract } from "./gateway";

/** An entry on the ledger, as written by the skillcoin chaincode. */
export type LedgerCoinEvent = {
  docType: "coin-event";
  eventId: string;
  walletId: string;
  skill: SkillKey;
  type: "issued" | "revoked";
  coins: number;
  evidenceHash?: string;
  revokes?: string;
  reason?: string;
  issuer: { mspId: string; name: string };
  txId: string;
  timestamp: string;
};

export type LedgerWallet = {
  walletId: string;
  balances: Record<SkillKey, number>;
  totalCoins: number;
  events: LedgerCoinEvent[];
};

export type CommittedTransaction<T> = { txId: string; blockNumber: number; result: T };

const utf8 = new TextDecoder();

async function evaluate<T>(org: LedgerOrg, name: string, args: string[]): Promise<T> {
  const contract = await getSkillcoinContract(org);
  return JSON.parse(utf8.decode(await contract.evaluateTransaction(name, ...args))) as T;
}

/** Endorses (by both organisations), orders and commits a transaction, then waits for the block. */
async function submit<T>(org: LedgerOrg, name: string, args: string[]): Promise<CommittedTransaction<T>> {
  const contract = await getSkillcoinContract(org);
  const transaction = await contract.newProposal(name, { arguments: args }).endorse();
  const commit = await transaction.submit();
  const status = await commit.getStatus();
  if (!status.successful) {
    throw new Error(`Transaction ${status.transactionId} was not committed (validation code ${status.code})`);
  }
  return {
    txId: status.transactionId,
    blockNumber: Number(status.blockNumber),
    result: JSON.parse(utf8.decode(transaction.getResult())) as T,
  };
}

export function issueCoinsOnLedger(
  input: { eventId: string; walletId: string; skill: SkillKey; coins: number; evidenceHash: string },
  org: LedgerOrg = "school",
) {
  return submit<LedgerCoinEvent>(org, "IssueCoins", [
    input.eventId,
    input.walletId,
    input.skill,
    String(input.coins),
    input.evidenceHash,
  ]);
}

export function revokeCoinsOnLedger(
  input: { eventId: string; revokesEventId: string; reason?: string },
  org: LedgerOrg = "school",
) {
  return submit<LedgerCoinEvent>(org, "RevokeCoins", [input.eventId, input.revokesEventId, input.reason ?? ""]);
}

export function getLedgerWallet(walletId: string, org: LedgerOrg = "school") {
  return evaluate<LedgerWallet>(org, "GetWallet", [walletId]);
}

export function getLedgerEvent(eventId: string, org: LedgerOrg = "school") {
  return evaluate<LedgerCoinEvent>(org, "GetEvent", [eventId]);
}

export function getLedgerEventHistory(eventId: string, org: LedgerOrg = "school") {
  return evaluate<{ txId: string; timestamp: string; isDelete: boolean; value: LedgerCoinEvent | null }[]>(
    org,
    "GetEventHistory",
    [eventId],
  );
}

export function verifyEvidenceOnLedger(eventId: string, evidenceHash: string, org: LedgerOrg = "school") {
  return evaluate<{ eventId: string; matches: boolean; recordedHash: string; txId: string; timestamp: string }>(
    org,
    "VerifyEvidence",
    [eventId, evidenceHash],
  );
}
