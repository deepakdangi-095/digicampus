export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type Role = 'STUDENT' | 'PARENT' | 'FACULTY' | 'HOD' | 'DEAN' | 'ADMIN';
export interface SessionUser { id: string; name: string; email: string; role: Role; branch: string | null }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const KEY = 'dc_session';
export function getSession(): { token: string; user: SessionUser } | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}
export const setSession = (s: { token: string; user: SessionUser }) => localStorage.setItem(KEY, JSON.stringify(s));
export const clearSession = () => localStorage.removeItem(KEY);

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const session = getSession();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: init.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, `Cannot reach the server at ${API_URL}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && session) { clearSession(); window.location.href = '/login'; }
    throw new ApiError(res.status, data?.error?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/** Authenticated file download (the token can't ride on a plain <a href>). */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const session = getSession();
  const res = await fetch(`${API_URL}/api${path}`, { headers: session ? { Authorization: `Bearer ${session.token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
