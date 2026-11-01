import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SKILLS } from "@/lib/db/constants";
import { LEDGER_ORGS, ledgerChaincode, ledgerChannel } from "@/lib/ledger/config";
import { loadLedgerDemo, type BlockView, type LedgerDemoData } from "./data";
import s from "./page.module.css";

export const metadata: Metadata = {
  title: "Blockchain verification demo · Digital Skills Wallet",
};

const FUNCTION_LABELS: Record<string, string> = {
  IssueCoins: "Coins issued",
  RevokeCoins: "Coins revoked",
  ApproveChaincodeDefinitionForMyOrg: "Smart contract approved",
  CommitChaincodeDefinition: "Smart contract activated",
};

const short = (hash: string, size = 8) => (hash ? `${hash.slice(0, size)}…${hash.slice(-4)}` : "-");
const formatTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "medium", timeZone: "Australia/Brisbane" })
    : "-";

export default async function LedgerDemoPage(props: PageProps<"/demo/ledger">) {
  await connection(); // always render at request time with live ledger data, never at build time
  // A demo page with no login: keep it out of production unless switched on.
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_LEDGER_DEMO !== "true") notFound();

  const { wallet } = await props.searchParams;
  let data: LedgerDemoData;
  try {
    data = await loadLedgerDemo(typeof wallet === "string" ? wallet : undefined);
  } catch (error) {
    console.error("[demo/ledger]", error);
    return (
      <main className={s.page}>
        <Hero live={false} />
        <div className={s.container}>
          <div className={s.alert}>
            <strong>The school database is not reachable.</strong> Start MongoDB with <code>npm run db:up</code>, load
            the demo data with <code>npm run db:seed</code>, then refresh.
          </div>
        </div>
      </main>
    );
  }

  const { ledger } = data;
  return (
    <main className={s.page}>
      <Hero live={ledger.ok} height={ledger.ok ? ledger.info.height : undefined} />

      <div className={s.container}>
        {!ledger.ok && (
          <div className={s.alert}>
            <strong>Can&apos;t reach the blockchain network.</strong> {ledger.error}
          </div>
        )}

        {data.students.length === 0 && (
          <div className={s.alert}>
            <strong>No students yet.</strong> Load the demo data with <code>npm run db:seed</code>, then{" "}
            <code>npm run ledger:sync</code>.
          </div>
        )}

        <Section number={1} title="Who keeps the ledger">
          <p className={s.intro}>
            Every organisation below keeps its own full copy of the ledger. A skill coin is only recorded when{" "}
            <strong>both the school and Kanavoogle</strong> run the smart contract, get the same result and sign it.
            Neither can add, change or delete a record on its own.
          </p>
          <div className={s.orgGrid}>
            <OrgCard name={LEDGER_ORGS.school.name} id={LEDGER_ORGS.school.mspId} role={LEDGER_ORGS.school.role} accent="orange" />
            <OrgCard name={LEDGER_ORGS.kanavoogle.name} id={LEDGER_ORGS.kanavoogle.mspId} role={LEDGER_ORGS.kanavoogle.role} accent="purple" />
            <OrgCard
              name="Ordering service"
              id="OrdererMSP"
              role="Puts endorsed transactions in order and packs them into blocks for every peer. It cannot create or alter transactions."
              accent="navy"
            />
          </div>
          <p className={s.policy}>
            Endorsement rule: <code>AND(&apos;SchoolMSP.peer&apos;, &apos;KanavoogleMSP.peer&apos;)</code>
          </p>
        </Section>

        {data.students.length > 0 && (
          <Section number={2} title="A student's wallet, read from the ledger">
            <form method="get" className={s.lookup}>
              <label htmlFor="wallet">Wallet</label>
              <select id="wallet" name="wallet" defaultValue={data.walletId}>
                {data.students.map((student) => (
                  <option key={student.walletId} value={student.walletId}>
                    {student.walletId} · {student.name}
                  </option>
                ))}
              </select>
              <button type="submit">Look up</button>
            </form>
            <p className={s.privacy}>
              🔒 The ledger stores only the wallet ID <code>{data.walletId}</code>. The name
              {data.studentName ? ` (${data.studentName})` : ""} comes from the school&apos;s own database and never
              goes on the blockchain.
            </p>
            {ledger.ok && ledger.wallet && <SkillTiles data={data} />}
          </Section>
        )}

        {data.evidence.length > 0 && (
          <Section number={3} title="Is the assessment evidence genuine?">
            <p className={s.intro}>
              When coins are issued, a <strong>fingerprint</strong> (SHA-256 hash) of the assessment result (answers,
              marks and grade) goes on the ledger. The result itself stays in the school&apos;s database. Below, each
              fingerprint is recalculated from that database right now. If anyone has edited a result since the coins
              were issued, the fingerprints no longer match.
            </p>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Assessment</th>
                    <th>Result in school database</th>
                    <th>Fingerprint now</th>
                    <th>Fingerprint on ledger</th>
                    <th>Check</th>
                  </tr>
                </thead>
                <tbody>
                  {data.evidence.map((row) => (
                    <tr key={row.attemptId} className={row.status === "mismatch" ? s.rowBad : undefined}>
                      <td>
                        <strong>{row.title}</strong>
                        <span className={s.muted}>{row.subject}</span>
                      </td>
                      <td>
                        {row.percent}% {row.grade && <span className={s.grade}>{row.grade}</span>}
                      </td>
                      <td className={s.mono} title={row.currentHash}>{short(row.currentHash)}</td>
                      <td className={s.mono} title={row.recordedHash ?? undefined}>
                        {row.recordedHash ? short(row.recordedHash) : "-"}
                      </td>
                      <td>
                        {row.status === "match" && <span className={s.ok}>✓ Genuine</span>}
                        {row.status === "mismatch" && <span className={s.bad}>✗ Changed after recording</span>}
                        {row.status === "pending" && <span className={s.pending}>Not on ledger yet</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {ledger.ok && ledger.wallet && (
          <Section number={4} title="Ledger transactions for this wallet">
            {ledger.wallet.events.length === 0 ? (
              <p className={s.intro}>
                No coins on the ledger for this wallet yet. Run <code>npm run ledger:sync</code>.
              </p>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Recorded</th>
                      <th>Event</th>
                      <th>Skill</th>
                      <th className={s.num}>Coins</th>
                      <th className={s.num}>Block</th>
                      <th>Transaction ID</th>
                      <th>Submitted by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.wallet.events.map((event) => (
                      <tr key={event.eventId}>
                        <td>{formatTime(event.timestamp)}</td>
                        <td>
                          <span className={event.type === "issued" ? s.tagIssued : s.tagRevoked}>
                            {event.type === "issued" ? "Issued" : "Revoked"}
                          </span>
                        </td>
                        <td>{SKILLS.find((skill) => skill.key === event.skill)?.label ?? event.skill}</td>
                        <td className={s.num}>{event.type === "issued" ? `+${event.coins}` : `−${event.coins}`}</td>
                        <td className={s.num}>{data.blockNumbers[event.eventId] ?? "-"}</td>
                        <td className={s.mono} title={event.txId}>{short(event.txId, 10)}</td>
                        <td>
                          {event.issuer.name}
                          <span className={s.muted}>{event.issuer.mspId}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {ledger.ok && (
          <Section number={5} title="The chain of blocks">
            <p className={s.intro}>
              Each block stores the fingerprint of the block before it. Changing anything in an old block would change
              its fingerprint and break every link after it, on every organisation&apos;s copy. Fingerprints below are
              recalculated from the block contents.
            </p>
            <div className={ledger.chainIntact ? s.chainOk : s.chainBad}>
              {ledger.chainIntact
                ? `✓ Chain intact: ${ledger.info.height} blocks, every link verified`
                : "✗ Chain broken: a block does not match the fingerprint stored in the block after it"}
            </div>
            <ol className={s.chain}>
              {ledger.blocks.map((block) => (
                <BlockCard key={block.number} block={block} />
              ))}
            </ol>
          </Section>
        )}

        <footer className={s.footer}>
          Channel <code>{ledgerChannel()}</code> · smart contract <code>{ledgerChaincode()}</code> · Hyperledger Fabric
          2.5 · refresh the page to see new blocks.
        </footer>
      </div>
    </main>
  );
}

function Hero({ live, height }: { live: boolean; height?: number }) {
  return (
    <header className={s.hero}>
      <div className={s.container}>
        <p className={s.eyebrow}>Digital Skills Wallet · Blockchain verification demo</p>
        <h1 className={s.title}>Skill coins on the blockchain</h1>
        <p className={s.lead}>
          Every skill coin a student earns is written to a shared Hyperledger Fabric ledger, kept by the school and
          Kanavoogle together. Once a coin is recorded, nobody can quietly change or delete it, and anyone on the
          network can check it.
        </p>
        <span className={live ? s.liveOn : s.liveOff}>
          <span className={s.dot} /> {live ? `Live: connected to the network, ${height} blocks` : "Network offline"}
        </span>
      </div>
    </header>
  );
}

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section className={s.section}>
      <h2 className={s.sectionTitle}>
        <span className={s.step}>{number}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function OrgCard({ name, id, role, accent }: { name: string; id: string; role: string; accent: "orange" | "purple" | "navy" }) {
  return (
    <div className={`${s.org} ${s[accent]}`}>
      <span className={s.orgId}>{id}</span>
      <strong className={s.orgName}>{name}</strong>
      <p>{role}</p>
    </div>
  );
}

function SkillTiles({ data }: { data: LedgerDemoData }) {
  if (!data.ledger.ok || !data.ledger.wallet) return null;
  const { balances, totalCoins } = data.ledger.wallet;
  return (
    <>
      <div className={s.walletTotal}>
        <span>{totalCoins.toLocaleString("en-AU")}</span> skill coins on the ledger
      </div>
      <div className={s.skills}>
        {SKILLS.map((skill) => {
          const onLedger = balances[skill.key] ?? 0;
          const inSchool = data.schoolBalances[skill.key] ?? 0;
          return (
            <div key={skill.key} className={s.skill}>
              <span className={s.skillName}>{skill.label}</span>
              <span className={s.skillCoins}>{onLedger}</span>
              {onLedger === inSchool ? (
                <span className={s.okSmall}>✓ matches school records</span>
              ) : (
                <span className={s.badSmall}>≠ school records say {inSchool}</span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function BlockCard({ block }: { block: BlockView }) {
  const counts = new Map<string, number>();
  for (const tx of block.transactions) {
    const label = tx.kind === "config" ? "Channel created (genesis block)" : FUNCTION_LABELS[tx.functionName ?? ""] ?? tx.functionName ?? "Transaction";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const endorsers = [...new Set(block.transactions.flatMap((tx) => tx.endorsers))];
  const submitters = [...new Set(block.transactions.map((tx) => tx.creatorMsp).filter(Boolean))];

  return (
    <li className={s.block}>
      <div className={s.blockHead}>
        <span className={s.blockNumber}>Block #{block.number}</span>
        <span className={s.muted}>{formatTime(block.transactions[0]?.timestamp ?? null)}</span>
      </div>
      <ul className={s.blockTxs}>
        {[...counts].map(([label, count]) => (
          <li key={label}>
            {count > 1 ? `${count} × ` : ""}
            {label}
          </li>
        ))}
      </ul>
      <dl className={s.blockMeta}>
        <dt>Submitted by</dt>
        <dd>{submitters.length > 0 ? submitters.join(", ") : "Network set-up"}</dd>
        {endorsers.length > 0 && (
          <>
            <dt>Endorsed by</dt>
            <dd>{endorsers.join(" + ")}</dd>
          </>
        )}
        <dt>Fingerprint</dt>
        <dd className={s.mono} title={block.hash}>{short(block.hash, 12)}</dd>
        <dt>Previous block</dt>
        <dd className={s.mono} title={block.previousHash}>
          {block.previousHash ? short(block.previousHash, 12) : "none (first block)"}
          {block.linksToPrevious === true && <span className={s.linkOk}> ✓ linked</span>}
          {block.linksToPrevious === false && <span className={s.bad}> ✗ broken link</span>}
        </dd>
      </dl>
    </li>
  );
}
