import { useState } from 'react';
import type { Page } from '../types';
import DataSourceBadge from '../components/DataSourceBadge';
import { selectStudent, useApiData } from '../lib/api';
import { downloadCsv, PageStatus } from '../components/ui';
import { ChartCard, EmptyChart, HeatCell, HeatLegend, LevelDistribution, LEVELS, levelOf, SkillBullets, TrendChart, type BulletRow } from '../components/charts';
import JoinCode from '../components/JoinCode';
import { isPreviewMode } from '../lib/api';

interface Props { setPage: (p: Page) => void; }

const students = [
  { id: '1', name: 'Jordan Smith', grade: 11, avg: 79, trend: 'up', assessments: 5, skills: { analytical: 78, research: 65, critical: 82, creativity: 71, decision: 59, collab: 88, adaptability: 74 } },
  { id: '2', name: 'Maya Patel', grade: 11, avg: 91, trend: 'up', assessments: 5, skills: { analytical: 94, research: 88, critical: 95, creativity: 86, decision: 92, collab: 91, adaptability: 90 } },
  { id: '3', name: 'Ethan Clarke', grade: 11, avg: 65, trend: 'down', assessments: 4, skills: { analytical: 62, research: 71, critical: 58, creativity: 73, decision: 60, collab: 69, adaptability: 67 } },
  { id: '4', name: 'Sofia Rodriguez', grade: 11, avg: 84, trend: 'up', assessments: 5, skills: { analytical: 88, research: 79, critical: 86, creativity: 82, decision: 81, collab: 87, adaptability: 89 } },
  { id: '5', name: 'Liam Nguyen', grade: 11, avg: 72, trend: 'up', assessments: 5, skills: { analytical: 70, research: 68, critical: 75, creativity: 77, decision: 65, collab: 79, adaptability: 71 } },
  { id: '6', name: 'Ava Thompson', grade: 11, avg: 58, trend: 'down', assessments: 3, skills: { analytical: 55, research: 60, critical: 53, creativity: 64, decision: 52, collab: 61, adaptability: 63 } },
  { id: '7', name: 'Noah Kim', grade: 11, avg: 88, trend: 'up', assessments: 5, skills: { analytical: 91, research: 84, critical: 90, creativity: 88, decision: 87, collab: 85, adaptability: 91 } },
  { id: '8', name: 'Isabella Brown', grade: 11, avg: 76, trend: 'flat', assessments: 5, skills: { analytical: 75, research: 72, critical: 78, creativity: 79, decision: 73, collab: 80, adaptability: 77 } },
];

const skillAverages = [
  { skill: 'Analytical', avg: 77 },
  { skill: 'Research', avg: 73 },
  { skill: 'Critical', avg: 77 },
  { skill: 'Creativity', avg: 78 },
  { skill: 'Decision', avg: 71 },
  { skill: 'Collab.', avg: 80 },
  { skill: 'Adaptability', avg: 78 },
];

const classProgress = [
  { week: 'Wk 1', avg: 64 },
  { week: 'Wk 2', avg: 68 },
  { week: 'Wk 3', avg: 71 },
  { week: 'Wk 4', avg: 69 },
  { week: 'Wk 5', avg: 75 },
  { week: 'Wk 6', avg: 76 },
];

// Demo data, shown when the API server isn't running. The live version comes
// from GET /api/classes/current/results in the same shape.
const mockClass = {
  header: { className: 'Class 11B', subtitle: 'Grade 11 · Ms. Chen · Term 3, 2024' },
  classes: [] as { id: string; name: string }[],
  classId: '',
  completed: { done: 38, expected: 40 },
  students,
  skillAverages,
  classProgress,
};

export default function TeacherClassResults({ setPage }: Props) {
  const [classId, setClassId] = useState(() => sessionStorage.getItem('dsw:class') ?? '');
  const results = useApiData(`/classes/current/results${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`, mockClass);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'avg' | 'assessments'>('avg');
  const [filterRange, setFilterRange] = useState('All');
  if (!results.ready) return <PageStatus error={results.error} onRetry={results.reload} />;
  const { header, students, skillAverages, classProgress, classes } = results.data;
  const joinCode = 'joinCode' in results.data ? (results.data as { joinCode: string | null }).joinCode : null;
  const joinEnabled = 'joinEnabled' in results.data ? Boolean((results.data as { joinEnabled: boolean }).joinEnabled) : false;
  const avgRows: BulletRow[] = skillAverages.map((s) => ({
    key: s.skill,
    name: 'name' in s ? String((s as { name: string }).name) : s.skill,
    score: (s.avg as number | null) ?? null,
  }));
  const rankedAvgs = avgRows.filter((r) => r.score !== null).sort((a, b) => (b.score as number) - (a.score as number));
  const skillHeadline = rankedAvgs.length >= 2
    ? `Class is strongest in ${rankedAvgs[0].name} (${rankedAvgs[0].score}%) and weakest in ${rankedAvgs[rankedAvgs.length - 1].name} (${rankedAvgs[rankedAvgs.length - 1].score}%)`
    : rankedAvgs.length === 1 ? `${rankedAvgs[0].name}: class average ${rankedAvgs[0].score}%` : 'Skill averages';
  // Students who haven't had a result released yet don't count towards averages.
  const assessed = students.filter((s) => s.assessments > 0);
  const classAvg = assessed.length ? Math.round(assessed.reduce((a, s) => a + s.avg, 0) / assessed.length) : 0;
  const chooseClass = (id: string) => {
    try { sessionStorage.setItem('dsw:class', id); } catch { /* ignore */ }
    setClassId(id);
  };
  const exportCsv = () =>
    downloadCsv(`${header.className.replace(/[^\w-]+/g, '_')}-results.csv`, [
      ['Name', 'Wallet ID', 'Average %', 'Assessments', ...skillAverages.map((s) => s.skill)],
      ...students.map((s) => [s.name, s.id, s.avg, s.assessments, ...Object.values(s.skills)]),
    ]);

  const filtered = students
    .filter(s => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
      const matchRange = filterRange === 'All' ||
        (filterRange === 'No results' && s.assessments === 0) ||
        (s.assessments > 0 && levelOf(s.avg) === filterRange);
      return matchSearch && matchRange;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'avg') return b.avg - a.avg;
      return b.assessments - a.assessments;
    });


  return (
    <div className="min-h-screen bg-[#F8F9FC] p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span className="text-xs font-mono font-600 text-emerald-600 uppercase tracking-widest">Class results</span>
            <DataSourceBadge source={results.source} reason={results.offlineReason} />
          </div>
          <h1 className="font-display font-700 text-2xl text-gray-900">{header.className}</h1>
          <p className="text-sm text-gray-500 font-body mt-0.5">{header.subtitle} · {students.length} student{students.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {classes.length > 1 && (
            <select
              aria-label="Class"
              value={results.data.classId}
              onChange={(e) => chooseClass(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-[#E8EAF0] bg-white text-sm font-body text-gray-700"
            >
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E8EAF0] bg-white text-sm font-medium font-body text-gray-600 hover:border-emerald-200 hover:text-emerald-700 transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Export CSV
          </button>
          <button onClick={() => setPage('access-logging')} className="px-4 py-2.5 rounded-xl border border-[#E8EAF0] bg-white text-sm font-medium font-body text-gray-600 hover:border-emerald-200 hover:text-emerald-700 transition-all">
            Access log
          </button>
        </div>
      </div>

      {!isPreviewMode() && results.data.classId && (
        <div className="mb-6">
          <JoinCode key={results.data.classId} classId={results.data.classId} code={joinCode} enabled={joinEnabled} />
        </div>
      )}

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Class average', value: assessed.length ? `${classAvg}%` : '—', sub: assessed.length ? levelOf(classAvg) : 'No results yet' },
          { label: 'Students with results', value: `${assessed.length} / ${students.length}`, sub: students.length - assessed.length ? `${students.length - assessed.length} still to sit or be released` : 'Everyone has a result' },
          { label: 'Proficient or above (75+)', value: String(assessed.filter((s) => s.avg >= 75).length), sub: 'students' },
          { label: 'Beginning (below 50)', value: String(assessed.filter((s) => s.avg < 50).length), sub: 'may need support' },
        ].map((m) => (
          <div key={m.label} className="bg-white rounded-xl border border-[#E8EAF0] p-4 shadow-sm">
            <div className="text-xs text-gray-500 font-body">{m.label}</div>
            <div className="font-display font-700 text-2xl text-gray-900 mt-1">{m.value}</div>
            <div className="text-xs text-gray-400 font-body mt-0.5">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-5 mb-5">
        <ChartCard
          className="col-span-2"
          title={skillHeadline}
          subtitle="Average of each student’s score in each skill (students not yet assessed in a skill are left out)."
        >
          {assessed.length === 0 ? <EmptyChart>Skill averages appear when the first results are released.</EmptyChart> : <SkillBullets rows={avgRows} color="#059669" />}
        </ChartCard>

        <div className="flex flex-col gap-5">
          <ChartCard title="Where students are" subtitle="Overall average, by level">
            <LevelDistribution values={students.map((s) => (s.assessments > 0 ? s.avg : null))} />
          </ChartCard>
          <ChartCard title="Class average over time" subtitle="By week of release">
            <TrendChart points={classProgress.map((p) => ({ label: p.week, value: p.avg }))} height={150} emptyText="A trend appears after results are released in two different weeks." />
          </ChartCard>
        </div>
      </div>

      {/* Student table */}
      <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F0F2F7]">
          <div className="relative">
            <svg width="14" height="14" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students..."
              className="pl-8 pr-4 py-2 rounded-lg border border-[#E8EAF0] text-sm font-body focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-50 w-48"
            />
          </div>
          <div className="flex gap-1.5">
            {['All', ...[...LEVELS].reverse().map((l) => l.label), 'No results'].map((r) => (
              <button
                key={r}
                onClick={() => setFilterRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium font-body transition-all ${
                  filterRange === r ? 'bg-emerald-600 text-white' : 'bg-gray-50 border border-[#E8EAF0] text-gray-600 hover:border-emerald-200'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400 font-body">
            Sort by:
            {(['name', 'avg', 'assessments'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-2 py-1 rounded ${sortBy === s ? 'text-emerald-700 font-semibold' : 'hover:text-gray-700'}`}
              >
                {s === 'avg' ? 'Score' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-3">
          <p className="text-xs text-gray-500 font-body">Each cell is the student’s score in that skill, shaded by level.</p>
          <HeatLegend />
        </div>
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs font-mono text-gray-400 uppercase tracking-wider">
              <th className="text-left px-5 py-3 font-600">Student</th>
              <th className="text-center px-3 py-3 font-600">Analytical</th>
              <th className="text-center px-3 py-3 font-600">Research</th>
              <th className="text-center px-3 py-3 font-600">Critical</th>
              <th className="text-center px-3 py-3 font-600">Creativity</th>
              <th className="text-center px-3 py-3 font-600">Decision</th>
              <th className="text-center px-3 py-3 font-600">Collab.</th>
              <th className="text-center px-3 py-3 font-600">Adaptability</th>
              <th className="text-center px-3 py-3 font-600">Overall</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F8F9FC]">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-xs font-bold text-white">
                      {s.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <div className="text-sm font-body font-600 text-gray-900">{s.name}</div>
                      <div className="text-xs text-gray-400 font-body">{s.assessments} assessment{s.assessments === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                </td>
                {Object.entries(s.skills as Record<string, number | null>).map(([skill, score], i) => (
                  <td key={skill} className="px-2 py-3 text-center">
                    <HeatCell value={score} label={`${s.name}, ${skillAverages[i]?.skill ?? skill}`} />
                  </td>
                ))}
                <td className="px-3 py-3 text-center border-l border-[#F0F2F7]">
                  {s.assessments === 0 ? <span className="text-xs text-gray-400 font-body">No results</span> : <HeatCell value={s.avg} label={`${s.name}, overall`} />}
                </td>
                <td className="px-5 py-3.5">
                  <button
                    onClick={() => { selectStudent(s.id); setPage('teacher-individual'); }}
                    className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold font-body whitespace-nowrap"
                  >
                    Drill-down →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {filtered.length === 0 && <div className="px-5 py-8 text-center text-sm text-gray-400 font-body">No students match.</div>}
      </div>
    </div>
  );
}
