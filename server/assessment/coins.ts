// Issues skill coins and achievements when results are released, and keeps
// the Hyperledger Fabric ledger in step with MongoDB.
import type { Types } from "mongoose";
import { SKILL_KEYS, skillLabel, type SkillKey } from "../db/constants";
import {
  AchievementModel,
  AssessmentAttemptModel,
  WalletEventModel,
  appendAuditLog,
  type AssessmentAttemptDocument,
} from "../db/models";
import { describeLedgerError, syncWalletEventsToLedger } from "../ledger";
import { COINS_PER_POINT } from "./engine";

function isDuplicate(error: unknown) {
  return (error as { code?: number })?.code === 11000;
}

/**
 * Creates the wallet events (10 coins per mark, per skill) and any newly
 * earned achievements for a released attempt. Safe to call twice: the unique
 * indexes stop coins or badges being issued twice.
 */
export async function issueRewards(attempt: AssessmentAttemptDocument, actor?: Types.ObjectId) {
  if (attempt.status !== "released" || !attempt.result) throw new Error("Only released results earn coins");
  let issued = 0;
  for (const s of attempt.result.skillScores) {
    const coins = Math.round(s.score * COINS_PER_POINT);
    if (coins < 1) continue;
    try {
      await WalletEventModel.create({
        student: attempt.student,
        skill: s.skill,
        type: "issued",
        coins,
        reason: `${s.score}/${s.maxScore} in ${skillLabel(s.skill as SkillKey)}`,
        sourceAttempt: attempt._id,
        actor,
      });
      issued += coins;
    } catch (error) {
      if (!isDuplicate(error)) throw error;
    }
  }

  // Achievements: earned once each, with this attempt as evidence.
  const released = await AssessmentAttemptModel.find({ student: attempt.student, status: "released" }, { result: 1 }).lean();
  const assessedSkills = new Set(released.flatMap((a) => a.result?.skillScores.map((s) => s.skill) ?? []));
  const awards: { code: string; title: string; description: string; skill?: SkillKey }[] = [];
  awards.push({ code: "first-assessment", title: "First Assessment", description: "Completed a first skills assessment" });
  if (attempt.result.percent >= 90) awards.push({ code: "high-achiever", title: "High Achiever", description: "Scored 90% or more on an assessment" });
  if (SKILL_KEYS.every((k) => assessedSkills.has(k))) {
    awards.push({ code: "all-rounder", title: "All-Rounder", description: "Has been assessed in all seven skills" });
  }
  for (const s of attempt.result.skillScores) {
    if (s.maxScore > 0 && s.percent >= 85) {
      const label = skillLabel(s.skill as SkillKey);
      awards.push({ code: `${s.skill}-pioneer`, title: `${label} Pioneer`, description: `Scored 85% or more in ${label}`, skill: s.skill as SkillKey });
    }
  }
  const earned: string[] = [];
  for (const award of awards) {
    try {
      await AchievementModel.create({ student: attempt.student, evidence: attempt._id, ...award });
      earned.push(award.title);
    } catch (error) {
      if (!isDuplicate(error)) throw error;
    }
  }
  return { coins: issued, achievements: earned };
}

// One sync at a time, so a release and the retry timer don't race.
let running: Promise<void> | null = null;
let queued = false;

/** Sends pending wallet events to the ledger in the background. Never throws. */
export function syncLedgerSoon(): void {
  if (running) {
    queued = true;
    return;
  }
  running = (async () => {
    try {
      const report = await syncWalletEventsToLedger();
      if (report.committed || report.failed.length) {
        console.log(`[ledger] committed ${report.committed}, failed ${report.failed.length}`);
      }
      if (report.failed.length) {
        await appendAuditLog({
          actorRole: "system",
          action: "ledger.sync",
          status: "warning",
          details: { label: "Blockchain sync", failed: report.failed.length, firstError: report.failed[0]?.error.slice(0, 300) },
        });
      }
    } catch (error) {
      console.warn("[ledger] sync failed:", describeLedgerError(error));
    } finally {
      running = null;
      if (queued) {
        queued = false;
        syncLedgerSoon();
      }
    }
  })();
}

/** Retries anything not yet on the ledger every few minutes (e.g. after the network was down). */
export function startLedgerRetryLoop(intervalMs = Number(process.env.LEDGER_RETRY_MS ?? 5 * 60_000)): void {
  if (process.env.LEDGER_SYNC === "off") return;
  const tick = async () => {
    try {
      const waiting = await WalletEventModel.exists({ "ledger.status": { $in: ["pending", "failed"] } });
      if (waiting) syncLedgerSoon();
    } catch {
      // database not reachable yet; try again next time
    }
  };
  setTimeout(tick, 15_000).unref();
  setInterval(tick, intervalMs).unref();
}
