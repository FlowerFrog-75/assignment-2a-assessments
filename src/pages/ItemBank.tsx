import { useState } from 'react';
import type { Page } from '../types';
import { apiSend, ApiRequestError, useApiData } from '../lib/api';
import { AiBadge, Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, PageStatus, Select, SKILL_OPTIONS, Textarea } from '../components/ui';
import { AgentRun, GenerateQuestionsModal } from '../components/AiQuestionGenerator';
import { AI_OFF_MESSAGE, useAiStatus } from '../lib/ai';

interface Props { setPage: (p: Page) => void; }

interface Item {
  id: string;
  subject: string;
  skill: string;
  skillLabel: string;
  complexity: number;
  type: 'multiple_choice' | 'short_response';
  prompt: string;
  options: { key: string; text: string }[];
  answer: { correctOption: string; modelAnswer: string; rubric: string };
  points: number;
  source: 'teacher' | 'ai';
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'retired';
  createdBy: string;
  reviewedBy: string;
  reviewComments: string;
  ai?: { model: string | null; passed: boolean | null; notes: string } | null;
  updated: string;
  inUse: boolean;
}

interface ItemList { subjects: string[]; counts: Record<string, number>; items: Item[] }

const sample: ItemList = {
  subjects: ['Science'],
  counts: { approved: 1, pending_review: 1 },
  items: [
    { id: '1', subject: 'Science', skill: 'analytical-thinking', skillLabel: 'Analytical Thinking', complexity: 3, type: 'multiple_choice', prompt: 'Which best describes an analytical approach to investigating this finding?', options: [{ key: 'A', text: 'Accept it' }, { key: 'B', text: 'Design a controlled experiment' }], answer: { correctOption: 'B', modelAnswer: '', rubric: '' }, points: 1, source: 'teacher', status: 'approved', createdBy: 'Sarah Chen', reviewedBy: 'Sarah Chen', reviewComments: '', updated: '1 Nov 2026', inUse: true },
  ],
};

const STATUS: Record<Item['status'], { label: string; tone: 'gray' | 'green' | 'amber' | 'red' }> = {
  draft: { label: 'Draft', tone: 'gray' },
  pending_review: { label: 'Needs review', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  retired: { label: 'Retired', tone: 'gray' },
};

const COMPLEXITY = ['', '1 · Recall', '2 · Apply', '3 · Analyse', '4 · Evaluate', '5 · Create'];

function ItemForm({ item, subjects, onClose, onSaved }: { item: Item | null; subjects: string[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    subject: item?.subject ?? subjects[0] ?? '',
    skill: item?.skill ?? 'analytical-thinking',
    complexity: String(item?.complexity ?? 2),
    type: item?.type ?? ('multiple_choice' as Item['type']),
    prompt: item?.prompt ?? '',
    points: String(item?.points ?? 1),
    options: item?.options.length ? item.options.map((o) => o.text) : ['', '', '', ''],
    correctOption: item?.answer.correctOption ?? 'A',
    modelAnswer: item?.answer.modelAnswer ?? '',
    rubric: item?.answer.rubric ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const options = form.options.map((text) => ({ text })).filter((o) => o.text.trim());
    const body = {
      subject: form.subject,
      skill: form.skill,
      complexity: Number(form.complexity),
      type: form.type,
      prompt: form.prompt,
      points: Number(form.points),
      options,
      answer: { correctOption: form.correctOption, modelAnswer: form.modelAnswer, rubric: form.rubric },
    };
    try {
      if (item) await apiSend('PUT', `/items/${item.id}`, body);
      else await apiSend('POST', '/items', body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={item ? 'Edit question' : 'New question'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button accent="emerald" busy={busy} onClick={save}>{item ? 'Save (back to review)' : 'Add question'}</Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-4 gap-4">
        <Field label="Subject" className="sm:col-span-2">
          <Input list="subjects" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Science" />
          <datalist id="subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Skill" className="sm:col-span-2">
          <Select value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })}>
            {SKILL_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Complexity">
          <Select value={form.complexity} onChange={(e) => setForm({ ...form, complexity: e.target.value })}>
            {[1, 2, 3, 4, 5].map((c) => <option key={c} value={c}>{COMPLEXITY[c]}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Item['type'] })}>
            <option value="multiple_choice">Multiple choice</option>
            <option value="short_response">Short response</option>
          </Select>
        </Field>
        <Field label="Marks">
          <Input type="number" min={1} max={20} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
        </Field>
        <Field label="Question" className="sm:col-span-4">
          <Textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} rows={3} />
        </Field>
        {form.type === 'multiple_choice' ? (
          <div className="sm:col-span-4 space-y-2">
            <div className="text-xs font-semibold text-gray-700 font-body">Options (select the correct one)</div>
            {form.options.map((text, i) => {
              const key = String.fromCharCode(65 + i);
              return (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" name="correct" checked={form.correctOption === key} onChange={() => setForm({ ...form, correctOption: key })} aria-label={`Option ${key} is correct`} />
                  <span className="w-5 text-sm font-mono text-gray-500">{key}</span>
                  <Input value={text} onChange={(e) => setForm({ ...form, options: form.options.map((o, j) => (j === i ? e.target.value : o)) })} />
                  {form.options.length > 2 && (
                    <Button variant="ghost" className="!px-2" aria-label={`Remove option ${key}`} onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i), correctOption: 'A' })}>✕</Button>
                  )}
                </div>
              );
            })}
            {form.options.length < 8 && <Button variant="ghost" className="text-xs" onClick={() => setForm({ ...form, options: [...form.options, ''] })}>+ Add option</Button>}
          </div>
        ) : (
          <>
            <Field label="Model answer" className="sm:col-span-2"><Textarea value={form.modelAnswer} onChange={(e) => setForm({ ...form, modelAnswer: e.target.value })} rows={4} /></Field>
            <Field label="Marking guide" className="sm:col-span-2"><Textarea value={form.rubric} onChange={(e) => setForm({ ...form, rubric: e.target.value })} rows={4} placeholder="e.g. 1 mark for each valid reason (max 2)…" /></Field>
          </>
        )}
        {error && <div className="sm:col-span-4"><Alert>{error}</Alert></div>}
      </div>
    </Modal>
  );
}

export default function ItemBank(_: Props) {
  const [status, setStatus] = useState('');
  const [subject, setSubject] = useState('');
  const [skill, setSkill] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const params = new URLSearchParams({ ...(status && { status }), ...(subject && { subject }), ...(skill && { skill }), ...(search && { q: search }) });
  const items = useApiData(`/items?${params}`, sample);
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [reviewing, setReviewing] = useState<Item | null>(null);
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const ai = useAiStatus();
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  if (!items.ready && !items.error) return <PageStatus error={null} />;
  const aiOff = ai.ready && ai.data.mode === 'off';
  const d = items.data;

  const review = async (item: Item, decision: 'approve' | 'reject') => {
    setBusy(true);
    try {
      await apiSend('POST', `/items/${item.id}/review`, { decision, comments });
      setNotice({ tone: 'green', text: decision === 'approve' ? 'Question approved. It can now appear on papers.' : 'Question rejected.' });
      setReviewing(null);
      setComments('');
      items.reload();
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not save the review' });
    } finally {
      setBusy(false);
    }
  };

  const retire = async (item: Item) => {
    if (!window.confirm('Retire this question? It won’t be used on new papers. Past results that used it are kept.')) return;
    try {
      await apiSend('POST', `/items/${item.id}/retire`);
      items.reload();
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not retire' });
    }
  };

  return (
    <div className="p-8">
      <PageHeader
        eyebrow="Teaching"
        accent="emerald"
        title="Question bank"
        subtitle="Questions must be approved by a teacher before the assessment engine can put them on a paper."
        actions={
          <>
            <span title={aiOff ? AI_OFF_MESSAGE : undefined}>
              <Button className="!bg-violet-600 hover:!bg-violet-700" disabled={!ai.ready || aiOff} onClick={() => setGenerating(true)}>✦ Generate with AI</Button>
            </span>
            <Button accent="emerald" onClick={() => setEditing('new')}>+ New question</Button>
          </>
        }
      />
      <div className="flex flex-wrap gap-2 mb-4">
        {[['', 'All'], ['pending_review', 'Needs review'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['retired', 'Retired']].map(([value, label]) => (
          <button key={value} onClick={() => setStatus(value)} className={`px-3 py-1.5 rounded-full text-sm font-body border ${status === value ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-[#E8EAF0] hover:bg-gray-50'}`}>
            {label}{value && d.counts[value] ? ` (${d.counts[value]})` : ''}
          </button>
        ))}
      </div>
      <Card className="mb-4" padded={false}>
        <form className="flex flex-wrap gap-3 p-4" onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()); }}>
          <Input placeholder="Search question text" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" />
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="max-w-[200px]">
            <option value="">All subjects</option>
            {d.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={skill} onChange={(e) => setSkill(e.target.value)} className="max-w-[200px]">
            <option value="">All skills</option>
            {SKILL_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </Card>
      {notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}
      {items.error ? (
        <PageStatus error={items.error} onRetry={items.reload} />
      ) : d.items.length === 0 ? (
        <Card>
          <EmptyState icon="🗃️" title="No questions here">
            Add questions with “New question”. A starter set for the seven skills can be loaded on the server with <code>pnpm db:starter-items</code>.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {d.items.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Badge>
                <Badge tone="purple">{item.skillLabel}</Badge>
                <Badge>{item.subject}</Badge>
                <Badge>{COMPLEXITY[item.complexity]}</Badge>
                <Badge>{item.type === 'multiple_choice' ? 'Multiple choice' : 'Short response'} · {item.points} mark{item.points === 1 ? '' : 's'}</Badge>
                {item.source === 'ai' && <AiBadge model={item.ai?.model} passed={item.ai?.passed} />}
                {item.inUse && <Badge tone="blue">Used in papers</Badge>}
              </div>
              <p className="text-sm text-gray-900 font-body mb-2 whitespace-pre-wrap">{item.prompt}</p>
              {item.ai?.notes && (
                <p className={`text-xs font-body mb-2 px-3 py-2 rounded-lg ${item.ai.passed ? 'bg-violet-50/60 text-violet-900' : 'bg-amber-50 text-amber-900'}`}>
                  <strong>Validator agent:</strong> {item.ai.notes}
                </p>
              )}
              {item.type === 'multiple_choice' ? (
                <ul className="text-sm font-body space-y-0.5 mb-2">
                  {item.options.map((o) => (
                    <li key={o.key} className={o.key === item.answer.correctOption ? 'text-emerald-700 font-medium' : 'text-gray-600'}>
                      {o.key}. {o.text} {o.key === item.answer.correctOption && '✓'}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-gray-500 font-body mb-2"><strong>Marking guide:</strong> {item.answer.rubric || '—'}</div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-gray-400 font-body">
                  {item.source === 'ai' ? `Drafted by AI${item.createdBy ? ` for ${item.createdBy}` : ''}` : item.createdBy ? `Added by ${item.createdBy}` : 'Starter question'} · updated {item.updated}
                  {item.reviewedBy && ` · reviewed by ${item.reviewedBy}`}
                  {item.reviewComments && ` · “${item.reviewComments}”`}
                </div>
                <div className="flex gap-1">
                  {(item.status === 'pending_review' || item.status === 'draft' || item.status === 'rejected') && (
                    <Button variant="success" className="!py-1 text-xs" onClick={() => setReviewing(item)}>Review</Button>
                  )}
                  {!item.inUse && item.status !== 'retired' && <Button variant="ghost" className="!py-1 text-xs" onClick={() => setEditing(item)}>Edit</Button>}
                  {item.status !== 'retired' && <Button variant="ghost" className="!py-1 text-xs text-red-600" onClick={() => retire(item)}>Retire</Button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <ItemForm
          item={editing === 'new' ? null : editing}
          subjects={d.subjects}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice({ tone: 'green', text: 'Saved. The question is waiting for review.' });
            items.reload();
          }}
        />
      )}
      {reviewing && (
        <Modal
          title="Review question"
          onClose={() => setReviewing(null)}
          footer={
            <>
              <Button variant="secondary" busy={busy} onClick={() => review(reviewing, 'reject')}>Reject</Button>
              <Button variant="success" busy={busy} onClick={() => review(reviewing, 'approve')}>Approve</Button>
            </>
          }
        >
          <p className="text-sm text-gray-900 font-body mb-3 whitespace-pre-wrap">{reviewing.prompt}</p>
          {reviewing.type === 'multiple_choice' ? (
            <ul className="text-sm font-body space-y-1 mb-4">
              {reviewing.options.map((o) => (
                <li key={o.key} className={o.key === reviewing.answer.correctOption ? 'text-emerald-700 font-medium' : 'text-gray-600'}>{o.key}. {o.text} {o.key === reviewing.answer.correctOption && '✓ correct'}</li>
              ))}
            </ul>
          ) : (
            <div className="text-sm font-body space-y-2 mb-4">
              <div><strong>Model answer:</strong> {reviewing.answer.modelAnswer || '—'}</div>
              <div><strong>Marking guide:</strong> {reviewing.answer.rubric || '—'}</div>
            </div>
          )}
          {reviewing.ai?.notes && (
            <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs font-body text-violet-900">
              <div className="flex items-center gap-2 mb-1"><AiBadge model={reviewing.ai.model} passed={reviewing.ai.passed} /></div>
              <strong>Validator agent&apos;s review:</strong> {reviewing.ai.notes}
            </div>
          )}
          <p className="text-xs text-gray-500 font-body mb-3">Check that the question is accurate, fair and age-appropriate, that it really tests <strong>{reviewing.skillLabel}</strong>, and that the answer is right.{reviewing.source === 'ai' ? ' The AI has checked it, but you make the decision.' : ''}</p>
          <Field label="Comments (optional)"><Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} /></Field>
        </Modal>
      )}
      {generating && ai.ready && (
        <GenerateQuestionsModal
          status={ai.data}
          subjects={d.subjects}
          onClose={() => setGenerating(false)}
          onStarted={(id) => {
            setGenerating(false);
            setJobId(id);
          }}
        />
      )}
      {jobId && (
        <AgentRun
          jobId={jobId}
          onClose={() => {
            setJobId(null);
            items.reload();
          }}
          onReview={() => {
            setJobId(null);
            setStatus('pending_review');
            items.reload();
          }}
        />
      )}
    </div>
  );
}
