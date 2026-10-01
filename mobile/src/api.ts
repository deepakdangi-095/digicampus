import * as SecureStore from 'expo-secure-store';
import { DEFAULT_API_URL } from './config';

let baseUrl = DEFAULT_API_URL;
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const getBaseUrl = () => baseUrl;
export const setToken = (t: string | null) => { token = t; };
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };
export const fileUrl = (p: string) => (/^https?:\/\//.test(p) ? p : `${baseUrl}${p}`);

export async function setBaseUrl(url: string) {
  baseUrl = url.trim().replace(/\/+$/, '') || DEFAULT_API_URL;
  await SecureStore.setItemAsync('dc_server', baseUrl);
}
export async function loadStored(): Promise<{ token: string | null }> {
  const [server, t] = await Promise.all([SecureStore.getItemAsync('dc_server'), SecureStore.getItemAsync('dc_token')]);
  if (server) baseUrl = server;
  token = t;
  return { token: t };
}
export const persistToken = (t: string | null) => (t ? SecureStore.setItemAsync('dc_token', t) : SecureStore.deleteItemAsync('dc_token'));

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

interface Opts { method?: string; body?: unknown; form?: FormData; timeoutMs?: number }

export async function api<T>(path: string, { method = 'GET', body, form, timeoutMs = 45000 }: Opts = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs); // AI answers can take a few seconds; never hang forever
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(0, `Can't reach the server at ${baseUrl}. Check your connection or the server address.`);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(res.status, data?.error?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}
