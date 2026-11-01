import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page } from '../types';
import { apiSend, ApiRequestError, isPreviewMode, selectedAttempt, useApiData } from '../lib/api';
import { PageStatus } from '../components/ui';

interface Props { setPage: (p: Page) => void; }

interface Question {
  number: number;
  itemId: string;
  skill: string;
  type: 'multiple_choice' | 'short_response';
  prompt: string;
  options: { key: string; text: string }[];
  points: number;
  answer: string;
  flagged: boolean;
}

interface Attempt {
  attemptId: string;
  title: string;
  subject: string;
  status: 'in_progress' | 'submitted' | 'marked' | 'released';
  endsAt: string | null;
  serverTime: string;
  questions: Question[];
}

// Sample paper for the design preview only.
const sampleQuestions = [
  {
    id: 1,
    question: 'A scientist observes that plants in a controlled environment grow taller when exposed to blue light compared to red light. Which of the following best describes an analytical approach to investigating this finding?',
    skill: 'Analytical Thinking',
    options: [
      'Accept the finding and apply it to all plant species immediately',
      'Design a controlled experiment varying light wavelengths while holding other variables constant',
      'Conclude that blue light is universally superior for all photosynthetic organisms',
      'Record the observation in a journal without further investigation',
    ],
    correct: 1,
    explanation: 'Analytical thinking requires systematic investigation through controlled experimentation.',
  },
  {
    id: 2,
    question: 'When evaluating sources for a research paper on climate change, which combination of criteria is MOST important for ensuring information reliability?',
    skill: 'Research',
    options: [
      'The source has many views and shares on social media',
      'The source is recent, peer-reviewed, and authored by domain experts with cited methodology',
      'The source agrees with your existing hypothesis',
      'The source is published by a well-known media outlet',
    ],
    correct: 1,
    explanation: 'Quality research requires evaluating recency, peer review, expertise, and methodology.',
  },
  {
    id: 3,
    question: 'A government proposes building a highway through a protected forest to reduce commute times. A critical thinker would FIRST:',
    skill: 'Critical Thinking',
    options: [
      'Support the proposal because reducing commutes benefits workers',
      'Oppose the proposal because environmental protection is always the priority',
      'Identify and evaluate the assumptions, evidence, and competing stakeholder interests',
      'Wait to see what the majority of citizens decide before forming an opinion',
    ],
    correct: 2,
    explanation: 'Critical thinking involves examining assumptions and multiple perspectives before forming judgments.',
  },
  {
    id: 4,
    question: 'A design team is tasked with creating a product for elderly users with limited mobility. Which approach best demonstrates creative problem-solving?',
    skill: 'Creativity',
    options: [
      'Copy an existing product and reduce the price',
      'Focus group only with designers and engineers',
      'Conduct ethnographic research with elderly users, then prototype unconventional interaction models',
      'Build the most technologically advanced version possible',
    ],
    correct: 2,
    explanation: 'Creative problem-solving combines empathy research with novel ideation.',
  },
  {
    id: 5,
    question: 'You have 24 hours to submit a project but discover a critical error in your data. You have three options: (A) Submit as-is and hope no one notices, (B) Request an extension explaining the situation, (C) Work through the night to fix and verify the data. Which approach demonstrates the best decision-making process?',
    skill: 'Decision-Making',
    options: [
      'Option A — meeting deadlines is always the top priority',
      'Option B — transparency and risk communication is the responsible choice',
      'Option C — effort and dedication always produce the best outcomes',
      'Evaluate the severity of the error, the likelihood of detection, the cost of each option, then choose B or C based on that analysis',
    ],
    correct: 3,
    explanation: 'Good decisions require evaluating the full context, consequences, and trade-offs systematically.',
  },
];

const samplePaper: Attempt = {
  attemptId: 'preview',
  title: 'Critical Thinking in Data Interpretation',
  subject: 'Science',
  status: 'in_progress',
  endsAt: new Date(Date.now() + 45 * 60_000).toISOString(),
  serverTime: new Date().toISOString(),
  questions: sampleQuestions.map((q, i) => ({
    number: i + 1,
    itemId: String(q.id),
    skill: q.skill,
    type: 'multiple_choice',
    prompt: q.question,
    options: q.options.map((text, j) => ({ key: String.fromCharCode(65 + j), text })),
    points: 1,
    answer: '',
    flagged: false,
  })),
};

export default function AssessmentInterface({ setPage }: Props) {
  const attemptId = selectedAttempt();
  const paper = useApiData<Attempt>(attemptId ? `/me/attempts/${attemptId}` : null, samplePaper);
  const preview = isPreviewMode();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clockOffset = useRef(0);
  const pending = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const submittedRef = useRef(false);

  // Load saved answers and work out the time left from the server's clock.
  useEffect(() => {
    if (!paper.ready) return;
    const d = paper.data;
    setAnswers(Object.fromEntries(d.questions.map((q) => [q.itemId, q.answer])));
    setFlagged(new Set(d.questions.filter((q) => q.flagged).map((q) => q.itemId)));
    clockOffset.current = new Date(d.serverTime).getTime() - Date.now();
    if (d.status !== 'in_progress') setSubmitted(true);
  }, [paper.ready, paper.data]);

  const save = useCallback(
    async (itemId: string, patch: { answer?: string; flagged?: boolean }) => {
      if (preview || !attemptId) return;
      setSaveState('saving');
      try {
        await apiSend('PUT', `/me/attempts/${attemptId}/responses`, { itemId, ...patch });
        setSaveState('saved');
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === 'attempt_closed') {
          submittedRef.current = true;
          setSubmitted(true);
          return;
        }
        setSaveState('error');
      }
    },
    [attemptId, preview],
  );

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    // Flush answers still waiting to save.
    for (const [itemId, timer] of Object.entries(pending.current)) {
      clearTimeout(timer);
      delete pending.current[itemId];
    }
    try {
      if (!preview && attemptId) {
        await Promise.all(Object.entries(answers).map(([itemId, answer]) => (answer ? save(itemId, { answer }) : null)));
        await apiSend('POST', `/me/attempts/${attemptId}/submit`);
      }
      setSubmitted(true);
    } catch (err) {
      submittedRef.current = false;
      setError(err instanceof ApiRequestError ? err.message : 'Could not submit. Check your connection and try again.');
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  }, [answers, attemptId, preview, save]);

  // Countdown. When it reaches zero the answers are submitted.
  useEffect(() => {
    if (!paper.ready || submitted || !paper.data.endsAt) return;
    const endsAt = new Date(paper.data.endsAt).getTime();
    const tick = () => {
      const left = Math.max(0, Math.round((endsAt - (Date.now() + clockOffset.current)) / 1000));
      setTimeLeft(left);
      if (left === 0) submit();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [paper.ready, paper.data, submitted, submit]);

  // Warn before closing the tab while answers are still saving.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === 'saving' || Object.keys(pending.current).length) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  if (!attemptId && !preview) {
    return <PageStatus error={{ status: 404, code: 'no_attempt', message: 'Choose an assessment to start from My Assessments.' }}><button onClick={() => setPage('student-assessments')} className="text-sm text-orange-600 font-semibold">Go to My Assessments →</button></PageStatus>;
  }
  if (!paper.ready) return <PageStatus error={paper.error} onRetry={paper.reload} />;

  const questions = paper.data.questions;
  const q = questions[current];
  const answered = questions.filter((x) => answers[x.itemId]?.trim()).length;
  const left = timeLeft ?? 0;
  const mins = Math.floor(left / 60);
  const secs = left % 60;
  const isLow = left < 300;
  const progress = ((current + 1) / questions.length) * 100;

  const choose = (value: string, debounce = false) => {
    setAnswers((prev) => ({ ...prev, [q.itemId]: value }));
    const itemId = q.itemId;
    clearTimeout(pending.current[itemId]);
    if (debounce) {
      setSaveState('saving');
      pending.current[itemId] = setTimeout(() => {
        delete pending.current[itemId];
        save(itemId, { answer: value });
      }, 800);
    } else save(itemId, { answer: value });
  };

  const toggleFlag = () => {
    const next = new Set(flagged);
    if (next.has(q.itemId)) next.delete(q.itemId);
    else next.add(q.itemId);
    setFlagged(next);
    save(q.itemId, { flagged: next.has(q.itemId) });
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="font-display font-700 text-2xl text-gray-900 mb-2">Assessment submitted</h2>
          <p className="text-gray-500 font-body mb-6">
            Your answers are saved. Your teacher will check them and release your results. You&apos;ll earn skill coins for your wallet when they do.
          </p>
          <button onClick={() => setPage('student-assessments')} className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold font-body">
            Back to my assessments
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex flex-col">
      {/* Assessment top bar */}
      <div className="bg-white border-b border-[#E8EAF0] px-6 py-3 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-500"></div>
          <span className="text-xs font-mono font-600 text-purple-600 uppercase tracking-widest">Live Assessment</span>
        </div>
        <div className="font-body font-600 text-gray-700 text-sm flex-1 truncate">
          {paper.data.title}
        </div>
        <span className={`text-xs font-body ${saveState === 'error' ? 'text-red-600' : 'text-gray-400'}`}>
          {preview ? 'Preview' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved: check your connection' : 'All answers saved'}
        </span>

        {/* Progress */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 font-body">{answered}/{questions.length} answered</span>
          <div className="w-32 bg-gray-100 rounded-full h-1.5">
            <div className="bg-purple-600 h-1.5 rounded-full transition-all" style={{ width: `${(answered / questions.length) * 100}%` }}></div>
          </div>
        </div>

        {/* Timer */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono font-600 text-sm ${isLow ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-700'}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="h-1 bg-gray-100">
        <div className="h-1 bg-purple-600 transition-all duration-300" style={{ width: `${progress}%` }}></div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Question nav sidebar */}
        <div className="w-64 bg-white border-r border-[#E8EAF0] p-4 overflow-y-auto">
          <div className="text-xs font-mono font-600 text-gray-400 uppercase tracking-widest mb-3">Questions</div>
          <div className="grid grid-cols-5 gap-1.5 mb-4">
            {questions.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-8 h-8 rounded-lg text-xs font-display font-600 transition-all relative ${
                  i === current
                    ? 'bg-purple-600 text-white'
                    : answers[questions[i].itemId]?.trim()
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {i + 1}
                {flagged.has(questions[i].itemId) && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-yellow-400 rounded-full"></span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5 text-xs font-body text-gray-500 mt-4">
            {[
              { color: 'bg-purple-600', label: 'Current' },
              { color: 'bg-purple-100 border border-purple-200', label: 'Answered' },
              { color: 'bg-gray-100', label: 'Unanswered' },
              { color: 'bg-yellow-400', label: 'Flagged', dot: true },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded ${l.color}`}></div>
                {l.label}
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-[#F0F2F7]">
            <div className="text-xs font-body text-gray-400 mb-1">Skill being assessed</div>
            <span className="text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-700 font-body font-medium">
              {q.skill}
            </span>
          </div>
        </div>

        {/* Main question area */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto">
            {/* Question header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 bg-purple-600 text-white rounded-lg flex items-center justify-center font-display font-700 text-sm">
                  {current + 1}
                </span>
                <span className="text-sm text-gray-400 font-body">of {questions.length} questions</span>
              </div>
              <button
                onClick={toggleFlag}
                className={`flex items-center gap-1.5 text-xs font-body px-3 py-1.5 rounded-lg border transition-all ${
                  flagged.has(q.itemId) ? 'bg-yellow-50 border-yellow-300 text-yellow-700' : 'bg-white border-[#E8EAF0] text-gray-500 hover:border-yellow-300'
                }`}
              >
                🚩 {flagged.has(q.itemId) ? 'Flagged' : 'Flag for review'}
              </button>
            </div>

            {/* Question card */}
            <div className="bg-white rounded-2xl border border-[#E8EAF0] shadow-sm p-7 mb-6">
              <div className="text-xs font-mono text-purple-500 mb-3 uppercase tracking-widest">{q.skill}</div>
              <p className="font-body text-gray-800 text-base leading-relaxed whitespace-pre-wrap">{q.prompt}</p>
              <div className="text-xs text-gray-400 font-body mt-3">{q.points} mark{q.points === 1 ? '' : 's'}</div>
            </div>

            {/* Answer */}
            {q.type === 'multiple_choice' ? (
              <div className="flex flex-col gap-3 mb-8" role="radiogroup">
                {q.options.map((opt) => {
                  const chosen = answers[q.itemId] === opt.key;
                  return (
                    <button
                      key={opt.key}
                      role="radio"
                      aria-checked={chosen}
                      onClick={() => choose(opt.key)}
                      className={`flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
                        chosen ? 'bg-purple-50 border-purple-400 shadow-sm' : 'bg-white border-[#E8EAF0] hover:border-purple-200 hover:bg-purple-50/30'
                      }`}
                    >
                      <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-display font-700 mt-0.5 ${
                        chosen ? 'border-purple-500 bg-purple-500 text-white' : 'border-gray-300 text-gray-400'
                      }`}>
                        {opt.key}
                      </div>
                      <span className={`font-body text-sm leading-relaxed ${chosen ? 'text-purple-900 font-medium' : 'text-gray-700'}`}>{opt.text}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mb-8">
                <textarea
                  value={answers[q.itemId] ?? ''}
                  onChange={(e) => choose(e.target.value, true)}
                  rows={8}
                  maxLength={10000}
                  aria-label="Your answer"
                  placeholder="Write your answer here…"
                  className="w-full p-4 rounded-xl border border-[#E8EAF0] bg-white text-sm font-body text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400"
                />
              </div>
            )}

            {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700 font-body">{error}</div>}

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrent(c => Math.max(0, c - 1))}
                disabled={current === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E8EAF0] text-sm font-medium font-body text-gray-600 hover:border-purple-200 hover:text-purple-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                Previous
              </button>

              <div className="flex items-center gap-2">
                {current < questions.length - 1 ? (
                  <button
                    onClick={() => setCurrent(c => Math.min(questions.length - 1, c + 1))}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold font-body transition-all"
                  >
                    Next Question
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirming(true)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold font-body transition-all shadow-sm shadow-emerald-200"
                  >
                    ✅ Submit Assessment
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="font-display font-bold text-lg text-gray-900 mb-2">Submit your assessment?</h2>
            <p className="text-sm text-gray-600 font-body mb-2">You&apos;ve answered {answered} of {questions.length} questions{flagged.size ? `, and flagged ${flagged.size} to review` : ''}.</p>
            <p className="text-sm text-gray-600 font-body mb-5">You can&apos;t change your answers after submitting.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirming(false)} className="px-4 py-2 rounded-xl border border-[#E8EAF0] text-sm font-semibold font-body text-gray-700 hover:bg-gray-50">Keep working</button>
              <button onClick={submit} disabled={submitting} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold font-body disabled:opacity-60">
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
