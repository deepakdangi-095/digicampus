import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, loadStored, persistToken, setToken, setUnauthorizedHandler } from './api';
import { User } from './types';

interface AuthCtx { user: User | null; booting: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void> }
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  const logout = useCallback(async () => {
    setToken(null);
    await persistToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { void logout(); });
    (async () => {
      try {
        const { token } = await loadStored();
        if (token) setUser((await api<{ user: User }>('/auth/me')).user); // validates the stored session
      } catch { await logout(); }
      finally { setBooting(false); }
    })();
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { email: email.trim(), password } });
    setToken(r.token);
    await persistToken(r.token);
    setUser(r.user);
  }, []);

  const value = useMemo(() => ({ user, booting, login, logout }), [user, booting, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
