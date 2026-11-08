// The AI question generator: a request form, then a live view of the agents'
// work (author drafts, validator reviews, revisions) and the results.
import { useEffect, useState } from 'react';
import { apiGet, apiSend, ApiRequestError } from '../lib/api';
import type { AiStatus } from '../lib/ai';
import { AgentTimeline, AiBadge, Alert, Badge, Button, Field, Input, Modal, Select, SKILL_OPTIONS, Textarea, type AgentStep } from './ui';

interface JobItem {
  id: string;
  prompt: string;
  skillLabel: string;
  complexity: number;
  type: 'multiple_choice' | 'short_response';
  status: string;
  passed: boolean;
  notes: string;
}

interface Job {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  mode: 'claude' | 'offline';
  model: string | null;
  steps: AgentStep[];
  items: JobItem[];
  usage: { inputTokens: number; outputTokens: number };
  error: string | null;
}

/** Live view of one AI job. Polls until it finishes. */
export function AgentRun({ jobId, onClose, onReview }: { jobId: string; onClose: () => void; onReview: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      const result = await apiGet<Job>(`/ai/jobs/${jobId}`);
      if (stopped) return;
      if (result.kind === 'ok') {
        setJob(result.data);
        if (result.data.status === 'running' || result.data.status === 'queued') setTimeout(poll, 1200);
      } else if (result.kind === 'error') setError(result.error.message);
      else setTimeout(poll, 3000);
    };
    poll();
    return () => {
      stopped = true;
    };
  }, [jobId]);

  const running = !job || job.status === 'running' || job.status === 'queued';
  const queued = job?.items.filter((i) => i.status === 'pending_review') ?? [];
  const drafts = job?.items.filter((i) => i.status !== 'pending_review') ?? [];

  return (
    <Modal
      title={running ? 'The AI is working…' : job?.status === 'failed' ? 'The AI stopped' : 'Questions ready for your review'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{running ? 'Keep working in the background' : 'Close'}</Button>
          {!running && queued.length > 0 && <Button accent="emerald" onClick={onReview}>Review {queued.length} question{queued.length === 1 ? '' : 's'}</Button>}
        </>
      }
    >
      {job?.mode === 'offline' && (
        <div className="mb-4">
          <Alert tone="amber">Offline demo: a scripted stand-in runs the same steps so you can see the workflow. Add an API key on the server for real AI.</Alert>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      <p className="text-xs text-gray-500 font-body mb-3">
        An <strong>author agent</strong> drafts each question using the school&apos;s approved questions as examples. A separate <strong>validator agent</strong>, which never
        sees the author&apos;s reasoning, checks the answer key, that there&apos;s one best answer, the skill and the complexity. Failed questions are revised once.
        Nothing is used until a teacher approves it.
      </p>
      <div className="rounded-xl border border-[#E8EAF0] p-4 max-h-[42vh] overflow-y-auto">
        <AgentTimeline steps={job?.steps ?? []} running={running} />
      </div>
      {job?.status === 'failed' && <div className="mt-4"><Alert>{job.error}</Alert></div>}
      {!running && job && job.items.length > 0 && (
        <div className="mt-4 space-y-2">
          {[...queued, ...drafts].map((item) => (
            <div key={item.id} className="rounded-xl border border-[#E8EAF0] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <AiBadge model={job.model} passed={item.status === 'pending_review'} />
                <Badge tone="purple">{item.skillLabel}</Badge>
                <Badge>Complexity {item.complexity}</Badge>
                <Badge>{item.type === 'multiple_choice' ? 'Multiple choice' : 'Short response'}</Badge>
                {item.status !== 'pending_review' && <Badge tone="amber">Kept as draft</Badge>}
              </div>
              <p className="text-sm text-gray-900 font-body">{item.prompt}</p>
              <p className="text-xs text-gray-500 font-body mt-1">{item.notes}</p>
            </div>
          ))}
          {job.mode === 'claude' && job.usage.inputTokens > 0 && (
            <p className="text-[11px] text-gray-400 font-body">AI usage: {job.usage.inputTokens.toLocaleString()} input and {job.usage.outputTokens.toLocaleString()} output tokens.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

/** The request form: what to generate. */
export function GenerateQuestionsModal({ status, subjects, onClose, onStarted }: { status: AiStatus; subjects: string[]; onClose: () => void; onStarted: (jobId: string) => void }) {
  const [form, setForm] = useState({ subject: subjects[0] ?? 'General Capabilities', skills: new Set<string>(['critical-thinking']), complexities: new Set<number>([2, 3]), count: '4', types: 'mixed', yearLevel: '10', topic: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await apiSend<{ jobId: string }>('POST', '/ai/item-jobs', {
        subject: form.subject,
        skills: [...form.skills],
        complexities: [...form.complexities],
        count: Number(form.count),
        types: form.types,
        yearLevel: Number(form.yearLevel) || undefined,
        topic: form.topic,
      });
      onStarted(result.jobId);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not start the AI');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Generate questions with AI"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button className="!bg-violet-600 hover:!bg-violet-700" busy={busy} disabled={!form.skills.size || !form.complexities.size || !form.subject.trim()} onClick={start}>
            ✦ Generate {form.count} question{form.count === '1' ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-4 gap-4">
        <Field label="Subject" className="sm:col-span-2">
          <Input list="ai-subjects" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <datalist id="ai-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Year level">
          <Select value={form.yearLevel} onChange={(e) => setForm({ ...form, yearLevel: e.target.value })}>
            {Array.from({ length: 6 }, (_, i) => i + 7).map((y) => <option key={y} value={y}>Year {y}</option>)}
          </Select>
        </Field>
        <Field label="How many">
          <Select value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-4">
          <div className="text-xs font-semibold text-gray-700 font-body mb-1.5">Skills</div>
          <div className="flex flex-wrap gap-2">
            {SKILL_OPTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={form.skills.has(s.key)}
                onClick={() => setForm({ ...form, skills: toggle(form.skills, s.key) })}
                className={`px-3 py-1.5 rounded-full text-sm font-body border ${form.skills.has(s.key) ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-[#E8EAF0] hover:bg-gray-50'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <div className="text-xs font-semibold text-gray-700 font-body mb-1.5">Complexity</div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={form.complexities.has(c)}
                title={['', 'Recall', 'Apply', 'Analyse', 'Evaluate', 'Create'][c]}
                onClick={() => setForm({ ...form, complexities: toggle(form.complexities, c) })}
                className={`w-10 h-9 rounded-lg text-sm font-semibold font-body border ${form.complexities.has(c) ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-[#E8EAF0] hover:bg-gray-50'}`}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 font-body mt-1">1 Recall · 2 Apply · 3 Analyse · 4 Evaluate · 5 Create</p>
        </div>
        <Field label="Question types" className="sm:col-span-2">
          <Select value={form.types} onChange={(e) => setForm({ ...form, types: e.target.value })}>
            <option value="mixed">Mostly multiple choice, some written</option>
            <option value="multiple_choice">Multiple choice only</option>
            <option value="short_response">Short response only</option>
          </Select>
        </Field>
        <Field label="Topic or context (optional)" className="sm:col-span-4" hint="e.g. “Ecosystems unit”, “Planning the school fete”. Questions are set in this context.">
          <Textarea rows={2} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
        </Field>
        <div className="sm:col-span-4 text-xs text-gray-500 font-body">
          Using: <strong>{status.label}</strong>. The questions go to <strong>Needs review</strong>: nothing reaches students until a teacher approves it.
        </div>
        {error && <div className="sm:col-span-4"><Alert>{error}</Alert></div>}
      </div>
    </Modal>
  );
}
