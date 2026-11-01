import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import type { Page } from '../types';
import DataSourceBadge from '../components/DataSourceBadge';
import { selectStudent, useApiData } from '../lib/api';

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
  completed: { done: 38, expected: 40 },
  students,
  skillAverages,
  classProgress,
};

export default function TeacherClassResults({ setPage }: Props) {
  const results = useApiData('/classes/current/results', mockClass);
  const { header, completed, students, skillAverages, classProgress } = results.data;
  const classAvg = students.length ? Math.round(students.reduce((a, s) => a + s.avg, 0) / students.length) : 0;
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'avg' | 'assessments'>('avg');
  const [filterRange, setFilterRange] = useState('All');

  const filtered = students
    .filter(s => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
      const matchRange = filterRange === 'All' ||
        (filterRange === '80+' && s.avg >= 80) ||
        (filterRange === '60–79' && s.avg >= 60 && s.avg < 80) ||
        (filterRange === '<60' && s.avg < 60);
      return matchSearch && matchRange;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'avg') return b.avg - a.avg;
      return b.assessments - a.assessments;
    });

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-700 bg-emerald-50';
    if (score >= 65) return 'text-orange-700 bg-orange-50';
    return 'text-red-700 bg-red-50';
  };

  return (
    <div className="min-h-screen bg-[#F8F9FC] p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span className="text-xs font-mono font-600 text-emerald-600 uppercase tracking-widest">Teacher Dashboard</span>
            <DataSourceBadge source={results.source} reason={results.offlineReason} />
          </div>
          <h1 className="font-display font-700 text-2xl text-gray-900">Class Results Overview</h1>
          <p className="text-sm text-gray-500 font-body mt-0.5">{header.className} · {header.subtitle} · {students.length} students</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E8EAF0] bg-white text-sm font-medium font-body text-gray-600 hover:border-emerald-200 hover:text-emerald-700 transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Export CSV
          </button>
          <button
            onClick={() => setPage('access-logging')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold font-body transition-all shadow-sm shadow-emerald-200"
          >
            🔒 Audit Logs
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Class Average', value: `${classAvg}%`, icon: '📊', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Students Above 80%', value: String(students.filter(s => s.avg >= 80).length), icon: '🌟', color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Students Needing Support', value: String(students.filter(s => s.avg < 65).length), icon: '🎯', color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Assessments Completed', value: `${completed.done} / ${completed.expected}`, icon: '✅', color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-[#E8EAF0] p-4 shadow-sm">
            <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center text-lg mb-3`}>{s.icon}</div>
            <div className={`font-display font-700 text-2xl ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-400 font-body mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-5 mb-5">
        {/* Skill averages bar */}
        <div className="col-span-2 bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-5">
          <h2 className="font-display font-600 text-gray-900 mb-1">Average Skill Scores — Class</h2>
          <p className="text-xs text-gray-400 font-body mb-4">Class mean across 7 competencies</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={skillAverages} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F2F7" />
              <XAxis dataKey="skill" tick={{ fontSize: 11, fill: '#9CA3AF', fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9CA3AF', fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E8EAF0' }} formatter={(v) => [`${v}%`, 'Class Avg']} />
              <Bar dataKey="avg" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Progress over time */}
        <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-5">
          <h2 className="font-display font-600 text-gray-900 mb-1">Progress Over Time</h2>
          <p className="text-xs text-gray-400 font-body mb-4">Weekly class average</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={classProgress}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F2F7" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9CA3AF', fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
              <YAxis domain={[55, 85]} tick={{ fontSize: 10, fill: '#9CA3AF', fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E8EAF0' }} formatter={(v) => [`${v}%`, 'Avg']} />
              <Line type="monotone" dataKey="avg" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
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
            {['All', '80+', '60–79', '<60'].map((r) => (
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
                      <div className="text-xs text-gray-400 font-body">{s.assessments} assessments</div>
                    </div>
                  </div>
                </td>
                {Object.values(s.skills).map((score, i) => (
                  <td key={i} className="px-3 py-3.5 text-center">
                    <span className={`text-xs font-mono font-600 px-1.5 py-0.5 rounded ${getScoreColor(score)}`}>
                      {score}
                    </span>
                  </td>
                ))}
                <td className="px-3 py-3.5 text-center">
                  <span className={`text-sm font-display font-700 px-2 py-1 rounded-lg ${getScoreColor(s.avg)}`}>
                    {s.avg}%
                  </span>
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
    </div>
  );
}
