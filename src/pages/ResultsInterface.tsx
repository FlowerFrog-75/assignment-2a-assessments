import { useState } from 'react';
import type { Page } from '../types';
import DataSourceBadge from '../components/DataSourceBadge';
import { selectResult, selectedResult, useApiData } from '../lib/api';
import { PageStatus } from '../components/ui';
import { ChartCard, CompareLegend, comparisonFinding, levelOf, SkillBullets, skillFinding, type BulletRow } from '../components/charts';

interface Props { setPage: (p: Page) => void; }

const skillResults = [
  { skill: 'Analytical', score: 85, max: 100, level: 'Proficient' },
  { skill: 'Research', score: 72, max: 100, level: 'Developing' },
  { skill: 'Critical', score: 91, max: 100, level: 'Advanced' },
  { skill: 'Creativity', score: 68, max: 100, level: 'Developing' },
  { skill: 'Decision', score: 78, max: 100, level: 'Proficient' },
  { skill: 'Collab.', score: 88, max: 100, level: 'Proficient' },
  { skill: 'Adaptability', score: 74, max: 100, level: 'Developing' },
];

const questionBreakdown = [
  { q: 'Q1', score: 10, max: 10 },
  { q: 'Q2', score: 8, max: 10 },
  { q: 'Q3', score: 10, max: 10 },
  { q: 'Q4', score: 6, max: 10 },
  { q: 'Q5', score: 9, max: 10 },
  { q: 'Q6', score: 7, max: 10 },
  { q: 'Q7', score: 10, max: 10 },
  { q: 'Q8', score: 5, max: 10 },
];

// Demo data, shown when the API server isn't running. The live version comes
// from GET /api/students/:walletId/results/latest in the same shape.
const mockResult = {
  title: 'Critical Thinking in Data Interpretation',
  subtitle: 'Completed October 16, 2024 · Science · Grade 11',
  totalScore: 79,
  classAvg: 68,
  grade: 'B+',
  timeTaken: '38 min',
  timeRemaining: '7 min remaining',
  coinsEarned: 128,
  skillResults,
  questionBreakdown,
  attempts: [] as { id: string; title: string; date: string }[],
  attemptId: '',
  feedback: 'Strong analysis of the data. Next time, explain why the sample size matters.',
};


export default function ResultsInterface({ setPage }: Props) {
  const [chosen, setChosen] = useState(selectedResult());
  const result = useApiData(`/me/results/latest${chosen ? `?attempt=${encodeURIComponent(chosen)}` : ''}`, mockResult);
  if (!result.ready) {
    return (
      <PageStatus error={result.error} onRetry={result.reload}>
        {result.error?.code === 'no_results' && (
          <button onClick={() => setPage('student-assessments')} className="text-sm text-orange-600 font-semibold mb-2">Go to my assessments →</button>
        )}
      </PageStatus>
    );
  }
  const { attempts, attemptId, feedback, title, subtitle, totalScore, classAvg, grade, timeTaken, timeRemaining, coinsEarned, skillResults, questionBreakdown } = result.data;
  const vsClass = totalScore - classAvg;
  const hasClass = ('classCount' in result.data ? (result.data as { classCount: number }).classCount : 2) > 1;
  type SkillResult = (typeof skillResults)[number] & { name?: string; classAvg?: number | null; points?: string };
  const named = (skillResults as SkillResult[]).map((s) => ({ ...s, name: s.name ?? s.skill }));
  const bulletRows: BulletRow[] = named.map((s) => ({ key: s.skill, name: s.name, score: s.score, compare: hasClass ? s.classAvg ?? null : undefined, detail: s.points ? `${s.points} marks` : undefined }));
  const strengths = named.filter((s) => s.score >= 75).sort((a, b) => b.score - a.score);
  const gaps = named.filter((s) => s.score < 50).sort((a, b) => a.score - b.score);
  const earned = questionBreakdown.reduce((t, q) => t + q.score, 0);
  const possible = questionBreakdown.reduce((t, q) => t + q.max, 0);
  const fullMarks = questionBreakdown.filter((q) => q.score >= q.max).length;

  return (
    <div className="min-h-screen bg-[#F8F9FC] p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <span className="text-xs font-mono font-600 text-orange-600 uppercase tracking-widest">Assessment Results</span>
            <DataSourceBadge source={result.source} reason={result.offlineReason} />
          </div>
          <h1 className="font-display font-700 text-2xl text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500 font-body mt-0.5">{subtitle}</p>
        </div>
        <div className="flex gap-3">
          {attempts.length > 1 && (
            <select
              aria-label="Choose a result"
              value={attemptId}
              onChange={(e) => { selectResult(e.target.value); setChosen(e.target.value); }}
              className="px-3 py-2.5 rounded-xl border border-[#E8EAF0] bg-white text-sm font-body text-gray-700 max-w-[340px]"
            >
              {attempts.map((a) => <option key={a.id} value={a.id}>{a.title} · {a.date}</option>)}
            </select>
          )}
          <button onClick={() => window.print()} className="px-4 py-2.5 rounded-xl border border-[#E8EAF0] bg-white text-sm font-medium font-body text-gray-600 hover:border-gray-300 transition-all flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Print / save PDF
          </button>
          <button
            onClick={() => setPage('digital-wallet')}
            className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold font-body transition-all flex items-center gap-2"
          >
            💎 View wallet
          </button>
        </div>
      </div>


      {/* Headline numbers */}
      <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-6 mb-5">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
          <div className="relative w-28 h-28 flex-shrink-0" role="img" aria-label={`Score ${totalScore}%, ${levelOf(totalScore)}`}>
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#F0F2F7" strokeWidth="8" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="#7c3aed" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(totalScore / 100) * 264} 264`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display font-700 text-2xl text-gray-900">{totalScore}%</span>
              <span className="text-[10px] text-gray-500 font-body">{levelOf(totalScore)}</span>
            </div>
          </div>
          <dl className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: 'Grade', value: grade, sub: grade === 'A' ? 'Outstanding' : grade === 'B' ? 'Well done' : grade === 'C' ? 'Sound' : 'Keep working at it' },
              hasClass
                ? { label: 'Class average', value: `${classAvg}%`, sub: vsClass > 0 ? `You’re ${vsClass} points above` : vsClass < 0 ? `You’re ${-vsClass} points below` : 'Same as the class' }
                : { label: 'Class average', value: '—', sub: 'Shown once more of your class have results' },
              { label: 'Skill coins earned', value: `+${coinsEarned}`, sub: '10 coins per mark' },
              { label: 'Time taken', value: timeTaken, sub: timeRemaining },
            ].map((m) => (
              <div key={m.label}>
                <dt className="text-xs text-gray-500 font-body mb-1">{m.label}</dt>
                <dd className="font-display font-700 text-2xl text-gray-900">{m.value}</dd>
                <dd className="text-xs text-gray-500 font-body mt-0.5">{m.sub}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <ChartCard
          className="col-span-2"
          title={(hasClass && comparisonFinding(bulletRows)) || skillFinding(bulletRows)}
          subtitle={hasClass ? 'Each skill in this assessment, compared with your class on the same assessment.' : 'Each skill in this assessment. Bands show the level.'}
          legend={hasClass ? <CompareLegend you="You" /> : undefined}
        >
          <SkillBullets rows={bulletRows} compareLabel="Class average" />
        </ChartCard>

        <div className="flex flex-col gap-5">
          <ChartCard title="What this means">
            <div className="space-y-4 text-sm font-body">
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1.5">Strengths</div>
                {strengths.length ? (
                  <ul className="space-y-1">{strengths.map((s) => <li key={s.skill} className="flex justify-between gap-2"><span className="text-gray-800">{s.name}</span><span className="text-gray-500 tabular-nums">{s.score}% · {levelOf(s.score)}</span></li>)}</ul>
                ) : (
                  <p className="text-gray-400">None at Proficient (75%+) yet.</p>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1.5">Focus next on</div>
                {gaps.length ? (
                  <ul className="space-y-1">{gaps.map((s) => <li key={s.skill} className="flex justify-between gap-2"><span className="text-gray-800">{s.name}</span><span className="text-gray-500 tabular-nums">{s.score}% · {levelOf(s.score)}</span></li>)}</ul>
                ) : (
                  <p className="text-gray-400">Nothing below Developing. Nice work.</p>
                )}
              </div>
            </div>
          </ChartCard>
          <button
            onClick={() => setPage('digital-wallet')}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-4 text-sm font-semibold font-body flex items-center gap-3 transition-colors"
          >
            <span className="text-2xl" aria-hidden="true">💎</span>
            <span className="text-left">
              <span className="block font-display font-700">+{coinsEarned} skill coins</span>
              <span className="block text-orange-100 text-xs font-body">Added to your wallet · view it</span>
            </span>
          </button>
        </div>

        <ChartCard
          className="col-span-2"
          title={`${earned} of ${possible} marks · ${fullMarks} of ${questionBreakdown.length} questions fully correct`}
          subtitle="Each question, in the order you answered them."
        >
          <ul className="flex flex-col gap-1.5 font-body">
            {questionBreakdown.map((q) => {
              const full = q.score >= q.max;
              const none = q.score === 0;
              return (
                <li key={q.q} className="grid items-center gap-3" style={{ gridTemplateColumns: '2.25rem minmax(7rem, 10rem) 1fr 4.5rem' }}>
                  <span className="text-xs font-semibold text-gray-500 tabular-nums">{q.q}</span>
                  <span className="text-xs text-gray-600 truncate">{'skill' in q ? (q as { skill: string }).skill : ''}</span>
                  <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
                    <div className="h-full rounded-r bg-[#7c3aed]" style={{ width: `${(q.score / q.max) * 100}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-right text-gray-700 whitespace-nowrap">
                    {q.score}/{q.max} <span aria-label={full ? 'correct' : none ? 'incorrect' : 'partly correct'}>{full ? '✓' : none ? '✗' : '◐'}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </ChartCard>

        {feedback ? (
          <ChartCard title="Teacher feedback">
            <p className="text-sm text-gray-700 font-body whitespace-pre-wrap leading-relaxed">{feedback}</p>
          </ChartCard>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
