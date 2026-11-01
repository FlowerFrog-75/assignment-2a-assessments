export type Page =
  | 'login'
  | 'assessment-template'
  | 'student-dashboard'
  | 'assessment-interface'
  | 'results-interface'
  | 'digital-wallet'
  | 'public-verification'
  | 'teacher-class'
  | 'teacher-individual'
  | 'access-logging'
  | 'blockchain-ledger';

export type UserRole = 'student' | 'teacher' | 'admin';

export interface AppState {
  currentPage: Page;
  userRole: UserRole;
  setPage: (page: Page) => void;
}
