export type Page =
  | 'login'
  | 'account'
  // student
  | 'student-dashboard'
  | 'student-assessments'
  | 'assessment-interface'
  | 'results-interface'
  | 'digital-wallet'
  | 'privacy'
  | 'public-verification'
  // teacher
  | 'teacher-class'
  | 'teacher-individual'
  | 'marking'
  | 'assessment-template'
  | 'template-editor'
  | 'item-bank'
  | 'access-logging'
  // admin
  | 'admin-overview'
  | 'admin-users'
  | 'admin-classes'
  | 'admin-school'
  | 'admin-coins'
  | 'blockchain-ledger';

export type UserRole = 'student' | 'teacher' | 'admin';
