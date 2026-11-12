import { useEffect, useState } from 'react';

// Talks to the API server in server/ (MongoDB + Hyperledger Fabric).
//
// Every screen keeps its original mock data as a fallback. If the API isn't
// running (for example in the Figma Make preview, which is static hosting),
// the screen shows the mock data with a "Demo data" badge instead of breaking.

/** Login isn't built yet, so student screens show this student (Jordan Smith in the seed data). */
export const DEMO_STUDENT_WALLET = 'DSW-2024-JS-1147';

/** Empty means "same server as the app" (Vite proxies /api to the API in development). */
const API_BASE: string = import.meta.env.VITE_API_URL ?? '';
const TIMEOUT_MS = 8000;

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

/** GET /api/<path>. Never throws: says whether it got data, couldn't reach the API, or got an error. */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE}/api${path}`, { signal, headers: { Accept: 'application/json' } });
    // No JSON means it wasn't our API answering (e.g. a static host returning index.html).
    if (!response.headers.get('content-type')?.includes('application/json')) {
      return { kind: 'offline', reason: 'The API server is not running' };
    }
    const body = await response.json();
    if (response.ok) return { kind: 'ok', data: body as T };
    if (response.status === 503) return { kind: 'offline', reason: body.message ?? 'The database is not reachable' };
    return { kind: 'error', error: { status: response.status, code: body.error ?? 'error', message: body.message ?? 'Request failed' } };
  } catch {
    return { kind: 'offline', reason: 'The API server is not reachable' };
  }
}

/** Send a JSON body to /api/<path>. Never throws, same result shape as apiGet. */
export async function apiSend<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}/api${path}`, {
      method,
      signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      return { kind: 'offline', reason: 'The API server is not running' };
    }
    const data = await response.json();
    if (response.ok) return { kind: 'ok', data: data as T };
    if (response.status === 503) return { kind: 'offline', reason: data.message ?? 'The database is not reachable' };
    return { kind: 'error', error: { status: response.status, code: data.error ?? 'error', message: data.message ?? 'Request failed' } };
  } catch {
    return { kind: 'offline', reason: 'The API server is not reachable' };
  } finally {
    clearTimeout(timer);
  }
}

export const apiPost = <T>(path: string, body: unknown) => apiSend<T>('POST', path, body);
export const apiPut = <T>(path: string, body: unknown) => apiSend<T>('PUT', path, body);

// Requests still running, by path. Identical requests share one fetch, so a
// screen mounting twice (React's StrictMode does this in development) doesn't
// call the API twice, or write two audit-log entries for one view.
const inflight = new Map<string, Promise<ApiResult<unknown>>>();

/** Like apiGet, with a timeout, and shared between callers asking for the same path at once. */
export function apiGetShared<T>(path: string): Promise<ApiResult<T>> {
  let request = inflight.get(path);
  if (!request) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    request = apiGet<unknown>(path, controller.signal).finally(() => {
      clearTimeout(timer);
      inflight.delete(path);
    });
    inflight.set(path, request);
  }
  return request as Promise<ApiResult<T>>;
}

export interface ApiData<T> {
  data: T;
  source: DataSource;
  /** Set when the API answered with an error (e.g. 403 consent required). `data` is then the fallback. */
  error: ApiError | null;
  /** Why the screen is showing demo data, when it is. */
  offlineReason: string | null;
  reload: () => void;
}

/**
 * Loads live data for a screen, falling back to `fallback` (the screen's mock
 * data) while loading and whenever the API can't be reached. Pass `null` as the
 * path to skip loading.
 */
export function useApiData<T>(path: string | null, fallback: T): ApiData<T> {
  const [state, setState] = useState<Omit<ApiData<T>, 'reload'>>({
    data: fallback,
    source: path ? 'loading' : 'demo',
    error: null,
    offlineReason: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setState((s) => ({ ...s, source: s.source === 'live' ? 'live' : 'loading' }));
    apiGetShared<T>(path).then((result) => {
      if (cancelled) return;
      if (result.kind === 'ok') setState({ data: result.data, source: 'live', error: null, offlineReason: null });
      else if (result.kind === 'offline') setState({ data: fallback, source: 'demo', error: null, offlineReason: result.reason });
      else setState({ data: fallback, source: 'live', error: result.error, offlineReason: null });
    });
    return () => {
      cancelled = true; // ignore the answer; the shared request finishes for anyone else waiting
    };
    // `fallback` is the screen's constant mock data; only the path (and reloads) should refetch.
  }, [path, attempt]);

  return { ...state, reload: () => setAttempt((n) => n + 1) };
}

// The student a teacher drilled into from Class Results (kept for this browser tab).
const SELECTED_STUDENT_KEY = 'dsw:selected-student';

export function selectStudent(walletId: string) {
  try {
    sessionStorage.setItem(SELECTED_STUDENT_KEY, walletId);
  } catch {
    // storage unavailable (e.g. private mode): fall back to the demo student
  }
}

export function selectedStudent(): string {
  try {
    const walletId = sessionStorage.getItem(SELECTED_STUDENT_KEY);
    if (walletId?.startsWith('DSW-')) return walletId;
  } catch {
    // ignore
  }
  return DEMO_STUDENT_WALLET;
}
