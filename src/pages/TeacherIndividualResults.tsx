import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { Page } from '../types';
import DataSourceBadge from '../components/DataSourceBadge';
import { selectedStudent, useApiData } from '../lib/api';

interface Props { setPage: (p: Page) => void; }

const mockStudent = {
  name: 'Jordan Smith',
  id: 'DSW-2024-JS-1147',
  grade: 'Grade 11',
  avatar: 'JS',
  overall: 79,
  topSkill: 'Collaboration',
  focusArea: 'Decision-Making',
  trend: '+6% this term',
  assessments: [
    { title: 'Critical Thinking in Data Interpretation', subject: 'Science', date: 'Oct 16', score: 79, status: 'Graded' },
    { title: 'Collaborative Problem Solving', subject: 'Mathematics', date: 'Oct 14', score: 84, status: 'Graded' },
    { title: 'Growth Mindset & Resilience Survey', subject: 'Personal Dev.', date: 'Oct 9', score: 91, status: 'Graded' },
    { title: 'Creative Writing Challenge', subject: 'English', date: 'Oct 2', score: 73, status: 'Graded' },
    { title: 'Research Methods & Source Evaluation', subject: 'Humanities', date: 'Oct 9', score: 67, status: 'In Progress' },
  ],
  skills: [
    { name: 'Analytical Thinking', short: 'Analytical', score: 78, level: 4, classAvg: 77 },
    { name: 'Research', short: 'Research', score: 65, level: 3, classAvg: 73 },
    { name: 'Critical Thinking', short: 'Critical', score: 82, level: 4, classAvg: 77 },
    { name: 'Creativity', short: 'Creativity', score: 71, level: 3, classAvg: 78 },
    { name: 'Decision-Making', short: 'Decision', score: 59, level: 3, classAvg: 71 },
    { name: 'Collaboration', short: 'Collab.', score: 88, level: 4, classAvg: 80 },
    { name: 'Adaptability', short: 'Adaptability', score: 74, level: 3, classAvg: 78 },
  ],
  notes: [
    { date: 'Oct 14', teacher: 'Ms. Chen', note: 'Shows strong verbal reasoning but struggles with quantitative analysis. Recommend additional data literacy resources.' },
    { date: 'Sep 30', teacher: 'Ms. Chen', note: 'Excellent collaboration in group tasks. Leadership potential observed. Encourage more independent research practice.' },
  ],
};

// Demo data, shown when the API server isn't running. The live version comes
// from GET /api/students/:walletId/profile in the same shape.
const mockProfile = { student: mockStudent };

export default function TeacherIndividualResults({ setPage }: Props) {
  const profile = useApiData(`/students/${selectedStudent()}/profile`, mockProfile);
  const { student } = profile.data;
  const firstName = student.name.split(' ')[0];
  const radarData = student.skills.map(s => ({ skill: s.short, student: s.score, classAvg: s.classAvg }));
  const compareData = student.skills.map(s => ({ skill: s.short, student: s.score, class: s.classAvg }));

  // The API refuses (403) when the student hasn't consented. The attempt is still audit-logged.
  if (profile.error) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] p-6">
        <button
          onClick={() => setPage('teacher-class')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-emerald-700 font-body transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Class View
        </button>
        <div className="max-w-lg mx-auto mt-16 bg-white rounded-2xl border border-[#E8EAF0] shadow-sm p-8 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="font-display font-700 text-xl text-gray-900 mb-2">
            {profile.error.code === 'consent_required' ? 'Student consent required' : 'Results unavailable'}
          </h1>
          <p className="text-sm text-gray-500 font-body leading-relaxed">{profile.error.message}</p>
          <p className="text-xs text-gray-400 font-body mt-4">This access attempt has been recorded in the Access Logs.</p>
        </div>
      </div>
    );
  }
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-700 bg-emerald-50';
    if (score >= 65) return 'text-orange-700 bg-orange-50';
    return 'text-red-700 bg-red-50';
  };

  return (
    <div className="min-h-screen bg-[#F8F9FC] p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPage('teacher-class')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-emerald-700 font-body transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Class View
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="text-xs font-mono font-600 text-emerald-600 uppercase tracking-widest">Individual Results</span>
              <DataSourceBadge source={profile.source} reason={profile.offlineReason} />
            </div>
            <h1 className="font-display font-700 text-2xl text-gray-900">{student.name}</h1>
            <p className="text-sm text-gray-500 font-body mt-0.5">{student.grade} · {student.id} · {student.trend}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E8EAF0] bg-white text-sm font-medium font-body text-gray-600 hover:border-emerald-200 transition-all">
            Message Student
          </button>
          <button
            onClick={() => setPage('digital-wallet')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold font-body transition-all shadow-sm shadow-emerald-200"
          >
            💎 View Wallet
          </button>
        </div>
      </div>

      {/* Student card */}
      <div className="bg-white rounded-2xl border border-[#E8EAF0] shadow-sm p-5 mb-5 flex items-center gap-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-xl font-bold text-white shadow-sm">
          {student.avatar}
        </div>
        <div className="flex-1 grid grid-cols-5 gap-6">
          {[
            { label: 'Overall Score', value: `${student.overall}%`, color: 'text-emerald-700' },
            { label: 'Assessments', value: student.assessments.length, color: 'text-gray-900' },
            { label: 'Completed', value: student.assessments.filter(a => a.status === 'Graded').length, color: 'text-gray-900' },
            { label: 'Top Skill', value: student.topSkill, color: 'text-purple-700' },
            { label: 'Focus Area', value: student.focusArea, color: 'text-orange-700' },
          ].map((m) => (
            <div key={m.label}>
              <div className="text-xs text-gray-400 font-body mb-0.5">{m.label}</div>
              <div className={`font-display font-700 text-xl ${m.color}`}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Left: Assessment list */}
        <div className="flex flex-col gap-5">
          <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm">
            <div className="px-5 py-4 border-b border-[#F0F2F7]">
              <h2 className="font-display font-600 text-gray-900">Assessment History</h2>
            </div>
            <div className="divide-y divide-[#F0F2F7]">
              {student.assessments.map((a, i) => (
                <div key={i} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-body font-600 text-gray-800 truncate">{a.title}</div>
                      <div className="text-xs text-gray-400 font-body mt-0.5">{a.subject} · {a.date}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {a.status === 'Graded' ? (
                        <span className={`text-sm font-display font-700 px-2 py-0.5 rounded-lg ${getScoreColor(a.score)}`}>
                          {a.score}%
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-body">In Progress</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Teacher notes */}
          <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm">
            <div className="px-5 py-4 border-b border-[#F0F2F7] flex items-center justify-between">
              <h2 className="font-display font-600 text-gray-900">Teacher Notes</h2>
              <button className="text-xs text-emerald-600 font-semibold font-body hover:text-emerald-700">+ Add Note</button>
            </div>
            <div className="divide-y divide-[#F0F2F7]">
              {student.notes.map((n, i) => (
                <div key={i} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-gray-400">{n.date}</span>
                    <span className="text-gray-200">·</span>
                    <span className="text-xs font-body text-emerald-600">{n.teacher}</span>
                  </div>
                  <p className="text-xs text-gray-600 font-body leading-relaxed">{n.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Charts */}
        <div className="col-span-2 flex flex-col gap-5">
          {/* Radar comparison */}
          <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-5">
            <h2 className="font-display font-600 text-gray-900 mb-1">Student vs. Class Average</h2>
            <p className="text-xs text-gray-400 font-body mb-4">Skill profile comparison</p>
            <div className="grid grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#F0F2F7" />
                  <PolarAngleAxis dataKey="skill" tick={{ fontSize: 10, fill: '#9CA3AF', fontFamily: 'Inter' }} />
                  <Radar name={firstName} dataKey="student" stroke="#F97316" fill="#F97316" fillOpacity={0.2} strokeWidth={2} dot={{ fill: '#F97316', r: 3 }} />
                  <Radar name="Class Avg" dataKey="classAvg" stroke="#10B981" fill="#10B981" fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="4 2" />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E8EAF0' }} />
                </RadarChart>
              </ResponsiveContainer>

              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={compareData} barSize={14} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F2F7" />
                  <XAxis dataKey="skill" tick={{ fontSize: 9, fill: '#9CA3AF', fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#9CA3AF', fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E8EAF0' }} formatter={(v, n) => [`${v}%`, n === 'student' ? firstName : 'Class Avg']} />
                  <Bar dataKey="student" fill="#F97316" radius={[3, 3, 0, 0]} name="student" />
                  <Bar dataKey="class" fill="#10B981" radius={[3, 3, 0, 0]} name="class" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-6 mt-3 text-xs font-body text-gray-400">
              <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded bg-orange-400"></div> {student.name}</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded bg-emerald-500"></div> Class Average</div>
            </div>
          </div>

          {/* Skill detail table */}
          <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-5">
            <h2 className="font-display font-600 text-gray-900 mb-4">Detailed Skill Analysis</h2>
            <div className="flex flex-col gap-3">
              {student.skills.map((s) => {
                const diff = s.score - s.classAvg;
                return (
                  <div key={s.name} className="flex items-center gap-4">
                    <div className="w-36 text-xs font-body text-gray-700 flex-shrink-0">{s.name}</div>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2 relative">
                        <div className="h-2 rounded-full bg-orange-500 transition-all" style={{ width: `${s.score}%` }}></div>
                        <div className="absolute top-0 h-2 w-0.5 bg-emerald-500" style={{ left: `${s.classAvg}%` }}></div>
                      </div>
                      <span className="font-mono text-xs text-gray-600 w-8 text-right">{s.score}%</span>
                    </div>
                    <span className={`text-xs font-mono font-600 w-12 text-right ${diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {diff >= 0 ? '+' : ''}{diff}
                    </span>
                    <div className="flex gap-0.5 flex-shrink-0">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className={`w-2 h-2 rounded-sm ${i < s.level ? 'bg-orange-500' : 'bg-gray-100'}`}></div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
