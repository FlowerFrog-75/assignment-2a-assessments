import type { Types } from "mongoose";
import { AssessmentAttemptModel, UserModel, WalletEventModel, type WalletEventDocument } from "../db/models";
import { computeEvidenceHash } from "./evidence";
import { describeLedgerError } from "./gateway";
import { getLedgerEvent, issueCoinsOnLedger, revokeCoinsOnLedger } from "./skillcoin";

export type SyncReport = {
  committed: number;
  alreadyOnLedger: number;
  failed: { eventId: string; error: string }[];
};

type Progress = (message: string) => void;

/**
 * Writes skill-coin events from MongoDB (walletevents) to the Fabric ledger,
 * then records the transaction ID and block number back on each event
 * (`ledger.status: "committed"`).
 *
 * - Only events that are `pending` or `failed` are sent, unless `resync` is
 *   set (use it after the ledger has been wiped with `fabric:clean`).
 * - Safe to re-run. An event that is already on the ledger is just marked
 *   committed.
 * - Issuances go first, so a revocation never refers to an event the ledger
 *   hasn't seen yet.
 */
export async function syncWalletEventsToLedger(
  options: { resync?: boolean; onProgress?: Progress } = {},
): Promise<SyncReport> {
  const progress = options.onProgress ?? (() => {});
  const query = options.resync
    ? WalletEventModel.find()
    : WalletEventModel.find({ "ledger.status": { $in: ["pending", "failed"] } });
  const events = await query.sort({ createdAt: 1, _id: 1 });
  const report: SyncReport = { committed: 0, alreadyOnLedger: 0, failed: [] };
  if (events.length === 0) return report;

  const students = await UserModel.find({ _id: { $in: events.map((e) => e.student) } }, { walletId: 1 }).lean();
  const walletIds = new Map(students.map((s) => [s._id.toString(), s.walletId]));
  const attempts = await AssessmentAttemptModel.find({
    _id: { $in: events.flatMap((e) => (e.sourceAttempt ? [e.sourceAttempt] : [])) },
  });
  const attemptsById = new Map(attempts.map((a) => [a._id.toString(), a]));

  const syncOne = async (event: WalletEventDocument) => {
    const eventId = event._id.toString();
    try {
      const walletId = walletIds.get(event.student.toString());
      if (!walletId) throw new Error("The student has no wallet ID");

      let committed;
      if (event.type === "issued") {
        const attempt = event.sourceAttempt ? attemptsById.get(event.sourceAttempt.toString()) : undefined;
        if (!attempt?.result) throw new Error("The source assessment has no released result");
        committed = await issueCoinsOnLedger({
          eventId,
          walletId,
          skill: event.skill,
          coins: event.coins,
          evidenceHash: computeEvidenceHash(attempt, walletId),
        });
      } else {
        if (!event.revokes) throw new Error("A revocation must reference the event it reverses");
        committed = await revokeCoinsOnLedger({
          eventId,
          revokesEventId: event.revokes.toString(),
          reason: event.reason ?? undefined,
        });
      }
      await markCommitted(event._id, committed.txId, committed.blockNumber);
      report.committed += 1;
      progress(`  ✓ ${event.type} ${event.coins} ${event.skill} coins  → block ${committed.blockNumber}, tx ${committed.txId.slice(0, 12)}…`);
    } catch (error) {
      const message = describeLedgerError(error);
      if (message.includes("is already on the ledger")) {
        // Written earlier but MongoDB wasn't updated (e.g. the app crashed in between).
        const onLedger = await getLedgerEvent(eventId);
        await markCommitted(event._id, onLedger.txId);
        report.alreadyOnLedger += 1;
        progress(`  = ${eventId} was already on the ledger`);
        return;
      }
      await WalletEventModel.updateOne(
        { _id: event._id },
        { $set: { "ledger.status": "failed", "ledger.error": message } },
      );
      report.failed.push({ eventId, error: message });
      progress(`  ✗ ${eventId}: ${message}`);
    }
  };

  // Issuances in parallel batches (the orderer packs them into fewer blocks),
  // then revocations in order.
  const issued = events.filter((e) => e.type === "issued");
  for (let i = 0; i < issued.length; i += 10) {
    await Promise.all(issued.slice(i, i + 10).map(syncOne));
  }
  for (const event of events.filter((e) => e.type === "revoked")) await syncOne(event);
  return report;
}

function markCommitted(id: Types.ObjectId, txId: string, blockNumber?: number) {
  return WalletEventModel.updateOne(
    { _id: id },
    {
      $set: {
        "ledger.status": "committed",
        "ledger.txId": txId,
        "ledger.committedAt": new Date(),
        ...(blockNumber !== undefined && { "ledger.blockNumber": blockNumber }),
      },
      $unset: { "ledger.error": "" },
    },
  );
}
