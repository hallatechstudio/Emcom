'use client';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@emcom/api-client';
import type { UserDto } from '@emcom/shared-types';
import { onSessionChange, refreshSession, setAccessToken } from './api';

interface SessionState {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: UserDto | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [status, setStatus] = useState<SessionState['status']>('loading');
  const qc = useQueryClient();

  useEffect(() => {
    onSessionChange((u) => {
      setUser(u);
      setStatus(u ? 'authenticated' : 'anonymous');
    });
    refreshSession()
      .then((s) => {
        setUser(s?.user ?? null);
        setStatus(s ? 'authenticated' : 'anonymous');
      })
      .catch(() => setStatus('anonymous'));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/session/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = body?.error ?? {};
      throw new ApiError(res.status, e.code ?? 'LOGIN_FAILED', e.message ?? 'Sign-in failed');
    }
    setAccessToken(body.accessToken);
    setUser(body.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/session/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    qc.clear();
    setUser(null);
    setStatus('anonymous');
  }, [qc]);

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
