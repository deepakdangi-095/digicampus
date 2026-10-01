import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errMsg } from './api';

/** GET a path (or skip with null) and expose loading / error / reload. Ignores responses that arrive after unmount. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(path !== null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const reload = useCallback(async () => {
    if (path === null) { setData(null); setLoading(false); return; }
    setLoading(true); setError('');
    try { const d = await api<T>(path); if (alive.current) setData(d); }
    catch (e) { if (alive.current) setError(errMsg(e)); }
    finally { if (alive.current) setLoading(false); }
  }, [path]);

  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
