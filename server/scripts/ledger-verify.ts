// Audits the blockchain against the school database. Read-only: safe to run
// on a live system at any time (e.g. from cron, or before a customer review).
//
//   pnpm ledger:verify                  # every student
//   pnpm ledger:verify DSW-2026-AB-1234 # one wallet
//   pnpm ledger:verify --probe          # also prove Kanavoogle can't issue coins
//
// For each wallet it checks that:
//   1. the coin balances on the ledger match MongoDB, and
//   2. every released result that earned coins still has the same SHA-256
//      fingerprint as the one recorded on the ledger (i.e. nobody has edited
//      the result since).
// Exits with code 1 if anything doesn't match.
import "./load-env";
import { SKILL_KEYS, skillLabel } from "../db/constants";
import { connectToDatabase, disconnectFromDatabase } from "../db/connect";
import { AssessmentAttemptModel, AssessmentTemplateModel, UserModel, WalletEventModel, walletBalances } from "../db/models";
import { computeEvidenceHash } from "../ledger/evidence";
import { getChainInfo } from "../ledger/explorer";
import { closeLedgerConnections, describeLedgerError } from "../ledger/gateway";
import { getLedgerWallet, issueCoinsOnLedger } from "../ledger/skillcoin";

const color = (code: string) => (text: string | number) => `\x1b[${code}m${text}\x1b[0m`;
const [bold, dim, green, red, yellow] = ["1", "2", "32", "31", "33"].map(color);

async function main() {
  await connectToDatabase({ autoIndex: false });
  const walletArg = process.argv.slice(2).find((a) => !a.startsWith("--"))?.toUpperCase();
  const info = await getChainInfo();
  console.log(`${bold("Ledger")}: ${info.height} blocks on channel skillschannel\n`);

  const students = await UserModel.find({ role: "student", walletId: walletArg ?? { $type: "string" } }, { firstName: 1, lastName: 1, walletId: 1 }).sort({ lastName: 1 }).lean();
  if (walletArg && students.length === 0) throw new Error(`No student with wallet ID ${walletArg}`);
  let problems = 0;
  let pending = 0;

  for (const student of students) {
    const walletId = student.walletId!;
    const events = await WalletEventModel.find({ student: student._id }).lean();
    if (events.length === 0) continue;
    const ledger = await getLedgerWallet(walletId);
    const school = new Map((await walletBalances(student._id)).map((b) => [b.skill, b.coins]));
    const lines: string[] = [];

    const waiting = events.filter((e) => e.ledger?.status !== "committed").length;
    pending += waiting;
    for (const skill of SKILL_KEYS) {
      const onLedger = ledger.balances[skill] ?? 0;
      const inDb = school.get(skill) ?? 0;
      if (onLedger !== inDb && !waiting) {
        problems += 1;
        lines.push(red(`  ✗ ${skillLabel(skill)}: ledger ${onLedger}, database ${inDb}`));
      }
    }

    const recorded = new Map(ledger.events.map((e) => [e.eventId, e.evidenceHash]));
    const attempts = await AssessmentAttemptModel.find({ _id: { $in: events.flatMap((e) => (e.sourceAttempt ? [e.sourceAttempt] : [])) } });
    for (const attempt of attempts) {
      const eventIds = events.filter((e) => e.type === "issued" && e.sourceAttempt?.equals(attempt._id)).map((e) => e._id.toString());
      const hash = eventIds.map((id) => recorded.get(id)).find(Boolean);
      if (!hash) continue; // not on the ledger yet
      if (hash !== computeEvidenceHash(attempt, walletId)) {
        problems += 1;
        const template = await AssessmentTemplateModel.findById(attempt.template, { title: 1 }).lean();
        lines.push(red(`  ✗ "${template?.title ?? attempt._id}" has changed since its coins were recorded`));
      }
    }

    const status = lines.length ? red("✗") : waiting ? yellow("…") : green("✓");
    console.log(`${status} ${`${student.firstName} ${student.lastName}`.padEnd(28)} ${dim(walletId)}  ${ledger.totalCoins} coins${waiting ? yellow(`  (${waiting} event${waiting === 1 ? "" : "s"} not yet on the ledger)`) : ""}`);
    for (const line of lines) console.log(line);
  }

  if (process.argv.includes("--probe")) {
    console.log(`\n${bold("Probe")}: Kanavoogle tries to issue 500 coins (the smart contract must refuse)`);
    try {
      await issueCoinsOnLedger({ eventId: `probe-${Date.now()}`, walletId: students[0]?.walletId ?? "PROBE", skill: "research", coins: 500, evidenceHash: "0".repeat(64) }, "kanavoogle");
      problems += 1;
      console.log(red("  ✗ The ledger accepted it. Check the chaincode and endorsement policy."));
    } catch (error) {
      console.log(green(`  ✓ Refused: ${describeLedgerError(error)}`));
    }
  }

  console.log(`\n${problems ? red(`${problems} problem${problems === 1 ? "" : "s"} found`) : green("Everything matches.")}${pending ? yellow(` ${pending} event(s) waiting to sync (pnpm ledger:sync).`) : ""}`);
  if (problems) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(describeLedgerError(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeLedgerConnections();
    await disconnectFromDatabase();
  });
