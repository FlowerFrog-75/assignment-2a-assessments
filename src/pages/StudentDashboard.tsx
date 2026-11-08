import type { Page } from '../types';
import DataSourceBadge from '../components/DataSourceBadge';
import { selectResult, useApiData } from '../lib/api';
import { PageStatus } from '../components/ui';
import { ChartCard, EmptyChart, SkillBullets, skillFinding, type BulletRow } from '../components/charts';

interface Props { setPage: (p: Page) => void; }

const skills = [
  { name: 'Analytical Thinking', short: 'Analytical', score: 78, coins: 156, trend: '+5' },
  { name: 'Research', short: 'Research', score: 65, coins: 130, trend: '+8' },
  { name: 'Critical Thinking', short: 'Critical', score: 82, coins: 164, trend: '+3' },
  { name: 'Creativity', short: 'Creativity', score: 71, coins: 142, trend: '+12' },
  { name: 'Decision-Making', short: 'Decision', score: 59, coins: 118, trend: '-2' },
  { name: 'Collaboration', short: 'Collab.', score: 88, coins: 176, trend: '+6' },
  { name: 'Adaptability / Growth Mindset', short: 'Adaptability', score: 74, coins: 148, trend: '+9' },
];

const activeAssessments = [
  { id: '1', title: 'Critical Thinking in Data Interpretation', subject: 'Science', due: 'Due in 2 days', progress: 33, questions: 24, done: 8 },
  { id: '2', title: 'Decision-Making Under Uncertainty', subject: 'Economics', due: 'Due tomorrow', progress: 0, questions: 20, done: 0 },
  { id: '3', title: 'Research Methods & Source Evaluation', subject: 'Humanities', due: 'Due in 5 days', progress: 75, questions: 28, done: 21 },
];

const completedAssessments = [
  { id: '1', title: 'Collaborative Problem Solving', subject: 'Mathematics', date: 'Oct 14, 2024', score: 84, grade: 'A' },
  { id: '2', title: 'Growth Mindset & Resilience Survey', subject: 'Personal Development', date: 'Oct 9, 2024', score: 91, grade: 'A+' },
  { id: '3', title: 'Creative Writing Challenge', subject: 'English', date: 'Oct 2, 2024', score: 73, grade: 'B' },
];

// Demo data, shown when the API server isn't running. The live version comes
// from GET /api/me/dashboard in the same shape.
const mockDashboard = {
  student: { firstName: 'Jordan', subtitle: 'Wednesday, October 16 · Grade 11 · Room 204' },
  stats: { active: 3, completed: 12, averageScore: 76, badges: 7 },
  skills,
  activeAssessments,
  completedAssessments,
};

const gradeColor = (g: string) => {
  if (g.startsWith('A')) return 'text-emerald-600 bg-emerald-50';
  if (g.startsWith('B')) return 'text-blue-600 bg-blue-50';
  return 'text-orange-600 bg-orange-50';
};

export default function StudentDashboard({ setPage }: Props) {
  const dashboard = useApiData('/me/dashboard', mockDashboard);
  if (!dashboard.ready) return <PageStatus error={dashboard.error} onRetry={dashboard.reload} />;
  const { student, stats, skills, activeAssessments, completedAssessments } = dashboard.data;
  const profileRows: BulletRow[] = skills.map((s) => ({
    key: s.name,
    name: s.name,
    score: 'assessed' in s && s.assessed === false ? null : s.score,
    change: Number(s.trend) || 0,
    trailing: undefined,
  }));
  const totalCoins = skills.reduce((a, b) => a + b.coins, 0);

  return (
    <div className="min-h-screen bg-[#F8F9FC] p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <span className="text-xs font-mono font-600 text-orange-600 uppercase tracking-widest">Student Interface</span>
            <DataSourceBadge source={dashboard.source} reason={dashboard.offlineReason} />
          </div>
          <h1 className="font-display font-700 text-2xl text-gray-900">
            {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}, {student.firstName} 👋
          </h1>
          <p className="text-sm text-gray-500 font-body mt-0.5">{student.subtitle}</p>
        </div>
        <button
          onClick={() => setPage('digital-wallet')}
          className="flex items-center gap-3 bg-white border border-orange-200 hover:border-orange-400 rounded-xl px-4 py-3 transition-all shadow-sm"
        >
          <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-lg">💎</div>
          <div>
            <div className="font-display font-700 text-orange-600 text-lg leading-none">{totalCoins.toLocaleString()}</div>
            <div className="text-xs text-gray-400 font-body">Skill Coins</div>
          </div>
        </button>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active Assessments', value: String(stats.active), icon: '✏️', color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Completed', value: String(stats.completed), icon: '✅', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Average Score', value: `${stats.averageScore}%`, icon: '📊', color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Skill Badges', value: String(stats.badges), icon: '🏅', color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-[#E8EAF0] p-4 shadow-sm">
            <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center text-lg mb-3`}>{s.icon}</div>
            <div className={`font-display font-700 text-2xl ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-400 font-body mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Skill profile: the core of the wallet, strongest first, with change since the last result */}
      <ChartCard
        className="mb-5"
        title={skillFinding(profileRows)}
        subtitle={`Your skill profile across ${stats.completed} released result${stats.completed === 1 ? '' : 's'}. Bars show your score; bands show the level.`}
        action={
          <button onClick={() => setPage('digital-wallet')} className="text-xs text-orange-600 hover:text-orange-700 font-semibold font-body whitespace-nowrap">
            Open wallet →
          </button>
        }
      >
        {stats.completed === 0 ? (
          <EmptyChart>Your skill profile fills in when your first result is released. Start with an assessment below.</EmptyChart>
        ) : (
          <SkillBullets rows={profileRows} changeLabel="Last result" />
        )}
      </ChartCard>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 flex flex-col gap-5">
          {/* Active Assessments */}
          <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#F0F2F7]">
              <div>
                <h2 className="font-display font-600 text-gray-900">Active Assessments</h2>
                <p className="text-xs text-gray-400 font-body mt-0.5">{activeAssessments.length} in progress</p>
              </div>
              <button
                onClick={() => setPage('student-assessments')}
                className="text-xs text-orange-600 hover:text-orange-700 font-semibold font-body"
              >
                View All →
              </button>
            </div>
            <div className="divide-y divide-[#F0F2F7]">
              {activeAssessments.length === 0 && <div className="px-5 py-8 text-center text-sm text-gray-400 font-body">Nothing to do right now. New assessments from your teachers appear here.</div>}
              {activeAssessments.map((a) => (
                <div key={a.id} className="px-5 py-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-body font-600 text-sm text-gray-800 mb-0.5">{a.title}</h3>
                      <span className="text-xs font-mono text-gray-400">{a.subject}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-body px-2 py-0.5 rounded-full ${
                        a.due.includes('tomorrow') ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                      }`}>
                        {a.due}
                      </span>
                      <button
                        onClick={() => setPage('student-assessments')}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold font-body transition-all"
                      >
                        {a.progress > 0 ? 'Continue' : 'Start'}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-orange-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${a.progress}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-400 font-mono">{a.done}/{a.questions}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
        <div className="flex flex-col gap-5">
          {/* Completed */}
          <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#F0F2F7]">
              <div>
                <h2 className="font-display font-600 text-gray-900">Completed Assessments</h2>
                <p className="text-xs text-gray-400 font-body mt-0.5">Recent results</p>
              </div>
              <button
                onClick={() => setPage('results-interface')}
                className="text-xs text-orange-600 hover:text-orange-700 font-semibold font-body"
              >
                All results →
              </button>
            </div>
            <div className="divide-y divide-[#F0F2F7]">
              {completedAssessments.length === 0 && <div className="px-5 py-8 text-center text-sm text-gray-400 font-body">No results yet. They appear once your teacher releases them.</div>}
              {completedAssessments.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { selectResult(a.id); setPage('results-interface'); }}
                  className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-display font-700 text-sm ${gradeColor(a.grade)}`}>
                    {a.grade}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-body font-600 text-sm text-gray-800 truncate">{a.title}</div>
                    <div className="text-xs text-gray-400 font-body mt-0.5">{a.subject} · {a.date}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-700 text-lg text-gray-900">{a.score}%</div>
                    <div className="text-xs text-gray-400 font-body">Score</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
