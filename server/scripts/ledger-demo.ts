// A narrated walkthrough of the blockchain features, for showing customers.
//
//   pnpm ledger:demo                 # full walkthrough in the terminal
//   pnpm ledger:demo --pause      # same, waiting for Enter between steps
//   pnpm ledger:demo tamper       # edit Jordan's Science result in MongoDB (to show on the Blockchain Ledger screen)
//   pnpm ledger:demo restore      # put the original result back
//
// Needs: pnpm db:up, db:seed, fabric:up and ledger:sync.
import "./load-env";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Types } from "mongoose";
import { createInterface } from "node:readline/promises";
import { skillLabel } from "../db/constants";
import { connectToDatabase, disconnectFromDatabase } from "../db/connect";
import {
  AssessmentAttemptModel,
  AssessmentTemplateModel,
  UserModel,
  WalletEventModel,
  walletBalances,
} from "../db/models";
import { LEDGER_ORGS } from "../ledger/config";
import { computeEvidenceHash } from "../ledger/evidence";
import { getBlock, getChainInfo } from "../ledger/explorer";
import { closeLedgerConnections, describeLedgerError } from "../ledger/gateway";
import {
  getLedgerEventHistory,
  getLedgerWallet,
  issueCoinsOnLedger,
  verifyEvidenceOnLedger,
} from "../ledger/skillcoin";

const WALLET = "DSW-2024-JS-1147"; // Jordan Smith
const TAMPER_TEMPLATE = "Critical Thinking in Data Interpretation";
const BACKUP_FILE = "fabric/.demo/tamper-backup.json";

const style = (code: string) => (text: string | number) => `\x1b[${code}m${text}\x1b[0m`;
const bold = style("1");
const dim = style("2");
const green = style("32");
const red = style("31");
const purple = style("35");
const pause = process.argv.includes("--pause");

async function step(number: number, title: string, explanation: string) {
  if (pause && number > 1) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question(dim("\nPress Enter for the next step..."));
    rl.close();
  }
  console.log(`\n${purple("━".repeat(72))}\n${bold(`${number}. ${title}`)}\n${dim(explanation)}\n`);
}

async function jordan() {
  const student = await UserModel.findOne({ walletId: WALLET });
  if (!student) throw new Error(`No student with wallet ${WALLET}. Run: pnpm db:seed`);
  return student;
}

async function scienceAttempt() {
  const template = await AssessmentTemplateModel.findOne({ title: TAMPER_TEMPLATE });
  const attempt = template && (await AssessmentAttemptModel.findOne({ student: (await jordan())._id, template: template._id, status: "released" }));
  if (!attempt?.result) throw new Error(`Jordan's "${TAMPER_TEMPLATE}" result not found. Run: pnpm db:seed`);
  return attempt;
}

/** The ledger's evidence fingerprint for an attempt, via the coins it earned. */
async function recordedHash(attemptId: Types.ObjectId, ledgerEvents: Map<string, string | undefined>) {
  const events = await WalletEventModel.find({ sourceAttempt: attemptId, type: "issued" }, { _id: 1 }).lean();
  return events.map((e) => ledgerEvents.get(e._id.toString())).find(Boolean);
}

async function walkthrough() {
  const student = await jordan();

  await step(1, "The network", "Hyperledger Fabric is a permissioned blockchain. Only known organisations take part, each with its own copy of the ledger.");
  const info = await getChainInfo();
  for (const org of Object.values(LEDGER_ORGS)) console.log(`  • ${bold(org.name)} (${org.mspId}): ${org.role}`);
  console.log(`  • ${bold("Ordering service")} (OrdererMSP): orders transactions into blocks`);
  console.log(`\n  Rule for every transaction: endorsed by SchoolMSP ${bold("AND")} KanavoogleMSP`);
  console.log(`  The ledger currently has ${bold(info.height)} blocks.`);

  await step(2, `${student.firstName} ${student.lastName}'s wallet, read from the blockchain`, "The ledger holds only the wallet ID, no name. We compare it with the school's own database (MongoDB).");
  const wallet = await getLedgerWallet(WALLET);
  const school = new Map((await walletBalances(student._id)).map((b) => [b.skill, b.coins]));
  for (const [skill, coins] of Object.entries(wallet.balances)) {
    const same = (school.get(skill as never) ?? 0) === coins;
    console.log(`  ${skillLabel(skill as never).padEnd(22)} ${String(coins).padStart(5)} coins   ${same ? green("✓ matches school records") : red(`✗ school says ${school.get(skill as never) ?? 0}`)}`);
  }
  console.log(`  ${"Total".padEnd(22)} ${bold(String(wallet.totalCoins).padStart(5))} coins, from ${wallet.events.length} ledger transactions`);

  await step(3, "Is the assessment evidence genuine?", "When coins are issued, a SHA-256 fingerprint of the assessment result goes on the ledger. We recalculate it from the school database now.");
  const ledgerHashes = new Map(wallet.events.map((e) => [e.eventId, e.evidenceHash]));
  const attempts = await AssessmentAttemptModel.find({ student: student._id, status: "released" }).sort({ releasedAt: 1 });
  for (const attempt of attempts) {
    const template = await AssessmentTemplateModel.findById(attempt.template, { title: 1 }).lean();
    const recorded = await recordedHash(attempt._id, ledgerHashes);
    const current = computeEvidenceHash(attempt, WALLET);
    const verdict = !recorded ? dim("not on ledger yet") : recorded === current ? green("✓ genuine") : red("✗ changed after recording");
    console.log(`  ${(template?.title ?? "Assessment").padEnd(44)} ${String(attempt.result?.percent).padStart(3)}%   ${verdict}`);
  }

  await step(4, "Kanavoogle tries to give Jordan 500 Research coins", "Kanavoogle is on the network but is not a school, so the smart contract must refuse.");
  try {
    await issueCoinsOnLedger({ eventId: `demo-${Date.now()}`, walletId: WALLET, skill: "research", coins: 500, evidenceHash: "0".repeat(64) }, "kanavoogle");
    console.log(red("  ✗ Unexpected: the transaction was accepted"));
  } catch (error) {
    console.log(`  ${red("✗ Rejected")} by the smart contract: "${describeLedgerError(error)}"`);
    console.log(dim("  Nothing was written. The ledger is unchanged."));
  }

  await step(5, "The school tries to issue the same coins twice", "Each assessment can earn coins for each skill only once, even if the school's software retries or is misused.");
  const first = wallet.events.find((e) => e.type === "issued");
  if (first?.evidenceHash) {
    try {
      await issueCoinsOnLedger({ eventId: `demo-${Date.now()}`, walletId: WALLET, skill: first.skill, coins: first.coins, evidenceHash: first.evidenceHash });
      console.log(red("  ✗ Unexpected: the duplicate was accepted"));
    } catch (error) {
      console.log(`  ${red("✗ Rejected")}: "${describeLedgerError(error)}"`);
    }
  }

  await step(6, "Someone edits Jordan's Science result in the school database", "We change the score in MongoDB (as an attacker or a mistake might), check the fingerprint, then put it back.");
  if (existsSync(BACKUP_FILE)) {
    console.log(red("  A tamper from `pnpm ledger:demo tamper` is still active. Run `pnpm ledger:demo restore` first."));
  } else {
    const attempt = await scienceAttempt();
    const event = await WalletEventModel.findOne({ sourceAttempt: attempt._id, type: "issued" });
    const original = { percent: attempt.result!.percent, grade: attempt.result!.grade };
    try {
      attempt.result!.percent = 100;
      attempt.result!.grade = "A";
      await attempt.save();
      console.log(`  Changed "${TAMPER_TEMPLATE}" from ${original.percent}% (${original.grade}) to ${bold("100% (A)")} in MongoDB.`);
      const check = await verifyEvidenceOnLedger(event!._id.toString(), computeEvidenceHash(attempt, WALLET));
      console.log(`  Fingerprint check against the ledger: ${check.matches ? red("matches (unexpected)") : red("✗ DOES NOT MATCH: tampering detected")}`);
    } finally {
      attempt.result!.percent = original.percent;
      attempt.result!.grade = original.grade;
      await attempt.save();
    }
    const check = await verifyEvidenceOnLedger(event!._id.toString(), computeEvidenceHash(attempt, WALLET));
    console.log(`  Restored the original result. Check again: ${check.matches ? green("✓ matches") : red("✗ still different")}`);
  }

  await step(7, "The life of one coin", "Ledger entries are written once. Their history shows every change ever made, and there are none.");
  const coinEvent = first && (await WalletEventModel.findById(first.eventId));
  if (first && coinEvent) {
    const history = await getLedgerEventHistory(first.eventId);
    console.log(`  ${first.coins} ${skillLabel(first.skill)} coins, issued ${new Date(first.timestamp).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })}`);
    console.log(`  Transaction ${dim(first.txId)}`);
    console.log(`  Writes in history: ${bold(history.length)} (created, never modified)`);
    if (coinEvent.ledger?.blockNumber !== undefined && coinEvent.ledger?.blockNumber !== null) {
      const block = await getBlock(coinEvent.ledger.blockNumber);
      const tx = block.transactions.find((t) => t.txId === first.txId);
      console.log(`  In block #${block.number}, fingerprint ${dim(block.hash.slice(0, 24))}…`);
      console.log(`  Submitted by ${tx?.creatorMsp}, endorsed by ${bold(tx?.endorsers.join(" + ") ?? "?")}`);
    }
  }

  console.log(`\n${purple("━".repeat(72))}\n${bold("Summary")}`);
  console.log(`  ${green("✓")} Coins are recorded only with both organisations' agreement`);
  console.log(`  ${green("✓")} Unauthorised and duplicate issuing is refused by the smart contract`);
  console.log(`  ${green("✓")} Edited assessment results are detected against the ledger`);
  console.log(`  ${green("✓")} Personal details stay off the blockchain. Only wallet IDs and fingerprints are stored`);
  console.log(dim("\n  See it visually: pnpm dev:full, then open the app and choose Blockchain Ledger in the sidebar\n"));
}

async function tamper() {
  if (existsSync(BACKUP_FILE)) {
    console.log("Already tampered. Run `pnpm ledger:demo restore` to undo it.");
    return;
  }
  const attempt = await scienceAttempt();
  const result = attempt.result!;
  mkdirSync(dirname(BACKUP_FILE), { recursive: true });
  writeFileSync(BACKUP_FILE, JSON.stringify({ attemptId: attempt._id.toString(), result: attempt.toObject().result }, null, 2));
  const before = `${result.percent}% (${result.grade})`;
  result.score = result.maxScore;
  result.percent = 100;
  result.grade = "A";
  for (const skill of result.skillScores) {
    skill.score = skill.maxScore;
    skill.percent = 100;
  }
  await attempt.save();
  console.log(`${red("Tampered:")} Jordan's "${TAMPER_TEMPLATE}" result changed from ${before} to 100% (A) in MongoDB.`);
  console.log("Refresh the Blockchain Ledger screen (or Public Verification): the result is now flagged as changed after recording.");
  console.log("Undo with: pnpm ledger:demo restore");
}

async function restore() {
  if (!existsSync(BACKUP_FILE)) {
    console.log("Nothing to restore.");
    return;
  }
  const backup = JSON.parse(readFileSync(BACKUP_FILE, "utf8")) as { attemptId: string; result: Record<string, unknown> };
  await AssessmentAttemptModel.updateOne({ _id: backup.attemptId }, { $set: { result: backup.result } });
  rmSync(BACKUP_FILE);
  console.log(`${green("Restored")} Jordan's original "${TAMPER_TEMPLATE}" result. Refresh the screen.`);
}

async function main() {
  await connectToDatabase({ autoIndex: false });
  const command = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? "walkthrough";
  if (command === "tamper") await tamper();
  else if (command === "restore") await restore();
  else await walkthrough();
}

main()
  .catch((error) => {
    console.error(red(`\n${describeLedgerError(error)}`));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeLedgerConnections();
    await disconnectFromDatabase();
  });
