// Health check and Public Verification. The verification route needs no login:
// anyone holding a student's code can check the skills that student chose to share.
import { Router } from "express";
import type { Types } from "mongoose";
import mongoose from "../db/mongoose";
import { connectToDatabase } from "../db/connect";
import { SKILLS, type SkillKey } from "../db/constants";
import {
  AchievementModel,
  AssessmentAttemptModel,
  UserModel,
  WalletEventModel,
  appendAuditLog,
  currentSchool,
  resolveVerificationToken,
  walletBalances,
} from "../db/models";
import { computeEvidenceHash, describeLedgerError, getChainInfo, getLedgerWallet } from "../ledger";
import { rateLimit } from "../auth/rate-limit";
import { ApiError, releasedAttempts, skillTotals } from "./data";
import { formatDate, skillLevel } from "./format";

export const healthRoutes = Router();
export const publicRoutes = Router();

/** GET /api/health: is MongoDB reachable, and is the Fabric network? */
healthRoutes.get("/health", async (_req, res) => {
  const started = performance.now();
  const mongo = await connectToDatabase()
    .then(async () => {
      await mongoose.connection.db!.command({ ping: 1 });
      return { ok: true, latencyMs: Math.round(performance.now() - started) };
    })
    .catch(() => ({ ok: false }));
  const fabric = await getChainInfo()
    .then((info) => ({ ok: true, blocks: info.height }))
    .catch((error) => ({ ok: false, message: describeLedgerError(error) }));
  res.status(mongo.ok ? 200 : 503).json({ status: mongo.ok && fabric.ok ? "ok" : mongo.ok ? "degraded" : "error", mongo, fabric });
});

/**
 * GET /api/verify/:code: Public Verification.
 * Shows only the skills the student chose to disclose, and checks them
 * against the blockchain: balances must match the ledger, every coin must be
 * on it, and each assessment result must still match its fingerprint there.
 */
publicRoutes.get("/verify/:code", rateLimit("verify", 60, 10 * 60_000), async (req, res) => {
  const link = await resolveVerificationToken(String(req.params.code));
  if (!link) {
    await appendAuditLog({
      actorRole: "anonymous", action: "verification.view", ip: req.ip, status: "failure",
      details: { label: "Unknown or expired code" },
    });
    throw new ApiError(404, "credential_not_found", "No active credential has that code. It may have expired or been revoked.");
  }
  const student = await UserModel.findById(link.student);
  if (!student?.walletId) throw new ApiError(404, "credential_not_found", "This credential's wallet no longer exists.");

  const disclosed = link.disclosedSkills as SkillKey[];
  const totals = skillTotals(await releasedAttempts(student._id));
  const balances = new Map((await walletBalances(student._id)).map((b) => [b.skill, b.coins]));
  const achievements = link.includeAchievements
    ? await AchievementModel.find({ student: student._id }).sort({ awardedAt: 1 }).lean()
    : [];

  let ledger;
  try {
    const onChain = await getLedgerWallet(student.walletId);
    const onChainEvents = new Map(onChain.events.map((e) => [e.eventId, e]));
    const events = await WalletEventModel.find({ student: student._id, skill: { $in: disclosed } }).lean();
    const missing = events.filter((e) => !onChainEvents.has(e._id.toString())).length;
    const balanceMismatches = disclosed.filter((skill) => (onChain.balances[skill] ?? 0) !== (balances.get(skill) ?? 0));

    const attemptIds = [...new Set(events.flatMap((e) => (e.type === "issued" && e.sourceAttempt ? [e.sourceAttempt.toString()] : [])))];
    const attempts = await AssessmentAttemptModel.find({ _id: { $in: attemptIds } });
    let evidenceMismatches = 0;
    for (const attempt of attempts) {
      const recorded = events
        .filter((e) => e.type === "issued" && (e.sourceAttempt as Types.ObjectId | undefined)?.equals(attempt._id))
        .map((e) => onChainEvents.get(e._id.toString())?.evidenceHash)
        .find(Boolean);
      if (recorded && recorded !== computeEvidenceHash(attempt, student.walletId)) evidenceMismatches += 1;
    }
    ledger = {
      reachable: true,
      verified: missing === 0 && balanceMismatches.length === 0 && evidenceMismatches === 0,
      transactions: events.length - missing,
      pending: missing,
      assessmentsChecked: attempts.length,
      evidenceMismatches,
      balanceMismatches,
    };
  } catch (error) {
    ledger = { reachable: false, verified: false, message: describeLedgerError(error) };
  }

  await appendAuditLog({
    actorRole: "anonymous", action: "verification.view", ip: req.ip, userAgent: req.get("user-agent"),
    subjectStudent: student._id, status: ledger.verified ? "success" : "warning",
    details: { label: student.walletId, verified: ledger.verified },
  });

  res.json({
    credential: {
      name: `${student.firstName} ${student.lastName}`,
      id: student.walletId,
      school: (await currentSchool())?.name ?? student.school ?? "",
      grade: `Grade ${student.yearLevel}`,
      issued: formatDate(link.createdAt),
      expires: link.expiresAt ? formatDate(link.expiresAt) : null,
      verified: ledger.verified,
      skills: SKILLS.filter((s) => disclosed.includes(s.key)).map((s) => ({
        key: s.key,
        name: s.label,
        level: skillLevel(totals[s.key].percent),
        score: totals[s.key].percent,
        coins: balances.get(s.key) ?? 0,
      })),
      achievements: achievements.map((a) => ({ code: a.code, title: a.title })),
    },
    ledger,
  });
});
