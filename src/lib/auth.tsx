import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { UserRole } from '../types';
import { apiGet, apiSend, setPreviewMode, setUnauthorizedHandler } from './api';

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  walletId: string | null;
  yearLevel: number | null;
  twoFactorEnabled: boolean;
  twoFactorRequired: boolean;
  mustChangePassword: boolean;
  setupRequired: boolean;
  /** Sample-school account (simple password, no 2FA). */
  sample?: boolean;
}

export interface SchoolInfo {
  name: string;
  shortName: string | null;
}

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; offline: boolean }
  | { status: 'signed-in'; user: SessionUser; school: SchoolInfo | null; preview: boolean };

interface AuthContextValue {
  state: AuthState;
  /** Re-reads the signed-in user (after sign-in, password change, 2FA setup...). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Development only: browse the screens with sample data while the API is offline. */
  enterPreview: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PREVIEW_USERS: Record<UserRole, SessionUser> = {
  student: { id: 'preview', email: 'student@preview', firstName: 'Jordan', lastName: 'Smith', role: 'student', walletId: 'DSW-2024-JS-1147', yearLevel: 11, twoFactorEnabled: false, twoFactorRequired: false, mustChangePassword: false, setupRequired: false },
  teacher: { id: 'preview', email: 'teacher@preview', firstName: 'Sarah', lastName: 'Chen', role: 'teacher', walletId: null, yearLevel: null, twoFactorEnabled: true, twoFactorRequired: true, mustChangePassword: false, setupRequired: false },
  admin: { id: 'preview', email: 'admin@preview', firstName: 'Alex', lastName: 'Admin', role: 'admin', walletId: null, yearLevel: null, twoFactorEnabled: true, twoFactorRequired: true, mustChangePassword: false, setupRequired: false },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    const result = await apiGet<{ user: SessionUser; school: SchoolInfo | null }>('/auth/me');
    if (result.kind === 'ok') {
      setPreviewMode(false);
      setState({ status: 'signed-in', user: result.data.user, school: result.data.school, preview: false });
    } else {
      setState({ status: 'signed-out', offline: result.kind === 'offline' });
    }
  }, []);

  const signOut = useCallback(async () => {
    const preview = state.status === 'signed-in' && state.preview;
    if (!preview) await apiSend('POST', '/auth/logout').catch(() => undefined);
    setPreviewMode(false);
    setState({ status: 'signed-out', offline: preview });
  }, [state]);

  const enterPreview = useCallback((role: UserRole) => {
    if (!import.meta.env.DEV) return;
    setPreviewMode(true);
    setState({ status: 'signed-in', user: PREVIEW_USERS[role], school: { name: 'Design preview', shortName: null }, preview: true });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    // A request came back 401 (session expired or signed out elsewhere).
    setUnauthorizedHandler(() => setState((s) => (s.status === 'signed-in' && !s.preview ? { status: 'signed-out', offline: false } : s)));
    return () => setUnauthorizedHandler(null);
  }, []);

  return <AuthContext.Provider value={{ state, refresh, signOut, enterPreview }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** The signed-in user. Only call on screens that are shown after sign-in. */
export function useUser(): SessionUser {
  const { state } = useAuth();
  if (state.status !== 'signed-in') throw new Error('No user is signed in');
  return state.user;
}
