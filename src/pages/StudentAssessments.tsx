import { useState } from 'react';
import type { Page } from '../types';
import { apiSend, ApiRequestError, selectAttempt, selectResult, useApiData } from '../lib/api';
import { Alert, Badge, Button, Card, EmptyState, Modal, PageHeader, PageStatus } from '../components/ui';

interface Props { setPage: (p: Page) => void; }

interface Assigned {
  templateId: string;
  title: string;
  subject: string;
  description: string;
  durationMinutes: number;
  questions: number;
  skills: string[];
  due: string | null;
  overdue: boolean;
  status: 'not_started' | 'in_progress' | 'submitted' | 'marked' | 'released';
  attemptId: string | null;
  percent: number | null;
}

const sample: { assessments: Assigned[] } = {
  assessments: [
    { templateId: '1', title: 'Critical Thinking in Data Interpretation', subject: 'Science', description: 'Analyse graphs and evaluate claims.', durationMinutes: 45, questions: 5, skills: ['Critical Thinking', 'Analytical Thinking'], due: '8 Nov 2026', overdue: false, status: 'not_started', attemptId: null, percent: null },
  ],
};

const STATUS: Record<Assigned['status'], { label: string; tone: 'gray' | 'amber' | 'blue' | 'green' | 'purple' }> = {
  not_started: { label: 'Not started', tone: 'gray' },
  in_progress: { label: 'In progress', tone: 'amber' },
  submitted: { label: 'Submitted · being marked', tone: 'blue' },
  marked: { label: 'Submitted · awaiting release', tone: 'blue' },
  released: { label: 'Results ready', tone: 'green' },
};

export default function StudentAssessments({ setPage }: Props) {
  const list = useApiData('/me/assessments', sample);
  const [confirm, setConfirm] = useState<Assigned | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!list.ready) return <PageStatus error={list.error} onRetry={list.reload} />;
  const items = list.data.assessments;
  const todo = items.filter((a) => a.status === 'not_started' || a.status === 'in_progress');
  const done = items.filter((a) => a.status !== 'not_started' && a.status !== 'in_progress');

  const start = async (a: Assigned) => {
    setBusy(true);
    setError(null);
    try {
      const result = await apiSend<{ attemptId: string }>('POST', `/me/assessments/${a.templateId}/start`);
      selectAttempt(result.attemptId);
      setPage('assessment-interface');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not start the assessment');
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const card = (a: Assigned) => (
    <Card key={a.templateId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
            {a.overdue && <Badge tone="red">Overdue</Badge>}
          </div>
          <div className="font-display font-bold text-gray-900">{a.title}</div>
          <div className="text-xs text-gray-500 font-body">{a.subject} · {a.questions} questions · {a.durationMinutes} min{a.due ? ` · due ${a.due}` : ''}</div>
          {a.description && <p className="text-sm text-gray-600 font-body mt-2">{a.description}</p>}
          <div className="flex flex-wrap gap-1 mt-2">{a.skills.map((s) => <Badge key={s} tone="purple">{s}</Badge>)}</div>
        </div>
        <div>
          {a.status === 'not_started' && <Button accent="orange" onClick={() => setConfirm(a)}>Start</Button>}
          {a.status === 'in_progress' && <Button accent="orange" busy={busy} onClick={() => start(a)}>Resume</Button>}
          {a.status === 'released' && a.attemptId && (
            <Button variant="secondary" onClick={() => { selectResult(a.attemptId!); setPage('results-interface'); }}>
              View results{a.percent !== null ? ` (${a.percent}%)` : ''}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <div className="p-8 max-w-4xl">
      <PageHeader eyebrow="Student" accent="orange" title="My assessments" subtitle="Assessments your teachers have set for your classes." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {items.length === 0 ? (
        <Card><EmptyState icon="📝" title="Nothing assigned yet">When a teacher assigns an assessment to one of your classes, it appears here.</EmptyState></Card>
      ) : (
        <>
          <h2 className="font-display font-semibold text-gray-900 mb-3">To do</h2>
          <div className="space-y-3 mb-8">{todo.length ? todo.map(card) : <p className="text-sm text-gray-400 font-body">All done. Nice work!</p>}</div>
          {done.length > 0 && (
            <>
              <h2 className="font-display font-semibold text-gray-900 mb-3">Completed</h2>
              <div className="space-y-3">{done.map(card)}</div>
            </>
          )}
        </>
      )}
      {confirm && (
        <Modal
          title={`Start “${confirm.title}”?`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>Not yet</Button>
              <Button accent="orange" busy={busy} onClick={() => start(confirm)}>Start now</Button>
            </>
          }
        >
          <ul className="text-sm text-gray-600 font-body space-y-2 list-disc pl-5">
            <li>You have <strong>{confirm.durationMinutes} minutes</strong> once you start. The timer keeps running if you close the page.</li>
            <li>Your answers save automatically as you go. If you lose connection, sign in again and choose Resume.</li>
            <li>When time runs out, your answers are submitted automatically.</li>
            <li>You can only sit each assessment once.</li>
          </ul>
        </Modal>
      )}
    </div>
  );
}
