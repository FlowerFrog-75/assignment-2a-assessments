import { useState } from 'react';
import type { Page } from '../types';
import { apiSend, ApiRequestError, useApiData } from '../lib/api';
import { Alert, Badge, Button, Card, copyText, EmptyState, Field, Input, Modal, PageHeader, PageStatus, Select, SKILL_OPTIONS } from '../components/ui';

interface Props { setPage: (p: Page) => void; }

interface Consents {
  teachers: { id: string; name: string; email: string; classes: string[]; consent: { id: string; grantedAt: string } | null }[];
  history: { id: string; teacher: string; active: boolean; grantedAt: string; revokedAt: string | null }[];
}
interface Links {
  links: { id: string; label: string; skills: string[]; includeAchievements: boolean; created: string; expires: string | null; status: 'active' | 'expired' | 'revoked'; views: number; lastViewed: string | null }[];
}

const sampleConsents: Consents = {
  teachers: [{ id: 't', name: 'Sarah Chen', email: 's.chen@school.edu.au', classes: ['11B'], consent: { id: 'c', grantedAt: '3 Oct 2026' } }],
  history: [],
};
const sampleLinks: Links = {
  links: [{ id: 'l', label: 'Work experience application', skills: ['Research', 'Collaboration'], includeAchievements: true, created: '20 Oct 2026', expires: '19 Nov 2026', status: 'active', views: 2, lastViewed: '22 Oct 2026' }],
};

export default function Privacy({ setPage }: Props) {
  const consents = useApiData('/me/consents', sampleConsents);
  const links = useApiData('/me/verification-links', sampleLinks);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ label: '', skills: new Set<string>(), includeAchievements: true, expiresInDays: '30' });
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  if (!consents.ready) return <PageStatus error={consents.error} onRetry={consents.reload} />;
  if (!links.ready) return <PageStatus error={links.error} onRetry={links.reload} />;

  const shareUrl = (code: string) => `${window.location.origin}/verify/${code}`;

  const toggleConsent = async (teacher: Consents['teachers'][number]) => {
    setNotice(null);
    try {
      if (teacher.consent) {
        if (!window.confirm(`Stop ${teacher.name} seeing your individual results? They'll still see class averages.`)) return;
        await apiSend('DELETE', `/me/consents/${teacher.consent.id}`);
        setNotice({ tone: 'green', text: `${teacher.name} can no longer see your individual results.` });
      } else {
        await apiSend('POST', '/me/consents', { teacherId: teacher.id });
        setNotice({ tone: 'green', text: `${teacher.name} can now see your individual results. Every time they look, it’s recorded in your access log.` });
      }
      consents.reload();
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'That didn’t work' });
    }
  };

  const createLink = async () => {
    setBusy(true);
    try {
      const result = await apiSend<{ code: string }>('POST', '/me/verification-links', {
        label: form.label,
        skills: [...form.skills],
        includeAchievements: form.includeAchievements,
        expiresInDays: Number(form.expiresInDays),
      });
      setCreated(result.code);
      setCreating(false);
      setForm({ label: '', skills: new Set(), includeAchievements: true, expiresInDays: '30' });
      links.reload();
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not create the link' });
      setCreating(false);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm('Turn this link off? Anyone who has it will no longer be able to verify your skills.')) return;
    try {
      await apiSend('POST', `/me/verification-links/${id}/revoke`);
      links.reload();
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not revoke the link' });
    }
  };

  const copy = async (text: string, what: string) => {
    if (await copyText(text)) setCopied(what);
  };

  return (
    <div className="p-8 max-w-4xl">
      <PageHeader eyebrow="Student" accent="orange" title="Sharing & privacy" subtitle="You decide who sees your results, and what you share outside school." />
      {notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}

      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display font-semibold text-gray-900">Share your verified skills</h2>
            <p className="text-sm text-gray-500 font-body">Create a link or code for an employer, university or program. You choose which skills it shows, and you can turn it off at any time.</p>
          </div>
          <Button accent="orange" onClick={() => setCreating(true)}>+ New link</Button>
        </div>
        {links.data.links.length === 0 ? (
          <EmptyState icon="🔗" title="No links yet">Your links appear here, with how many times each has been viewed.</EmptyState>
        ) : (
          <div className="divide-y divide-[#E8EAF0]">
            {links.data.links.map((l) => (
              <div key={l.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm font-body">{l.label || 'Untitled link'}</span>
                    <Badge tone={l.status === 'active' ? 'green' : 'gray'}>{l.status}</Badge>
                  </div>
                  <div className="text-xs text-gray-500 font-body">{l.skills.join(', ')}{l.includeAchievements ? ' · achievements' : ''}</div>
                  <div className="text-xs text-gray-400 font-body">
                    Created {l.created}{l.expires ? ` · ${l.status === 'expired' ? 'expired' : 'expires'} ${l.expires}` : ''} · viewed {l.views} time{l.views === 1 ? '' : 's'}{l.lastViewed ? ` (last ${l.lastViewed})` : ''}
                  </div>
                </div>
                {l.status === 'active' && <Button variant="ghost" className="!py-1 text-xs text-red-600" onClick={() => revoke(l.id)}>Turn off</Button>}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 font-body mt-3">For your privacy the code is shown only once, when you create the link. If you lose it, turn the link off and make a new one.</p>
      </Card>

      <Card className="mb-6">
        <h2 className="font-display font-semibold text-gray-900">Teachers who can see your individual results</h2>
        <p className="text-sm text-gray-500 font-body mb-4">Without your consent, teachers only see class-wide results. You can change this at any time.</p>
        {consents.data.teachers.length === 0 ? (
          <p className="text-sm text-gray-400 font-body">You’re not in any classes yet.</p>
        ) : (
          <div className="divide-y divide-[#E8EAF0]">
            {consents.data.teachers.map((t) => (
              <div key={t.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-900 font-body">{t.name}</div>
                  <div className="text-xs text-gray-500 font-body">{t.classes.join(', ')}{t.consent ? ` · allowed since ${t.consent.grantedAt}` : ''}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={t.consent ? 'green' : 'gray'}>{t.consent ? 'Allowed' : 'Not allowed'}</Badge>
                  <Button variant={t.consent ? 'secondary' : 'primary'} accent="orange" className="!py-1.5 text-xs" onClick={() => toggleConsent(t)}>
                    {t.consent ? 'Stop allowing' : 'Allow'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-display font-semibold text-gray-900">Who has looked at your data</h2>
        <p className="text-sm text-gray-500 font-body mb-4">Every time a teacher, administrator or employer views your results or wallet, it’s recorded in a tamper-evident log.</p>
        <Button variant="secondary" onClick={() => setPage('access-logging')}>Open my access log</Button>
      </Card>

      {creating && (
        <Modal
          title="New verification link"
          onClose={() => setCreating(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
              <Button accent="orange" busy={busy} disabled={form.skills.size === 0} onClick={createLink}>Create link</Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="What is it for? (only you see this)"><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Work experience application" /></Field>
            <div>
              <div className="text-xs font-semibold text-gray-700 font-body mb-1.5">Skills to share</div>
              <div className="grid grid-cols-2 gap-1.5">
                {SKILL_OPTIONS.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-sm font-body">
                    <input
                      type="checkbox"
                      checked={form.skills.has(s.key)}
                      onChange={() => {
                        const next = new Set(form.skills);
                        if (next.has(s.key)) next.delete(s.key);
                        else next.add(s.key);
                        setForm({ ...form, skills: next });
                      }}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-body">
              <input type="checkbox" checked={form.includeAchievements} onChange={(e) => setForm({ ...form, includeAchievements: e.target.checked })} /> Include my achievements
            </label>
            <Field label="Link stops working after">
              <Select value={form.expiresInDays} onChange={(e) => setForm({ ...form, expiresInDays: e.target.value })} className="max-w-[200px]">
                <option value="7">1 week</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
              </Select>
            </Field>
          </div>
        </Modal>
      )}

      {created && (
        <Modal title="Your verification link" onClose={() => { setCreated(null); setCopied(null); }} footer={<Button accent="orange" onClick={() => { setCreated(null); setCopied(null); }}>Done</Button>}>
          <Alert tone="amber">Copy it now: for your privacy it won’t be shown again.</Alert>
          <div className="mt-4 space-y-3">
            <div>
              <div className="text-xs text-gray-500 font-body mb-1">Link</div>
              <div className="flex gap-2">
                <Input readOnly value={shareUrl(created)} className="font-mono text-xs" />
                <Button variant="secondary" onClick={() => copy(shareUrl(created), 'link')}>{copied === 'link' ? 'Copied ✓' : 'Copy'}</Button>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 font-body mb-1">Or the code (to type on a CV)</div>
              <div className="flex gap-2 items-center">
                <span className="font-mono text-lg tracking-wider text-gray-900">{created}</span>
                <Button variant="secondary" onClick={() => copy(created, 'code')}>{copied === 'code' ? 'Copied ✓' : 'Copy'}</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
