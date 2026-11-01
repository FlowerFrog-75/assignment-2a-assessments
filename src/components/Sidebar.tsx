import type { Page } from '../types';

interface SidebarProps {
  currentPage: Page;
  setPage: (page: Page) => void;
}

const assessmentNav: { id: Page; label: string; icon: string }[] = [
  { id: 'assessment-template', label: 'Assessment Templates', icon: '📋' },
  { id: 'assessment-interface', label: 'Assessment Interface', icon: '✏️' },
];

const studentNav: { id: Page; label: string; icon: string }[] = [
  { id: 'student-dashboard', label: 'Student Dashboard', icon: '🎓' },
  { id: 'results-interface', label: 'Results', icon: '📊' },
  { id: 'digital-wallet', label: 'Skills Wallet', icon: '💎' },
  { id: 'public-verification', label: 'Public Verification', icon: '🔗' },
];

const teacherNav: { id: Page; label: string; icon: string }[] = [
  { id: 'teacher-class', label: 'Class Results', icon: '📈' },
  { id: 'teacher-individual', label: 'Individual Results', icon: '👤' },
  { id: 'access-logging', label: 'Access Logs', icon: '🔒' },
];

const blockchainNav: { id: Page; label: string; icon: string }[] = [
  { id: 'blockchain-ledger', label: 'Blockchain Ledger', icon: '⛓️' },
];

export default function Sidebar({ currentPage, setPage }: SidebarProps) {
  return (
    <aside className="flex flex-col w-64 min-h-screen bg-[#1A1B2E] text-white fixed left-0 top-0 bottom-0 z-20">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-sm font-bold">
            W
          </div>
          <div>
            <div className="font-display font-700 text-sm leading-tight">Digital Skills</div>
            <div className="font-display font-700 text-sm leading-tight text-purple-300">Wallet</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-hidden">
        {/* Assessment System */}
        <div className="px-4 mb-1">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-purple-400"></div>
            <span className="text-[10px] font-mono font-600 tracking-widest uppercase text-purple-400">
              Assessment System
            </span>
          </div>
          {assessmentNav.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mb-0.5 text-left ${
                currentPage === item.id
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/30'
                  : 'text-white/60 hover:bg-white/5 hover:text-white/90'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="font-body">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-white/5 my-3 mx-4"></div>

        {/* Student Interface */}
        <div className="px-4 mb-1">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-orange-400"></div>
            <span className="text-[10px] font-mono font-600 tracking-widest uppercase text-orange-400">
              Student Interface
            </span>
          </div>
          {studentNav.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mb-0.5 text-left ${
                currentPage === item.id
                  ? 'bg-orange-600/30 text-orange-300 border border-orange-500/30'
                  : 'text-white/60 hover:bg-white/5 hover:text-white/90'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="font-body">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-white/5 my-3 mx-4"></div>

        {/* Teacher Dashboard */}
        <div className="px-4 mb-1">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
            <span className="text-[10px] font-mono font-600 tracking-widest uppercase text-emerald-400">
              Teacher Dashboard
            </span>
          </div>
          {teacherNav.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mb-0.5 text-left ${
                currentPage === item.id
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30'
                  : 'text-white/60 hover:bg-white/5 hover:text-white/90'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="font-body">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-white/5 my-3 mx-4"></div>

        {/* Blockchain (Hyperledger Fabric) */}
        <div className="px-4 mb-1">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-blue-400"></div>
            <span className="text-[10px] font-mono font-600 tracking-widest uppercase text-blue-400">
              Blockchain
            </span>
          </div>
          {blockchainNav.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mb-0.5 text-left ${
                currentPage === item.id
                  ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30'
                  : 'text-white/60 hover:bg-white/5 hover:text-white/90'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="font-body">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* User Footer */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-xs font-bold text-white">
            JS
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">Jordan Smith</div>
            <div className="text-xs text-white/40 truncate">Student · Grade 11</div>
          </div>
          <button className="text-white/40 hover:text-white/70 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
