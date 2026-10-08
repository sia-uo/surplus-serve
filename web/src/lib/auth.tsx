import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppConfig, MeResponse } from '../../../shared/types';
import { api } from './api';

interface AuthValue extends MeResponse {
  loading: boolean;
  error: string | null;
  config: AppConfig | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse>({ user: null, restaurant: null, ngo: null });
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([api.get<MeResponse>('/api/me'), config ? Promise.resolve(config) : api.get<AppConfig>('/api/config')]);
      setMe(m);
      setConfig(c);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => undefined);
    setMe({ user: null, restaurant: null, ngo: null });
  }, []);

  return <AuthContext.Provider value={{ ...me, loading, error, config, refresh, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function homeFor(role: string | null | undefined): string {
  if (role === 'restaurant') return '/restaurant';
  if (role === 'ngo') return '/ngo';
  if (role === 'admin') return '/admin';
  return '/onboarding';
}
