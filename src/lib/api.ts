import { useEffect, useState } from 'react';

// Talks to the API server in server/ (MongoDB + Hyperledger Fabric).
//
// Production: screens show only real data. While it loads they show a
// spinner, and if the server can't be reached they say so.
//
// Design preview (development only): when the API isn't running, as in the
// Figma Make preview, the login screen offers a "design preview" that shows
// each screen's built-in sample data, labelled "Demo data".

/** Empty means "same server as the app" (Vite proxies /api to the API in development). */
const API_BASE: string = import.meta.env.VITE_API_URL ?? '';
const TIMEOUT_MS = 15000;

export type DataSource = 'loading' | 'live' | 'demo';

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

export type ApiResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'offline'; reason: string }
  | { kind: 'error'; error: ApiError };

// ---------------------------------------------------------------- preview

let previewMode = false;

/** Design preview: sample data instead of the API. Never available in production builds. */
export function setPreviewMode(on: boolean) {
  previewMode = on && import.meta.env.DEV;
}

export function isPreviewMode() {
  return previewMode;
}

// ------------------------------------------------------- signed-out hook

let onUnauthorized: (() => void) | null = null;

/** The auth provider registers this so an expired session returns to the sign-in screen. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

// --------------------------------------------------------------- requests

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (method !== 'GET') headers['X-Requested-With'] = 'dsw'; // the server's CSRF check
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${API_BASE}/api${path}`, {
      method,
      signal,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // No JSON means it wasn't our API answering (e.g. a static host returning index.html).
    if (!response.headers.get('content-type')?.includes('application/json')) {
      return { kind: 'offline', reason: 'The server is not running' };
    }
    const json = await response.json();
    if (response.ok) return { kind: 'ok', data: json as T };
    if (response.status === 503) return { kind: 'offline', reason: json.message ?? 'The database is not reachable' };
    if (response.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.();
    return { kind: 'error', error: { status: response.status, code: json.error ?? 'error', message: json.message ?? 'Request failed' } };
  } catch {
    return { kind: 'offline', reason: 'The server is not reachable' };
  }
}

/** GET /api/<path>. Never throws. */
export function apiGet<T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> {
  return request<T>('GET', path, undefined, signal);
}

/** An error from apiSend, with the server's message (safe to show to the user). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** POST/PUT/PATCH/DELETE. Throws ApiRequestError with a readable message on failure. */
export async function apiSend<T = { ok: true }>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const result = await request<T>(method, path, body ?? (method === 'DELETE' ? undefined : {}));
  if (result.kind === 'ok') return result.data;
  if (result.kind === 'offline') throw new ApiRequestError(0, 'offline', `${result.reason}. Check your connection and try again.`);
  throw new ApiRequestError(result.error.status, result.error.code, result.error.message);
}

// Requests still running, by path. Identical requests share one fetch, so a
// screen mounting twice (React's StrictMode does this in development) doesn't
// call the API twice, or write two audit-log entries for one view.
const inflight = new Map<string, Promise<ApiResult<unknown>>>();

/** Like apiGet, with a timeout, and shared between callers asking for the same path at once. */
export function apiGetShared<T>(path: string): Promise<ApiResult<T>> {
  let pending = inflight.get(path);
  if (!pending) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    pending = apiGet<unknown>(path, controller.signal).finally(() => {
      clearTimeout(timer);
      inflight.delete(path);
    });
    inflight.set(path, pending);
  }
  return pending as Promise<ApiResult<T>>;
}

export interface ApiData<T> {
  data: T;
  source: DataSource;
  /** True once there's something to show: live data, or sample data in the design preview. */
  ready: boolean;
  /** Set when the API answered with an error (e.g. 403 consent required), or couldn't be reached. */
  error: ApiError | null;
  /** Why the screen is showing sample data (design preview only). */
  offlineReason: string | null;
  reload: () => void;
}

/**
 * Loads a screen's data. `fallback` is the screen's sample data: it is only
 * shown in the design preview. Pass `null` as the path to skip loading.
 */
export function useApiData<T>(path: string | null, fallback: T): ApiData<T> {
  const [state, setState] = useState<Omit<ApiData<T>, 'reload'>>(() =>
    previewMode
      ? { data: fallback, source: 'demo', ready: true, error: null, offlineReason: 'Design preview' }
      : { data: fallback, source: path ? 'loading' : 'live', ready: false, error: null, offlineReason: null },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path || previewMode) return;
    let cancelled = false;
    setState((s) => ({ ...s, source: s.ready ? s.source : 'loading' }));
    apiGetShared<T>(path).then((result) => {
      if (cancelled) return;
      if (result.kind === 'ok') setState({ data: result.data, source: 'live', ready: true, error: null, offlineReason: null });
      else if (result.kind === 'offline')
        setState({ data: fallback, source: 'live', ready: false, error: { status: 0, code: 'offline', message: `${result.reason}. Try again in a moment.` }, offlineReason: null });
      else setState({ data: fallback, source: 'live', ready: false, error: result.error, offlineReason: null });
    });
    return () => {
      cancelled = true; // ignore the answer; the shared request finishes for anyone else waiting
    };
    // `fallback` is the screen's constant sample data; only the path (and reloads) should refetch.
  }, [path, attempt]);

  return { ...state, reload: () => setAttempt((n) => n + 1) };
}

// ------------------------------------------- selections between screens

function remember(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // storage unavailable (e.g. private mode)
  }
}

function recall(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The student a teacher opened from Class Results (kept for this browser tab). */
export const selectStudent = (walletId: string) => remember('dsw:selected-student', walletId);
export const selectedStudent = () => recall('dsw:selected-student');

/** The assessment attempt a student is sitting. */
export const selectAttempt = (attemptId: string) => remember('dsw:attempt', attemptId);
export const selectedAttempt = () => recall('dsw:attempt');

/** The template being edited ("new" for a new one). */
export const selectTemplate = (templateId: string) => remember('dsw:template', templateId);
export const selectedTemplate = () => recall('dsw:template');

/** A released result the student chose to view. */
export const selectResult = (attemptId: string) => remember('dsw:result', attemptId);
export const selectedResult = () => recall('dsw:result');
