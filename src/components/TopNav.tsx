import type { Page } from '../types';
import { useAuth, useUser } from '../lib/auth';
import { PAGES, SECTIONS, pageTitle } from '../lib/pages';

interface TopNavProps {
  currentPage: Page;
  setPage: (page: Page) => void;
}

const sectionColor = { student: 'text-orange-600', teaching: 'text-emerald-600', admin: 'text-blue-600', account: 'text-purple-600' } as const;

export default function TopNav({ currentPage, setPage }: TopNavProps) {
  const user = useUser();
  const { state, signOut } = useAuth();
  if (currentPage === 'login') return null;
  const info = PAGES[currentPage];
  const preview = state.status === 'signed-in' && state.preview;

  return (
    <header className="h-14 bg-white border-b border-[#E8EAF0] flex items-center px-6 gap-4 fixed top-0 left-64 right-0 z-10">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm text-gray-400 font-body">{SECTIONS[info.section].label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 flex-shrink-0">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className={`text-sm font-semibold font-display ${sectionColor[info.section]}`}>{pageTitle(currentPage, user.role)}</span>
        {preview && <span className="ml-3 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">Design preview · sample data</span>}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setPage('account')} className="flex items-center gap-2 pl-2 pr-3 py-1 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-[11px] font-bold text-white">
            {`${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()}
          </div>
          <span className="text-sm font-medium text-gray-700 font-body">{user.firstName} {user.lastName[0]}.</span>
        </button>
        <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-50 font-body">
          Sign out
        </button>
      </div>
    </header>
  );
}
