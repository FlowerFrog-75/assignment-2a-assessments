import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import type { Page } from '../types';
import DataSourceBadge from '../components/DataSourceBadge';
import { useApiData } from '../lib/api';
import { PageStatus } from '../components/ui';

interface Props { setPage: (p: Page) => void; }

const mockSkills = [
  { name: 'Analytical Thinking', coins: 156, level: 4, maxLevel: 5, badge: '🔍', color: '#7C3AED', progress: 78 },
  { name: 'Research', coins: 130, level: 3, maxLevel: 5, badge: '📚', color: '#2563EB', progress: 65 },
  { name: 'Critical Thinking', coins: 164, level: 4, maxLevel: 5, badge: '🧠', color: '#DC2626', progress: 82 },
  { name: 'Creativity', coins: 142, level: 3, maxLevel: 5, badge: '🎨', color: '#D97706', progress: 71 },
  { name: 'Decision-Making', coins: 118, level: 3, maxLevel: 5, badge: '⚖️', color: '#0891B2', progress: 59 },
  { name: 'Collaboration', coins: 176, level: 4, maxLevel: 5, badge: '🤝', color: '#059669', progress: 88 },
  { name: 'Adaptability', coins: 148, level: 3, maxLevel: 5, badge: '🌱', color: '#F97316', progress: 74 },
];

const mockAchievements = [
  { id: '1', code: 'research-pioneer', title: 'Research Pioneer', desc: 'Completed 5 research assessments with 70%+ score', date: 'Oct 14, 2024', badge: '🔬', verified: true },
  { id: '2', code: 'critical-mind', title: 'Critical Mind', desc: 'Achieved Advanced level in Critical Thinking', date: 'Oct 9, 2024', badge: '🧠', verified: true },
  { id: '3', code: 'team-player', title: 'Team Player', desc: 'Highest collaboration score in class', date: 'Sep 28, 2024', badge: '🤝', verified: true },
  { id: '4', code: 'first-assessment', title: 'First Assessment', desc: 'Completed first Digital Skills assessment', date: 'Sep 5, 2024', badge: '🌟', verified: true },
];

const mockCoinHistory = [
  { month: 'Jul', coins: 420 },
  { month: 'Aug', coins: 680 },
  { month: 'Sep', coins: 890 },
  { month: 'Oct', coins: 1034 },
];

// Look of each skill and badge (the data itself comes from the API).
const SKILL_STYLE: Record<string, { badge: string; color: string }> = Object.fromEntries(
  mockSkills.map((s) => [s.name, { badge: s.badge, color: s.color }]),
);
const BADGE_ICON: Record<string, string> = Object.fromEntries(mockAchievements.map((a) => [a.code, a.badge]));

// Demo data, shown when the API server isn't running. The live version comes
// from GET /api/students/:walletId/wallet in the same shape.
const mockWallet = {
  student: { name: 'Jordan Smith', grade: 'Grade 11', walletId: 'DSW-2024-JS-1147' },
  stats: { assessments: 15, badges: 7, levelAverage: '3.6' },
  skills: mockSkills.map(({ name, coins, level, maxLevel, progress }) => ({ key: name, name, coins, level, maxLevel, progress })),
  achievements: mockAchievements.map(({ badge: _badge, ...a }) => a),
  coinHistory: mockCoinHistory,
  ledger: { committed: 0, total: 0 },
};

export default function DigitalWallet({ setPage }: Props) {
  const wallet = useApiData('/me/wallet', mockWallet);
  if (!wallet.ready) return <PageStatus error={wallet.error} onRetry={wallet.reload} />;
  const { student, stats, coinHistory, ledger } = wallet.data;
  const skills = wallet.data.skills.map((s) => ({ ...s, ...(SKILL_STYLE[s.name] ?? { badge: '⭐', color: '#7C3AED' }) }));
  const achievements = wallet.data.achievements.map((a) => ({ ...a, badge: BADGE_ICON[a.code] ?? '🏅' }));
  const totalCoins = skills.reduce((a, b) => a + b.coins, 0);

  return (
    <div className="min-h-screen bg-[#F8F9FC] p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <span className="text-xs font-mono font-600 text-orange-600 uppercase tracking-widest">Student Interface</span>
            <DataSourceBadge source={wallet.source} reason={wallet.offlineReason} />
          </div>
          <h1 className="font-display font-700 text-2xl text-gray-900">Digital Skills Wallet</h1>
          <p className="text-sm text-gray-500 font-body mt-0.5">{student.name} · {student.grade} · ID: {student.walletId}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setPage('privacy')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E8EAF0] bg-white text-sm font-medium font-body text-gray-600 hover:border-orange-200 hover:text-orange-700 transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share Wallet
          </button>
          <button
            onClick={() => setPage('privacy')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold font-body transition-all shadow-sm shadow-orange-200"
          >
            🔗 Create verification link
          </button>
        </div>
      </div>

      {/* Wallet hero card */}
      <div className="bg-gradient-to-br from-[#1A1B2E] to-[#252641] rounded-2xl p-6 mb-6 relative overflow-hidden shadow-lg">
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex items-center gap-8">
          <div className="text-center">
            <div className="font-display font-800 text-5xl text-white mb-1">{totalCoins.toLocaleString()}</div>
            <div className="text-orange-300 text-sm font-body font-500">Total Skill Coins</div>
            {wallet.source === 'live' && ledger.total > 0 && (
              <div className="text-[11px] text-emerald-300 font-body mt-1" title="Each coin is a transaction on the Hyperledger Fabric ledger">
                ⛓ {ledger.committed}/{ledger.total} on blockchain
              </div>
            )}
          </div>
          <div className="w-px h-16 bg-white/10"></div>
          <div className="grid grid-cols-3 gap-6 flex-1">
            {[
              { label: 'Assessments', value: String(stats.assessments), icon: '📋' },
              { label: 'Badges Earned', value: String(stats.badges), icon: '🏅' },
              { label: 'Skill Level Avg.', value: `${stats.levelAverage}/5`, icon: '⭐' },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-2xl mb-1">{s.icon}</div>
                <div className="font-display font-700 text-2xl text-white">{s.value}</div>
                <div className="text-white/50 text-xs font-body">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="w-px h-16 bg-white/10"></div>
          <div className="w-32 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={coinHistory} barSize={16}>
                <Bar dataKey="coins" fill="#F97316" radius={[3, 3, 0, 0]} />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)', fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: '#252641', color: '#fff' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Skills progress */}
        <div className="col-span-2 bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-5">
          <h2 className="font-display font-600 text-gray-900 mb-4">Skill Progress by Domain</h2>
          <div className="flex flex-col gap-5">
            {skills.map((s) => (
              <div key={s.name}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{s.badge}</span>
                    <span className="text-sm font-body font-600 text-gray-800">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-5 h-1.5 rounded-full ${i < s.level ? 'opacity-100' : 'opacity-20'}`}
                          style={{ background: i < s.level ? s.color : '#D1D5DB' }}
                        ></div>
                      ))}
                    </div>
                    <span className="text-xs font-mono text-gray-400">Lv.{s.level}</span>
                    <span className="font-display font-700 text-base text-gray-900 w-12 text-right">{s.coins}</span>
                    <span className="text-xs text-orange-500 font-body">coins</span>
                  </div>
                </div>
                <div className="bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${s.progress}%`, background: s.color }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Achievements */}
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-5">
            <h2 className="font-display font-600 text-gray-900 mb-4">Verified Achievements</h2>
            <div className="flex flex-col gap-3">
              {achievements.map((a) => (
                <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-[#F0F2F7]">
                  <span className="text-2xl flex-shrink-0">{a.badge}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-display font-600 text-gray-800">{a.title}</span>
                      {a.verified && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-blue-500 flex-shrink-0">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          <polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 font-body leading-snug">{a.desc}</p>
                    <p className="text-xs text-gray-300 font-mono mt-1">{a.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Share card */}
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-5">
            <div className="font-display font-600 text-orange-900 mb-1">Share Your Skills</div>
            <p className="text-xs text-orange-700 font-body mb-4 leading-relaxed">
              Share a verified public link to your skills wallet with employers, universities, and collaborators.
            </p>
            <button
              onClick={() => setPage('privacy')}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-lg py-2.5 text-sm font-semibold font-body transition-all"
            >
              Generate Verification Link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
