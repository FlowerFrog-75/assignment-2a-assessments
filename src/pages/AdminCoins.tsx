import { useState } from 'react';
import type { Page } from '../types';
import { apiSend, ApiRequestError, useApiData } from '../lib/api';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, PageStatus, Select, Textarea } from '../components/ui';

interface Props { setPage: (p: Page) => void; }

interface CoinEvent {
  id: string;
  student: string;
  walletId: string;
  skill: string;
  type: 'issued' | 'revoked';
  coins: number;
  reason: string;
  by: string;
  date: string;
  ledgerStatus: 'pending' | 'committed' | 'failed';
  block: number | null;
  txId: string | null;
  error: string | null;
  revoked: boolean;
}

const sample: { events: CoinEvent[] } = {
  events: [{ id: '1', student: 'Jordan Smith', walletId: 'DSW-2024-JS-1147', skill: 'Research', type: 'issued', coins: 30, reason: '3/4 in Research', by: 'Sarah Chen', date: '1 Nov 2026, 10:02 am', ledgerStatus: 'committed', block: 12, txId: '9f2c…', error: null, revoked: false }],
};

export default function AdminCoins({ setPage }: Props) {
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const params = new URLSearchParams({ ...(status && { status }), ...(search && { q: search }) });
  const events = useApiData(`/admin/wallet-events?${params}`, sample);
  const [revoking, setRevoking] = useState<CoinEvent | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  if (!events.ready && !events.error) return <PageStatus error={null} />;
  const list = events.data.events;
  const waiting = list.filter((e) => e.ledgerStatus !== 'committed').length;

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await apiSend('POST', `/admin/wallet-events/${revoking.id}/revoke`, { reason });
      setNotice({ tone: 'green', text: `${revoking.coins} ${revoking.skill} coins revoked from ${revoking.student}. The revocation is being written to the blockchain.` });
      setRevoking(null);
      setReason('');
      setTimeout(events.reload, 4000);
      events.reload();
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not revoke' });
      setRevoking(null);
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      await apiSend('POST', '/admin/ledger/sync');
      setNotice({ tone: 'green', text: 'Sync started. Refresh in a few seconds to see the result.' });
      setTimeout(events.reload, 5000);
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not start the sync' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        eyebrow="Administration"
        accent="blue"
        title="Skill coins"
        subtitle="Every coin issued or revoked. Coins are recorded in MongoDB and on the Hyperledger Fabric blockchain."
        actions={
          <>
            <Button variant="secondary" onClick={() => setPage('blockchain-ledger')}>Open ledger</Button>
            <Button accent="blue" busy={busy} onClick={sync}>Retry blockchain sync</Button>
          </>
        }
      />
      <Card className="mb-4" padded={false}>
        <form className="flex flex-wrap gap-3 p-4" onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()); }}>
          <Input placeholder="Student name or wallet ID" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[200px]">
            <option value="">Any blockchain status</option>
            <option value="committed">On the blockchain</option>
            <option value="pending">Waiting to sync</option>
            <option value="failed">Failed</option>
          </Select>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </Card>
      {notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}
      {waiting > 0 && !status && (
        <div className="mb-4"><Alert tone="amber">{waiting} event{waiting === 1 ? '' : 's'} not on the blockchain yet. They're retried automatically every few minutes, or use “Retry blockchain sync”.</Alert></div>
      )}
      {events.error ? (
        <PageStatus error={events.error} onRetry={events.reload} />
      ) : (
        <Card padded={false}>
          {list.length === 0 ? (
            <EmptyState icon="🪙" title="No skill coins yet">Coins are issued automatically when a teacher releases assessment results.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-body">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-[#E8EAF0]">
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Coins</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Blockchain</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.id} className="border-b border-[#E8EAF0] last:border-0">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{e.date}<div className="text-gray-400">by {e.by}</div></td>
                      <td className="px-4 py-3"><div className="text-gray-900">{e.student}</div><div className="text-xs text-gray-400 font-mono">{e.walletId}</div></td>
                      <td className={`px-4 py-3 font-semibold whitespace-nowrap ${e.type === 'revoked' ? 'text-red-600' : 'text-emerald-700'}`}>{e.type === 'revoked' ? '−' : '+'}{e.coins} {e.skill}</td>
                      <td className="px-4 py-3 text-gray-600">{e.reason}</td>
                      <td className="px-4 py-3">
                        {e.ledgerStatus === 'committed' ? <Badge tone="green">Block {e.block ?? '✓'}</Badge> : e.ledgerStatus === 'failed' ? <span title={e.error ?? ''}><Badge tone="red">Failed</Badge></span> : <Badge tone="amber">Waiting</Badge>}
                        {e.txId && <div className="text-[10px] text-gray-400 font-mono mt-1" title={e.txId}>tx {e.txId.slice(0, 12)}…</div>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {e.type === 'issued' && !e.revoked && <Button variant="ghost" className="!px-2 !py-1 text-xs text-red-600" onClick={() => setRevoking(e)}>Revoke</Button>}
                        {e.revoked && <Badge>Revoked</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {revoking && (
        <Modal
          title="Revoke skill coins"
          onClose={() => setRevoking(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRevoking(null)}>Cancel</Button>
              <Button variant="danger" busy={busy} disabled={!reason.trim()} onClick={revoke}>Revoke {revoking.coins} coins</Button>
            </>
          }
        >
          <p className="text-sm text-gray-600 font-body mb-4">
            This takes <strong>{revoking.coins} {revoking.skill}</strong> coins back from {revoking.student}. The original issue stays in the history (on the
            blockchain nothing is ever deleted), with a revocation added after it. The student can see the reason.
          </p>
          <Field label="Reason">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Marking error corrected after review" />
          </Field>
        </Modal>
      )}
    </div>
  );
}
