import { clearCachedUserData } from '../lib/pwa';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, readAuth, writeAuth } from '../lib/api';

const AuthContext = createContext(null);
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

// Chiavi delle vecchie versioni: condivise tra utenti e non più usate.
const LEGACY_KEYS = ['token', 'user', 'userThemePrefs', 'last_song', 'last_queue', 'last_time'];
const clearLegacy = () => { try { LEGACY_KEYS.forEach((k) => localStorage.removeItem(k)); } catch { /* niente da fare */ } };

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => { clearLegacy(); return readAuth(); });

  const persist = useCallback((next) => { writeAuth(next); setAuth(next); }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password });
    persist({ token: data.token, user: data.user });
    return data.user;
  }, [persist]);

  const register = useCallback(async (form) => {
    const { data } = await api.post('/api/auth/register', form);
    persist({ token: data.token, user: data.user });
    return data.user;
  }, [persist]);

  const logout = useCallback(() => { clearCachedUserData(); persist(null); }, [persist]);

  const updateUser = useCallback((patch) => {
    setAuth((prev) => {
      if (!prev) return prev;
      const next = { ...prev, user: { ...prev.user, ...patch } };
      writeAuth(next);
      return next;
    });
  }, []);

  // Token scaduto o revocato: l'interceptor di axios lo segnala e si torna al login.
  useEffect(() => {
    window.addEventListener('auth:expired', logout);
    return () => window.removeEventListener('auth:expired', logout);
  }, [logout]);

  // Rinnovo del token all'avvio e ogni 12 ore, così la sessione non scade a metà ascolto.
  const hasSession = !!auth?.token;
  useEffect(() => {
    if (!hasSession) return undefined;
    const refresh = () => api.post('/api/auth/refresh')
      .then(({ data }) => persist({ token: data.token, user: data.user }))
      .catch(() => { /* gli errori 401 sono già gestiti dall'interceptor */ });
    refresh();
    const id = setInterval(refresh, 12 * 3600 * 1000);
    return () => clearInterval(id);
  }, [hasSession, persist]);

  const value = useMemo(() => ({
    user: auth?.user ?? null,
    token: auth?.token ?? null,
    isAuthenticated: !!auth?.token,
    login, register, logout, updateUser,
  }), [auth, login, register, logout, updateUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
