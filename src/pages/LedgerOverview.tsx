import { useState } from 'react';
import type { Page } from '../types';
import DataSourceBadge from '../components/DataSourceBadge';
import { useApiData } from '../lib/api';

interface Props { setPage: (p: Page) => void; }

// Live view of the Hyperledger Fabric ledger: who runs it, a wallet read from
// it, assessment evidence checked against MongoDB, and the chain of blocks.
// Data: GET /api/ledger/overview?wallet=DSW-... (see server/api/ledger.ts). Administrators only.

interface LedgerEvent {
  eventId: string;
  skill: string;
  type: 'issued' | 'revoked';
  coins: number;
  issuer: { mspId: string; name: string };
  txId: string;
  timestamp: string;
}

interface Block {
  number: number;
  hash: string;
  previousHash: string;
  linksToPrevious: boolean | null;
  transactions: { txId: string; timestamp: string | null; kind: string; creatorMsp: string; functionName?: string; endorsers: string[] }[];
}

interface LedgerDemoData {
  students: { walletId: string; name: string }[];
  walletId: string;
  studentName: string | null;
  schoolBalances: Record<string, number>;
  blockNumbers: Record<string, number | undefined>;
  evidence: {
    attemptId: string;
    title: string;
    subject: string;
    percent: number;
    grade: string | null;
    currentHash: string;
    recordedHash: string | null;
    status: 'match' | 'mismatch' | 'pending';
  }[];
  ledger:
    | { ok: true; info: { height: number }; blocks: Block[]; chainIntact: boolean; wallet: { balances: Record<string, number>; totalCoins: number; events: LedgerEvent[] } | null }
    | { ok: false; error: string };
  network: { channel: string; chaincode: string; endorsementPolicy: string; organisations: { id: string; name: string; role: string }[] };
}

const SKILLS: { key: string; name: string; badge: string }[] = [
  { key: 'analytical-thinking', name: 'Analytical Thinking', badge: '🔍' },
  { key: 'research', name: 'Research', badge: '📚' },
  { key: 'critical-thinking', name: 'Critical Thinking', badge: '🧠' },
  { key: 'creativity', name: 'Creativity', badge: '🎨' },
  { key: 'decision-making', name: 'Decision-Making', badge: '⚖️' },
  { key: 'collaboration', name: 'Collaboration', badge: '🤝' },
  { key: 'adaptability', name: 'Adaptability', badge: '🌱' },
];

const FUNCTION_LABELS: Record<string, string> = {
  IssueCoins: 'Coins issued',
  RevokeCoins: 'Coins revoked',
  ApproveChaincodeDefinitionForMyOrg: 'Smart contract approved',
  CommitChaincodeDefinition: 'Smart contract activated',
};

const ORG_ACCENT = ['border-t-orange-500', 'border-t-purple-600', 'border-t-[#1A1B2E]'];

const short = (hash: string, size = 8) => (hash ? `${hash.slice(0, size)}…${hash.slice(-4)}` : '-');
const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Australia/Brisbane' }) : '-';

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-5 mb-5">
      <h2 className="flex items-center gap-3 font-display font-600 text-gray-900 mb-3">
        <span className="w-7 h-7 rounded-lg bg-blue-600 text-white text-sm flex items-center justify-center">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function LedgerOverview(_props: Props) {
  const [wallet, setWallet] = useState<string | null>(null);
  const demo = useApiData<LedgerDemoData | null>(`/ledger/overview${wallet ? `?wallet=${encodeURIComponent(wallet)}` : ''}`, null);
  const data = demo.data;
  const ledger = data?.ledger;

  return (
    <div className="min-h-screen bg-[#F8F9FC] p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-xs font-mono font-600 text-blue-600 uppercase tracking-widest">Blockchain</span>
            <DataSourceBadge source={demo.source} reason={demo.offlineReason} />
          </div>
          <h1 className="font-display font-700 text-2xl text-gray-900">Blockchain Ledger</h1>
          <p className="text-sm text-gray-500 font-body mt-0.5">
            Hyperledger Fabric 2.5
            {data && <> · channel <span className="font-mono">{data.network.channel}</span> · smart contract <span className="font-mono">{data.network.chaincode}</span></>}
            {ledger?.ok && <> · {ledger.info.height} blocks</>}
          </p>
        </div>
        {data && data.students.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="ledger-wallet" className="text-sm text-gray-500 font-body">Wallet</label>
            <select
              id="ledger-wallet"
              value={data.walletId}
              onChange={(e) => setWallet(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#E8EAF0] bg-white text-sm font-body text-gray-700 focus:outline-none focus:border-blue-400"
            >
              {data.students.map((s) => (
                <option key={s.walletId} value={s.walletId}>{s.name} · {s.walletId}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* No API: explain rather than show made-up blockchain data */}
      {!data && demo.source !== 'loading' && (
        <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-8 text-center max-w-2xl mx-auto">
          <div className="text-4xl mb-3">⛓️</div>
          <h2 className="font-display font-700 text-lg text-gray-900 mb-2">
            {demo.error ? 'Ledger view unavailable' : 'The blockchain network isn’t connected'}
          </h2>
          <p className="text-sm text-gray-500 font-body mb-4">
            {demo.error?.message ?? 'This screen reads live from the Hyperledger Fabric network, so it needs the API server, MongoDB and the Fabric network running.'}
            {data === null && !demo.error && ' (In the design preview there is no sample ledger: blockchain data is never made up.)'}
          </p>
          {!demo.error && (
            <pre className="text-left text-xs font-mono bg-[#1A1B2E] text-emerald-300 rounded-lg p-4 inline-block">
{`pnpm db:up
pnpm fabric:up
pnpm dev:full`}
            </pre>
          )}
        </div>
      )}

      {data && ledger && !ledger.ok && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-body">
          <strong>Can&apos;t reach the blockchain network.</strong> {ledger.error}
        </div>
      )}

      {data && (
        <>
          <Section n={1} title="Who keeps the ledger">
            <p className="text-sm text-gray-600 font-body mb-4 max-w-3xl">
              Each organisation keeps its own full copy of the ledger. A skill coin is only recorded when <strong>both the school and Kanavoogle</strong> run the smart contract, get the same result and sign it. Neither can add, change or delete records on its own.
            </p>
            <div className="grid grid-cols-3 gap-4">
              {[...data.network.organisations, { id: 'OrdererMSP', name: 'Ordering service', role: 'Puts endorsed transactions in order and packs them into blocks for every peer. It cannot create or alter transactions.' }].map((org, i) => (
                <div key={org.id} className={`rounded-xl border border-[#E8EAF0] border-t-4 ${ORG_ACCENT[i]} p-4`}>
                  <div className="text-[11px] font-mono text-gray-400">{org.id}</div>
                  <div className="font-display font-600 text-gray-900">{org.name}</div>
                  <p className="text-xs text-gray-500 font-body mt-1.5 leading-relaxed">{org.role}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 font-body mt-3">
              Endorsement rule: <span className="font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{data.network.endorsementPolicy}</span>
            </p>
          </Section>

          {ledger?.ok && ledger.wallet && (
            <Section n={2} title={`${data.studentName ?? 'Student'}'s wallet, read from the ledger`}>
              <p className="text-xs text-gray-500 font-body mb-4">
                🔒 The ledger stores only the wallet ID <span className="font-mono">{data.walletId}</span>. The name comes from the school&apos;s own database and never goes on the blockchain.
              </p>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="font-display font-800 text-3xl text-gray-900">{ledger.wallet.totalCoins.toLocaleString()}</span>
                <span className="text-sm text-gray-400 font-body">skill coins on the ledger</span>
              </div>
              <div className="grid grid-cols-7 gap-3">
                {SKILLS.map((skill) => {
                  const onLedger = ledger.wallet!.balances[skill.key] ?? 0;
                  const inSchool = data.schoolBalances[skill.key] ?? 0;
                  return (
                    <div key={skill.key} className="rounded-xl bg-gray-50 border border-[#F0F2F7] p-3">
                      <div className="text-lg">{skill.badge}</div>
                      <div className="text-[11px] font-body font-600 text-gray-600 leading-tight min-h-[28px]">{skill.name}</div>
                      <div className="font-display font-700 text-xl text-blue-600">{onLedger}</div>
                      <div className={`text-[10px] font-body ${onLedger === inSchool ? 'text-emerald-600' : 'text-red-600 font-600'}`}>
                        {onLedger === inSchool ? '✓ matches school records' : `≠ school says ${inSchool}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {data.evidence.length > 0 && (
            <Section n={3} title="Is the assessment evidence genuine?">
              <p className="text-sm text-gray-600 font-body mb-4 max-w-3xl">
                When coins are issued, a <strong>fingerprint</strong> (SHA-256 hash) of the assessment result goes on the ledger. Each fingerprint below is recalculated from the school&apos;s database right now. If anyone has edited a result since, it no longer matches.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-mono uppercase tracking-wider text-gray-400 border-b border-[#F0F2F7]">
                    <th className="py-2 pr-3">Assessment</th>
                    <th className="py-2 pr-3">Result in school database</th>
                    <th className="py-2 pr-3">Fingerprint now</th>
                    <th className="py-2 pr-3">Fingerprint on ledger</th>
                    <th className="py-2">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {data.evidence.map((row) => (
                    <tr key={row.attemptId} className={`border-b border-[#F8F9FC] ${row.status === 'mismatch' ? 'bg-red-50' : ''}`}>
                      <td className="py-2.5 pr-3">
                        <div className="font-body font-600 text-gray-800">{row.title}</div>
                        <div className="text-xs text-gray-400 font-body">{row.subject}</div>
                      </td>
                      <td className="py-2.5 pr-3 font-body">
                        {row.percent}% {row.grade && <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-600">{row.grade}</span>}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-gray-600" title={row.currentHash}>{short(row.currentHash)}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-gray-600" title={row.recordedHash ?? undefined}>{row.recordedHash ? short(row.recordedHash) : '-'}</td>
                      <td className="py-2.5">
                        {row.status === 'match' && <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-600">✓ Genuine</span>}
                        {row.status === 'mismatch' && <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-600">✗ Changed after recording</span>}
                        {row.status === 'pending' && <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500 font-600">Not on ledger yet</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {ledger?.ok && ledger.wallet && (
            <Section n={4} title="Ledger transactions for this wallet">
              {ledger.wallet.events.length === 0 ? (
                <p className="text-sm text-gray-500 font-body">No coins on the ledger for this wallet yet. Run <span className="font-mono">pnpm ledger:sync</span>.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-mono uppercase tracking-wider text-gray-400 border-b border-[#F0F2F7]">
                      <th className="py-2 pr-3">Recorded</th>
                      <th className="py-2 pr-3">Event</th>
                      <th className="py-2 pr-3">Skill</th>
                      <th className="py-2 pr-3 text-right">Coins</th>
                      <th className="py-2 pr-3 text-right">Block</th>
                      <th className="py-2 pr-3">Transaction ID</th>
                      <th className="py-2">Submitted by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.wallet.events.map((event) => (
                      <tr key={event.eventId} className="border-b border-[#F8F9FC]">
                        <td className="py-2 pr-3 text-xs text-gray-600 font-body">{formatTime(event.timestamp)}</td>
                        <td className="py-2 pr-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-600 ${event.type === 'issued' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {event.type === 'issued' ? 'Issued' : 'Revoked'}
                          </span>
                        </td>
                        <td className="py-2 pr-3 font-body text-gray-700">{SKILLS.find((s) => s.key === event.skill)?.name ?? event.skill}</td>
                        <td className="py-2 pr-3 text-right font-display font-600">{event.type === 'issued' ? `+${event.coins}` : `−${event.coins}`}</td>
                        <td className="py-2 pr-3 text-right font-mono text-xs">{data.blockNumbers[event.eventId] ?? '-'}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-gray-500" title={event.txId}>{short(event.txId, 10)}</td>
                        <td className="py-2 text-xs font-body text-gray-600">
                          {event.issuer.name}
                          <div className="text-[10px] text-gray-400">{event.issuer.mspId}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          )}

          {ledger?.ok && (
            <Section n={5} title="The chain of blocks">
              <p className="text-sm text-gray-600 font-body mb-3 max-w-3xl">
                Each block stores the fingerprint of the block before it. Changing anything in an old block would change its fingerprint and break every link after it, on every organisation&apos;s copy. Fingerprints below are recalculated from the block contents.
              </p>
              <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-600 font-body ${ledger.chainIntact ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {ledger.chainIntact
                  ? `✓ Chain intact: ${ledger.info.height} blocks, every link verified`
                  : '✗ Chain broken: a block does not match the fingerprint stored in the block after it'}
              </div>
              <ol className="flex flex-col gap-6">
                {ledger.blocks.map((block, i) => {
                  const counts = new Map<string, number>();
                  for (const tx of block.transactions) {
                    const label = tx.kind === 'config' ? 'Channel created (genesis block)' : FUNCTION_LABELS[tx.functionName ?? ''] ?? tx.functionName ?? 'Transaction';
                    counts.set(label, (counts.get(label) ?? 0) + 1);
                  }
                  const endorsers = [...new Set(block.transactions.flatMap((tx) => tx.endorsers))];
                  const submitters = [...new Set(block.transactions.map((tx) => tx.creatorMsp).filter(Boolean))];
                  return (
                    <li key={block.number} className="relative rounded-xl border border-[#E8EAF0] border-l-4 border-l-blue-600 p-4">
                      {i < ledger.blocks.length - 1 && (
                        <span className="absolute left-5 -bottom-5 text-[11px] text-gray-400 font-body">↓ links to</span>
                      )}
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="font-display font-700 text-gray-900">Block #{block.number}</span>
                        <span className="text-xs text-gray-400 font-body">{formatTime(block.transactions[0]?.timestamp ?? null)}</span>
                      </div>
                      <ul className="text-sm text-gray-700 font-body list-disc pl-5 mb-2">
                        {[...counts].map(([label, count]) => <li key={label}>{count > 1 ? `${count} × ` : ''}{label}</li>)}
                      </ul>
                      <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-xs">
                        <dt className="text-gray-400">Submitted by</dt>
                        <dd className="text-gray-700">{submitters.length ? submitters.join(', ') : 'Network set-up'}</dd>
                        {endorsers.length > 0 && (
                          <>
                            <dt className="text-gray-400">Endorsed by</dt>
                            <dd className="text-gray-700">{endorsers.join(' + ')}</dd>
                          </>
                        )}
                        <dt className="text-gray-400">Fingerprint</dt>
                        <dd className="font-mono text-gray-700" title={block.hash}>{short(block.hash, 12)}</dd>
                        <dt className="text-gray-400">Previous block</dt>
                        <dd className="font-mono text-gray-700" title={block.previousHash}>
                          {block.previousHash ? short(block.previousHash, 12) : 'none (first block)'}
                          {block.linksToPrevious === true && <span className="font-body font-600 text-emerald-600"> ✓ linked</span>}
                          {block.linksToPrevious === false && <span className="font-body font-600 text-red-600"> ✗ broken link</span>}
                        </dd>
                      </dl>
                    </li>
                  );
                })}
              </ol>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
