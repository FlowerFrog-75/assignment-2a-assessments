import type { Page } from '../types';
import { useAuth, useUser } from '../lib/auth';
import { PAGES, SECTIONS, pageTitle, type Section } from '../lib/pages';

interface SidebarProps {
  currentPage: Page;
  setPage: (page: Page) => void;
}

const ORDER: Section[] = ['student', 'teaching', 'admin', 'account'];

export default function Sidebar({ currentPage, setPage }: SidebarProps) {
  const user = useUser();
  const { state, signOut } = useAuth();
  const school = state.status === 'signed-in' ? state.school : null;
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
  const roleLabel = user.role === 'student' ? `Student${user.yearLevel ? ` · Grade ${user.yearLevel}` : ''}` : user.role === 'teacher' ? 'Teacher' : 'Administrator';

  const entries = (Object.entries(PAGES) as [Exclude<Page, 'login'>, (typeof PAGES)[keyof typeof PAGES]][]).filter(
    ([, info]) => info.nav && info.roles.includes(user.role),
  );

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-[#1A1B2E] text-white fixed left-0 top-0 bottom-0 z-20">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-sm font-bold">W</div>
          <div className="min-w-0">
            <div className="font-display font-700 text-sm leading-tight">Digital Skills <span className="text-purple-300">Wallet</span></div>
            <div className="text-[11px] text-white/40 truncate">{school?.name ?? 'School not set up yet'}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-hidden">
        {ORDER.map((section, index) => {
          const items = entries.filter(([, info]) => info.section === section);
          if (items.length === 0) return null;
          const style = SECTIONS[section];
          return (
            <div key={section}>
              {index > 0 && <div className="border-t border-white/5 my-3 mx-4"></div>}
              <div className="px-4 mb-1">
                <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                  <div className={`w-2 h-2 rounded-full ${style.dot}`}></div>
                  <span className={`text-[10px] font-mono font-600 tracking-widest uppercase ${style.text}`}>{style.label}</span>
                </div>
                {items.map(([id, info]) => (
                  <button
                    key={id}
                    onClick={() => setPage(id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mb-0.5 text-left ${
                      currentPage === id || (id === 'assessment-template' && currentPage === 'template-editor') || (id === 'teacher-class' && currentPage === 'teacher-individual')
                        ? style.active
                        : 'text-white/60 hover:bg-white/5 hover:text-white/90'
                    }`}
                  >
                    <span className="text-base">{info.icon}</span>
                    <span className="font-body">{pageTitle(id, user.role)}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <button onClick={() => setPage('account')} className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-xs font-bold text-white" title="My account">
            {initials}
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">{user.firstName} {user.lastName}</div>
            <div className="text-xs text-white/40 truncate">{roleLabel}</div>
          </div>
          <button onClick={signOut} title="Sign out" aria-label="Sign out" className="text-white/40 hover:text-white/70 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
