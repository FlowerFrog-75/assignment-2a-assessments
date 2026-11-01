import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';
import type { Page } from '../types';
import DataSourceBadge from '../components/DataSourceBadge';
import { selectResult, selectedResult, useApiData } from '../lib/api';
import { PageStatus } from '../components/ui';

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

const levelColor: Record<string, string> = {
  Advanced: 'bg-purple-100 text-purple-700',
  Proficient: 'bg-emerald-100 text-emerald-700',
  Developing: 'bg-orange-100 text-orange-700',
  Beginning: 'bg-red-100 text-red-700',
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
  const strengths = skillResults.filter(s => s.score >= 80);
  const gaps = skillResults.filter(s => s.score < 75);

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
              className="px-3 py-2.5 rounded-xl border border-[#E8EAF0] bg-white text-sm font-body text-gray-700 max-w-[260px]"
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

      {feedback && (
        <div className="bg-orange-50 border border-orange-100 rounded-2xl px-6 py-4 mb-6">
          <div className="text-xs font-mono font-600 text-orange-600 uppercase tracking-widest mb-1">Teacher feedback</div>
          <p className="text-sm text-orange-900 font-body whitespace-pre-wrap">{feedback}</p>
        </div>
      )}

      {/* Score hero */}
      <div className="bg-white rounded-2xl border border-[#E8EAF0] shadow-sm p-6 mb-6">
        <div className="flex items-center gap-10">
          {/* Score circle */}
          <div className="relative w-28 h-28 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#F0F2F7" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke={totalScore >= 80 ? '#10B981' : totalScore >= 70 ? '#F97316' : '#EF4444'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(totalScore / 100) * 264} 264`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display font-800 text-2xl text-gray-900">{totalScore}%</span>
              <span className="text-[9px] text-gray-400 font-body uppercase tracking-wider">Score</span>
            </div>
          </div>

          {/* Score details */}
          <div className="flex-1 grid grid-cols-4 gap-6">
            {[
              { label: 'Your Score', value: `${totalScore}%`, color: 'text-gray-900', sub: 'Out of 100%' },
              { label: 'Class Average', value: `${classAvg}%`, color: 'text-gray-600', sub: vsClass >= 0 ? `You're +${vsClass}% above` : `You're ${-vsClass}% below` },
              { label: 'Grade', value: grade, color: 'text-orange-600', sub: 'Well done!' },
              { label: 'Time Taken', value: timeTaken, color: 'text-gray-700', sub: timeRemaining },
            ].map((m) => (
              <div key={m.label}>
                <div className="text-xs text-gray-400 font-body mb-1">{m.label}</div>
                <div className={`font-display font-700 text-2xl ${m.color}`}>{m.value}</div>
                <div className="text-xs text-gray-400 font-body mt-0.5">{m.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Skill breakdown */}
        <div className="col-span-2 bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-5">
          <h2 className="font-display font-600 text-gray-900 mb-1">Skill Breakdown</h2>
          <p className="text-xs text-gray-400 font-body mb-4">Performance across 7 core competencies</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={skillResults} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F2F7" />
              <XAxis dataKey="skill" tick={{ fontSize: 11, fill: '#9CA3AF', fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9CA3AF', fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => [`${v}%`, 'Score']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E8EAF0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
              />
              <Bar dataKey="score" fill="#F97316" radius={[4, 4, 0, 0]}
                label={{ position: 'top', fontSize: 11, fill: '#9CA3AF', fontFamily: 'Inter', formatter: (v: unknown) => `${v}%` }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Radar */}
        <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-5">
          <h2 className="font-display font-600 text-gray-900 mb-1">Skills Radar</h2>
          <p className="text-xs text-gray-400 font-body mb-4">Competency profile</p>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={skillResults}>
              <PolarGrid stroke="#F0F2F7" />
              <PolarAngleAxis dataKey="skill" tick={{ fontSize: 9, fill: '#9CA3AF', fontFamily: 'Inter' }} />
              <Radar dataKey="score" stroke="#F97316" fill="#F97316" fillOpacity={0.15} strokeWidth={2} dot={{ fill: '#F97316', r: 3 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Question breakdown */}
        <div className="col-span-2 bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-5">
          <h2 className="font-display font-600 text-gray-900 mb-4">Question Performance</h2>
          <div className="flex flex-col gap-2">
            {questionBreakdown.map((q) => (
              <div key={q.q} className="flex items-center gap-3">
                <span className="w-6 text-xs font-mono text-gray-400">{q.q}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${q.score / q.max >= 0.8 ? 'bg-emerald-500' : q.score / q.max >= 0.6 ? 'bg-orange-500' : 'bg-red-400'}`}
                    style={{ width: `${(q.score / q.max) * 100}%` }}
                  ></div>
                </div>
                <span className="text-xs font-mono text-gray-600 w-10 text-right">{q.score}/{q.max}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Strengths & Gaps */}
        <div className="flex flex-col gap-4">
          {/* Strengths */}
          <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-5">
            <h2 className="font-display font-600 text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-emerald-500">💪</span> Strengths
            </h2>
            <div className="flex flex-col gap-2">
              {strengths.map((s) => (
                <div key={s.skill} className="flex items-center justify-between">
                  <span className="text-sm font-body text-gray-700">{s.skill}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-body ${levelColor[s.level]}`}>{s.level}</span>
                    <span className="text-sm font-display font-700 text-gray-900 w-10 text-right">{s.score}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Gaps */}
          <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-5">
            <h2 className="font-display font-600 text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-orange-500">🎯</span> Focus Areas
            </h2>
            <div className="flex flex-col gap-2">
              {gaps.map((s) => (
                <div key={s.skill} className="flex items-center justify-between">
                  <span className="text-sm font-body text-gray-700">{s.skill}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-body ${levelColor[s.level]}`}>{s.level}</span>
                    <span className="text-sm font-display font-700 text-gray-900 w-10 text-right">{s.score}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setPage('digital-wallet')}
            className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl p-4 text-sm font-semibold font-body flex items-center gap-3 hover:shadow-md transition-all active:scale-95"
          >
            <span className="text-2xl">💎</span>
            <div className="text-left">
              <div className="font-display font-700">+{coinsEarned} Skill Coins</div>
              <div className="text-orange-100 text-xs font-body">Earned from this assessment</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
