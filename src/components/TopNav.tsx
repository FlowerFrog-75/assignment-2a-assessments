import type { Page } from '../types';

interface TopNavProps {
  currentPage: Page;
  setPage: (page: Page) => void;
}

const pageMeta: Record<Page, { title: string; breadcrumb: string; color: string; badge: string }> = {
  login: { title: 'Sign In', breadcrumb: 'Authentication', color: 'text-purple-600', badge: '' },
  'assessment-template': { title: 'Assessment Templates', breadcrumb: 'Assessment System', color: 'text-purple-600', badge: 'bg-purple-100 text-purple-700' },
  'assessment-interface': { title: 'Active Assessment', breadcrumb: 'Assessment System', color: 'text-purple-600', badge: 'bg-purple-100 text-purple-700' },
  'student-dashboard': { title: 'Student Dashboard', breadcrumb: 'Student Interface', color: 'text-orange-600', badge: 'bg-orange-100 text-orange-700' },
  'results-interface': { title: 'Assessment Results', breadcrumb: 'Student Interface', color: 'text-orange-600', badge: 'bg-orange-100 text-orange-700' },
  'digital-wallet': { title: 'Digital Skills Wallet', breadcrumb: 'Student Interface', color: 'text-orange-600', badge: 'bg-orange-100 text-orange-700' },
  'public-verification': { title: 'Public Credential Verification', breadcrumb: 'Student Interface', color: 'text-orange-600', badge: 'bg-orange-100 text-orange-700' },
  'teacher-class': { title: 'Class Results Overview', breadcrumb: 'Teacher Dashboard', color: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  'teacher-individual': { title: 'Individual Student Results', breadcrumb: 'Teacher Dashboard', color: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  'access-logging': { title: 'Access & Audit Logs', breadcrumb: 'Teacher Dashboard', color: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  'blockchain-ledger': { title: 'Blockchain Ledger', breadcrumb: 'Blockchain', color: 'text-blue-600', badge: 'bg-blue-100 text-blue-700' },
};

export default function TopNav({ currentPage, setPage }: TopNavProps) {
  const meta = pageMeta[currentPage];

  return (
    <header className="h-14 bg-white border-b border-[#E8EAF0] flex items-center px-6 gap-4 fixed top-0 left-64 right-0 z-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm text-gray-400 font-body">{meta.breadcrumb}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 flex-shrink-0">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span className={`text-sm font-semibold font-display ${meta.color}`}>{meta.title}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-50">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <span className="font-body">Search</span>
        </button>
        <button className="relative w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full"></span>
        </button>
        <button
          onClick={() => setPage('login')}
          className="flex items-center gap-2 pl-2 pr-3 py-1 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-[11px] font-bold text-white">
            JS
          </div>
          <span className="text-sm font-medium text-gray-700 font-body">Jordan S.</span>
        </button>
      </div>
    </header>
  );
}
