import type { Page, UserRole } from '../types';

export type Section = 'student' | 'teaching' | 'admin' | 'account';

export interface PageInfo {
  title: string;
  section: Section;
  icon: string;
  /** Who may open it. */
  roles: UserRole[];
  /** Shown in the sidebar (some pages are only reached from other pages). */
  nav?: boolean;
  /** Full screen, without the sidebar. */
  fullscreen?: boolean;
}

const staff: UserRole[] = ['teacher', 'admin'];

export const PAGES: Record<Exclude<Page, 'login'>, PageInfo> = {
  'student-dashboard': { title: 'Dashboard', section: 'student', icon: '🎓', roles: ['student'], nav: true },
  'student-assessments': { title: 'My Assessments', section: 'student', icon: '✏️', roles: ['student'], nav: true },
  'assessment-interface': { title: 'Assessment', section: 'student', icon: '✏️', roles: ['student'], fullscreen: true },
  'results-interface': { title: 'Results', section: 'student', icon: '📊', roles: ['student'], nav: true },
  'digital-wallet': { title: 'Skills Wallet', section: 'student', icon: '💎', roles: ['student'], nav: true },
  privacy: { title: 'Sharing & Privacy', section: 'student', icon: '🔗', roles: ['student'], nav: true },
  'public-verification': { title: 'Verify a Credential', section: 'student', icon: '✅', roles: ['student', 'teacher', 'admin'], fullscreen: true },

  'teacher-class': { title: 'Class Results', section: 'teaching', icon: '📈', roles: staff, nav: true },
  'teacher-individual': { title: 'Individual Results', section: 'teaching', icon: '👤', roles: staff },
  marking: { title: 'Marking & Release', section: 'teaching', icon: '📝', roles: staff, nav: true },
  'assessment-template': { title: 'Assessment Templates', section: 'teaching', icon: '📋', roles: staff, nav: true },
  'template-editor': { title: 'Edit Template', section: 'teaching', icon: '📋', roles: staff },
  'item-bank': { title: 'Question Bank', section: 'teaching', icon: '🗃️', roles: staff, nav: true },

  'admin-overview': { title: 'Overview', section: 'admin', icon: '🏫', roles: ['admin'], nav: true },
  'admin-users': { title: 'Users', section: 'admin', icon: '👥', roles: ['admin'], nav: true },
  'admin-classes': { title: 'Classes', section: 'admin', icon: '🗂️', roles: ['admin'], nav: true },
  'admin-coins': { title: 'Skill Coins', section: 'admin', icon: '🪙', roles: ['admin'], nav: true },
  'blockchain-ledger': { title: 'Blockchain Ledger', section: 'admin', icon: '⛓️', roles: ['admin'], nav: true },
  'admin-school': { title: 'School Settings', section: 'admin', icon: '⚙️', roles: ['admin'], nav: true },

  'access-logging': { title: 'Access Logs', section: 'account', icon: '🔒', roles: ['student', 'teacher', 'admin'], nav: true },
  account: { title: 'My Account', section: 'account', icon: '🙂', roles: ['student', 'teacher', 'admin'], nav: true },
};

export const SECTIONS: Record<Section, { label: string; dot: string; text: string; active: string }> = {
  student: { label: 'Student', dot: 'bg-orange-400', text: 'text-orange-400', active: 'bg-orange-600/30 text-orange-300 border border-orange-500/30' },
  teaching: { label: 'Teaching', dot: 'bg-emerald-400', text: 'text-emerald-400', active: 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30' },
  admin: { label: 'Administration', dot: 'bg-blue-400', text: 'text-blue-400', active: 'bg-blue-600/30 text-blue-300 border border-blue-500/30' },
  account: { label: 'Account', dot: 'bg-purple-400', text: 'text-purple-400', active: 'bg-purple-600/30 text-purple-300 border border-purple-500/30' },
};

export function homePage(role: UserRole): Page {
  return role === 'student' ? 'student-dashboard' : role === 'teacher' ? 'teacher-class' : 'admin-overview';
}

export function canOpen(role: UserRole, page: Page): boolean {
  return page !== 'login' && PAGES[page].roles.includes(role);
}

/** Label for the Access Logs page, which means something different to each role. */
export function pageTitle(page: Exclude<Page, 'login'>, role: UserRole): string {
  if (page === 'access-logging') return role === 'student' ? 'Who Accessed My Data' : role === 'teacher' ? 'Access Logs' : 'Audit Log';
  return PAGES[page].title;
}
