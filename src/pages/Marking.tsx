import { useEffect, useState } from 'react';
import type { Page } from '../types';
import { apiSend, ApiRequestError, useApiData } from '../lib/api';
import { AiSuggestion, Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, PageStatus, Textarea } from '../components/ui';
import { AI_OFF_MESSAGE, useAiStatus } from '../lib/ai';

interface Props { setPage: (p: Page) => void; }

interface Row {
  id: string;
  student: string;
  assessment: string;
  className: string;
  submitted: string;
  status: 'submitted' | 'marked' | 'released';
  percent: number | null;
  grade: string | null;
  unmarked: number;
}
interface List { counts: { toMark: number; toRelease: number; released: number }; attempts: Row[] }

interface Question {
  number: number;
  itemId: string;
  skill: string;
  type: 'multiple_choice' | 'short_response';
  prompt: string;
  options: { key: string; text: string }[];
  correctOption: string;
  modelAnswer: string;
  rubric: string;
  maxPoints: number;
  answer: string;
  points: number | null;
}
interface Submission {
  id: string;
  student: string;
  walletId: string;
  assessment: string;
  subject: string;
  status: Row['status'];
  submitted: string;
  feedback: string;
  result: { percent: number; grade: string; score: number; maxScore: number; coins: number } | null;
  questions: Question[];
}

const sample: List = {
  counts: { toMark: 1, toRelease: 1, released: 4 },
  attempts: [
    { id: '1', student: 'Jordan Smith', assessment: 'Critical Thinking in Data Interpretation', className: '11B', submitted: '1 Nov 2026, 10:40 am', status: 'submitted', percent: null, grade: null, unmarked: 2 },
    { id: '2', student: 'Maya Patel', assessment: 'Critical Thinking in Data Interpretation', className: '11B', submitted: '1 Nov 2026, 10:38 am', status: 'marked', percent: 82, grade: 'B', unmarked: 0 },
  ],
};

function MarkingPanel({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const sub = useApiData<Submission | null>(`/marking/${id}`, null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const ai = useAiStatus();
  const [aiMarks, setAiMarks] = useState<Record<string, { points: number; rationale: string; confidence: string }>>({});
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<'marks' | 'feedback' | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiBlocked = !ai.ready ? 'Checking AI…' : ai.data.mode === 'off' ? AI_OFF_MESSAGE : !ai.data.markingEnabled ? 'AI marking help is turned off. An administrator can turn it on in School Settings.' : null;

  const suggestMarks = async (id: string) => {
    setAiBusy('marks');
    setAiError(null);
    try {
      const result = await apiSend<{ suggestions: { itemId: string; points: number; rationale: string; confidence: string }[] }>('POST', `/marking/${id}/ai-suggest`);
      const byId = Object.fromEntries(result.suggestions.map((x) => [x.itemId, x]));
      setAiMarks(byId);
      // Fill only the marks the teacher hasn't entered yet; they can change any of them.
      setMarks((current) => {
        const next = { ...current };
        for (const x of result.suggestions) if (next[x.itemId] === '' || next[x.itemId] === undefined) next[x.itemId] = String(x.points);
        return next;
      });
    } catch (err) {
      setAiError(err instanceof ApiRequestError ? err.message : 'The AI request failed');
    } finally {
      setAiBusy(null);
    }
  };

  const suggestFeedback = async (id: string) => {
    setAiBusy('feedback');
    setAiError(null);
    try {
      const result = await apiSend<{ feedback: string }>('POST', `/marking/${id}/ai-feedback`);
      setAiFeedback(result.feedback);
      setFeedback((current) => (current.trim() ? current : result.feedback));
    } catch (err) {
      setAiError(err instanceof ApiRequestError ? err.message : 'The AI request failed');
    } finally {
      setAiBusy(null);
    }
  };
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  useEffect(() => {
    if (sub.ready && sub.data) {
      setMarks(Object.fromEntries(sub.data.questions.filter((q) => q.type === 'short_response').map((q) => [q.itemId, q.points === null ? '' : String(q.points)])));
      setFeedback(sub.data.feedback);
    }
  }, [sub.ready, sub.data]);

  if (!sub.ready || !sub.data) return <PageStatus error={sub.error} onRetry={sub.reload} />;
  const d = sub.data;
  const released = d.status === 'released';

  const save = async (release: boolean) => {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await apiSend<{ status: string }>('POST', `/marking/${d.id}`, { marks: Object.fromEntries(Object.entries(marks).filter(([, v]) => v !== '')), feedback });
      if (release) {
        if (saved.status !== 'marked') throw new ApiRequestError(400, 'incomplete', 'Mark every written answer before releasing.');
        await apiSend('POST', '/marking/release', { ids: [d.id] });
      }
      onSaved();
      if (release) onClose();
      else {
        sub.reload();
        setNotice({ tone: 'green', text: saved.status === 'marked' ? 'Marking complete. Release the result when you’re ready.' : 'Marks saved.' });
      }
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not save' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 font-body mb-3">← All submissions</button>
      <PageHeader
        eyebrow={`${d.subject} · submitted ${d.submitted}`}
        accent="emerald"
        title={`${d.student}: ${d.assessment}`}
        subtitle={d.result ? `Result: ${d.result.score}/${d.result.maxScore} (${d.result.percent}%, ${d.result.grade}) · ${d.result.coins} skill coins on release` : 'Mark each written answer. Multiple-choice answers are marked automatically.'}
      />
      {notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}
      {released && <div className="mb-4"><Alert tone="blue">This result has been released to the student, so the marks are final.</Alert></div>}
      {!released && d.questions.some((q) => q.type === 'short_response') && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3">
          <span className="text-sm text-violet-900 font-body mr-auto">AI can suggest marks against the marking guide and draft feedback. You decide what&apos;s saved.</span>
          <span title={aiBlocked ?? undefined}>
            <Button variant="secondary" busy={aiBusy === 'marks'} disabled={Boolean(aiBlocked) || aiBusy !== null} onClick={() => suggestMarks(d.id)}>✦ Suggest marks with AI</Button>
          </span>
          <span title={aiBlocked ?? undefined}>
            <Button variant="secondary" busy={aiBusy === 'feedback'} disabled={Boolean(aiBlocked) || aiBusy !== null} onClick={() => suggestFeedback(d.id)}>✦ Draft feedback with AI</Button>
          </span>
          {ai.ready && ai.data.mode === 'offline' && <span className="w-full text-[11px] text-amber-800 font-body">Offline demo: suggestions come from a scripted stand-in, not a real AI model.</span>}
        </div>
      )}
      {aiError && <div className="mb-4"><Alert>{aiError}</Alert></div>}
      <div className="space-y-4">
        {d.questions.map((q) => (
          <Card key={q.itemId}>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-display font-bold text-gray-900">Q{q.number}</span>
              <Badge tone="purple">{q.skill}</Badge>
              <Badge>{q.maxPoints} mark{q.maxPoints === 1 ? '' : 's'}</Badge>
            </div>
            <p className="text-sm text-gray-900 font-body mb-3 whitespace-pre-wrap">{q.prompt}</p>
            {q.type === 'multiple_choice' ? (
              <ul className="text-sm font-body space-y-1">
                {q.options.map((o) => (
                  <li key={o.key} className={`px-3 py-1.5 rounded-lg ${o.key === q.correctOption ? 'bg-emerald-50 text-emerald-800' : o.key === q.answer ? 'bg-red-50 text-red-700' : 'text-gray-600'}`}>
                    {o.key}. {o.text} {o.key === q.answer && <strong>(student’s answer)</strong>} {o.key === q.correctOption && '✓'}
                  </li>
                ))}
                {!q.answer && <li className="text-gray-400 italic">Not answered</li>}
              </ul>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold text-gray-500 font-body mb-1">Student’s answer</div>
                  <div className="text-sm text-gray-900 font-body bg-gray-50 rounded-xl p-3 whitespace-pre-wrap min-h-[80px]">{q.answer || <span className="text-gray-400 italic">Not answered</span>}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 font-body mb-1">Marking guide</div>
                  <div className="text-xs text-gray-600 font-body mb-2 whitespace-pre-wrap">{q.rubric || '—'}</div>
                  <div className="text-xs font-semibold text-gray-500 font-body mb-1">Model answer</div>
                  <div className="text-xs text-gray-600 font-body whitespace-pre-wrap">{q.modelAnswer || '—'}</div>
                </div>
                <Field label={`Marks (0 to ${q.maxPoints})`}>
                  <Input
                    type="number"
                    min={0}
                    max={q.maxPoints}
                    step={0.5}
                    disabled={released}
                    value={marks[q.itemId] ?? ''}
                    onChange={(e) => setMarks({ ...marks, [q.itemId]: e.target.value })}
                    className={`max-w-[120px] ${aiMarks[q.itemId] && marks[q.itemId] === String(aiMarks[q.itemId].points) ? '!border-violet-300 !bg-violet-50/50' : ''}`}
                  />
                </Field>
                {aiMarks[q.itemId] && !released && (
                  <div className="md:col-span-2">
                    <AiSuggestion onAccept={() => setMarks({ ...marks, [q.itemId]: String(aiMarks[q.itemId].points) })} acceptLabel={`Use ${aiMarks[q.itemId].points}/${q.maxPoints}`}>
                      <strong>{aiMarks[q.itemId].points}/{q.maxPoints}</strong> ({aiMarks[q.itemId].confidence} confidence). {aiMarks[q.itemId].rationale}
                    </AiSuggestion>
                  </div>
                )}
              </div>
            )}
            {q.type === 'multiple_choice' && <div className="text-xs text-gray-500 font-body mt-2">Marked automatically: {q.points ?? 0}/{q.maxPoints}</div>}
          </Card>
        ))}
        <Card>
          <Field label="Feedback for the student (optional)">
            <Textarea disabled={released} value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} />
          </Field>
          {aiFeedback && !released && feedback !== aiFeedback && (
            <div className="mt-2">
              <AiSuggestion onAccept={() => setFeedback(aiFeedback)} acceptLabel="Use this draft">{aiFeedback}</AiSuggestion>
            </div>
          )}
          {!released && (
            <div className="flex flex-wrap gap-2 mt-4">
              <Button variant="secondary" busy={busy} onClick={() => save(false)}>Save marks</Button>
              <Button accent="emerald" busy={busy} onClick={() => save(true)}>Save and release to student</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function Marking(_: Props) {
  const list = useApiData('/marking', sample);
  const [tab, setTab] = useState<Row['status']>('submitted');
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  if (open) return <MarkingPanel id={open} onClose={() => setOpen(null)} onSaved={list.reload} />;
  if (!list.ready) return <PageStatus error={list.error} onRetry={list.reload} />;
  const rows = list.data.attempts.filter((a) => a.status === tab);

  const release = async (ids: string[]) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await apiSend<{ released: number; coins: number }>('POST', '/marking/release', { ids });
      setNotice({ tone: 'green', text: `${result.released} result${result.released === 1 ? '' : 's'} released. ${result.coins} skill coins issued and being written to the blockchain.` });
      setSelected(new Set());
      list.reload();
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not release' });
    } finally {
      setBusy(false);
    }
  };

  const tabs: [Row['status'], string, number][] = [
    ['submitted', 'To mark', list.data.counts.toMark],
    ['marked', 'Ready to release', list.data.counts.toRelease],
    ['released', 'Released', list.data.counts.released],
  ];

  return (
    <div className="p-8">
      <PageHeader eyebrow="Teaching" accent="emerald" title="Marking & release" subtitle="Students see their results, and earn skill coins, only after you release them." />
      <div className="flex gap-2 mb-4">
        {tabs.map(([key, label, count]) => (
          <button key={key} onClick={() => { setTab(key); setSelected(new Set()); }} className={`px-3 py-1.5 rounded-full text-sm font-body border ${tab === key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-[#E8EAF0] hover:bg-gray-50'}`}>
            {label} ({count})
          </button>
        ))}
      </div>
      {notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}
      {tab === 'marked' && rows.length > 0 && (
        <div className="flex items-center gap-3 mb-3">
          <Button accent="emerald" busy={busy} disabled={selected.size === 0} onClick={() => release([...selected])}>Release {selected.size || ''} selected</Button>
          <Button variant="secondary" busy={busy} onClick={() => release(rows.map((r) => r.id))}>Release all {rows.length}</Button>
        </div>
      )}
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState icon={tab === 'submitted' ? '✅' : '📭'} title={tab === 'submitted' ? 'Nothing to mark' : tab === 'marked' ? 'Nothing waiting to be released' : 'No released results yet'}>
            {tab === 'submitted' && 'Submissions with written answers appear here. Multiple-choice-only papers are marked automatically and go straight to “Ready to release”.'}
          </EmptyState>
        ) : (
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-[#E8EAF0]">
                {tab === 'marked' && <th className="px-4 py-3 w-8"></th>}
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Assessment</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">{tab === 'submitted' ? 'To mark' : 'Result'}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[#E8EAF0] last:border-0 hover:bg-gray-50/50">
                  {tab === 'marked' && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.student}`}
                        checked={selected.has(r.id)}
                        onChange={() => {
                          const next = new Set(selected);
                          if (next.has(r.id)) next.delete(r.id);
                          else next.add(r.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 text-gray-900">{r.student}<div className="text-xs text-gray-400">{r.className}</div></td>
                  <td className="px-4 py-3 text-gray-600">{r.assessment}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.submitted}</td>
                  <td className="px-4 py-3">{tab === 'submitted' ? <Badge tone="amber">{r.unmarked} answer{r.unmarked === 1 ? '' : 's'}</Badge> : <span className="font-semibold">{r.percent}% <span className="text-gray-400">{r.grade}</span></span>}</td>
                  <td className="px-4 py-3 text-right"><Button variant="ghost" className="!py-1 text-xs" onClick={() => setOpen(r.id)}>{tab === 'submitted' ? 'Mark' : 'View'}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
