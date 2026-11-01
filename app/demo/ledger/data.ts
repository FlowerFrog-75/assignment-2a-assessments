import "server-only";
import {
  AssessmentAttemptModel,
  AssessmentTemplateModel,
  SKILL_KEYS,
  UserModel,
  WalletEventModel,
  connectToDatabase,
  walletBalances,
  type SkillKey,
} from "@/lib/db";
import {
  computeEvidenceHash,
  describeLedgerError,
  getChainInfo,
  getLedgerWallet,
  getRecentBlocks,
  type BlockSummary,
  type ChainInfo,
  type LedgerCoinEvent,
  type LedgerWallet,
} from "@/lib/ledger";

const DEFAULT_WALLET = "DSW-2026-JS-1147"; // Jordan Smith in the seed data
const BLOCKS_SHOWN = 6;

export type EvidenceRow = {
  attemptId: string;
  title: string;
  subject: string;
  percent: number;
  grade: string | null;
  currentHash: string;
  recordedHash: string | null;
  status: "match" | "mismatch" | "pending";
};

export type BlockView = BlockSummary & { linksToPrevious: boolean | null };

export type LedgerDemoData = {
  students: { walletId: string; name: string }[];
  walletId: string;
  studentName: string | null;
  schoolBalances: Record<SkillKey, number>;
  evidence: EvidenceRow[];
  blockNumbers: Record<string, number | undefined>;
  ledger:
    | { ok: true; info: ChainInfo; blocks: BlockView[]; chainIntact: boolean; wallet: LedgerWallet | null }
    | { ok: false; error: string };
};

function emptyBalances(): Record<SkillKey, number> {
  return Object.fromEntries(SKILL_KEYS.map((key) => [key, 0])) as Record<SkillKey, number>;
}

export async function loadLedgerDemo(requestedWallet?: string): Promise<LedgerDemoData> {
  await connectToDatabase();

  const studentDocs = await UserModel.find(
    { role: "student", walletId: { $type: "string" } },
    { firstName: 1, lastName: 1, walletId: 1 },
  )
    .sort({ lastName: 1 })
    .lean();
  const students = studentDocs.map((s) => ({ walletId: s.walletId!, name: `${s.firstName} ${s.lastName}` }));
  const walletId = (requestedWallet?.trim() || (students.some((s) => s.walletId === DEFAULT_WALLET) ? DEFAULT_WALLET : students[0]?.walletId) || "").toUpperCase();
  const student = studentDocs.find((s) => s.walletId === walletId);

  // --- The ledger (Hyperledger Fabric) ---
  let ledger: LedgerDemoData["ledger"];
  try {
    const [info, recent, wallet] = await Promise.all([
      getChainInfo(),
      getRecentBlocks(BLOCKS_SHOWN + 1), // one extra to check the oldest shown block's link
      walletId ? getLedgerWallet(walletId) : Promise.resolve(null),
    ]);
    const blocks: BlockView[] = recent.slice(0, BLOCKS_SHOWN).map((block, i) => ({
      ...block,
      // null = nothing older to compare against (the genesis block)
      linksToPrevious: recent[i + 1] ? block.previousHash === recent[i + 1].hash : null,
    }));
    const chainIntact =
      info.currentBlockHash === recent[0]?.hash && blocks.every((b) => b.linksToPrevious !== false);
    ledger = { ok: true, info, blocks, chainIntact, wallet };
  } catch (error) {
    ledger = { ok: false, error: describeLedgerError(error) };
  }

  // --- The school's own records (MongoDB) ---
  const schoolBalances = emptyBalances();
  const evidence: EvidenceRow[] = [];
  const blockNumbers: Record<string, number | undefined> = {};

  if (student) {
    for (const { skill, coins } of await walletBalances(student._id)) schoolBalances[skill] = coins;

    const events = await WalletEventModel.find({ student: student._id }, { type: 1, sourceAttempt: 1, ledger: 1 }).lean();
    for (const event of events) blockNumbers[event._id.toString()] = event.ledger?.blockNumber ?? undefined;

    const onLedger = new Map<string, LedgerCoinEvent>(
      ledger.ok && ledger.wallet ? ledger.wallet.events.map((e) => [e.eventId, e]) : [],
    );
    const attempts = await AssessmentAttemptModel.find({ student: student._id, status: "released" }).sort({ releasedAt: 1 });
    const templates = new Map(
      (await AssessmentTemplateModel.find({ _id: { $in: attempts.map((a) => a.template) } }, { title: 1, subject: 1 }).lean()).map(
        (t) => [t._id.toString(), t],
      ),
    );

    for (const attempt of attempts) {
      const recordedHash =
        events
          .filter((e) => e.type === "issued" && e.sourceAttempt?.equals(attempt._id))
          .map((e) => onLedger.get(e._id.toString())?.evidenceHash)
          .find(Boolean) ?? null;
      const currentHash = computeEvidenceHash(attempt, walletId);
      const template = templates.get(attempt.template.toString());
      evidence.push({
        attemptId: attempt._id.toString(),
        title: template?.title ?? "Assessment",
        subject: template?.subject ?? "",
        percent: attempt.result?.percent ?? 0,
        grade: attempt.result?.grade ?? null,
        currentHash,
        recordedHash,
        status: !recordedHash ? "pending" : recordedHash === currentHash ? "match" : "mismatch",
      });
    }
  }

  return {
    students,
    walletId,
    studentName: student ? `${student.firstName} ${student.lastName}` : null,
    schoolBalances,
    evidence,
    blockNumbers,
    ledger,
  };
}
