import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import { PlayerContext } from './PlayerContext';

export const ThemeContext = createContext();

export const RADIUS_OPTIONS = {
  // css: forma delle copertine; container: raggio di pannelli e schede
  sharp: { label: 'Squadrato', css: '4px', container: '4px' },
  soft: { label: 'Morbido', css: '12px', container: '14px' },
  round: { label: 'Tondo', css: '50%', container: '24px' },
};
export const ACCENT_PRESETS = ['#1DB954', '#3D91FF', '#FF4747', '#F59E0B', '#A855F7', '#14B8A6', '#EC4899'];
const DEFAULTS = { accent: '#1DB954', radius: 'soft' };
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Accetta solo valori noti: anche un aggiornamento remoto non può inserire CSS arbitrario. */
const sanitize = (s) => ({
  ...(s && HEX.test(s.accent) ? { accent: s.accent } : {}),
  ...(s && RADIUS_OPTIONS[s.radius] ? { radius: s.radius } : {}),
});

export const ThemeProvider = ({ children }) => {
  const { user, updateUser } = useAuth();
  const player = useContext(PlayerContext);
  const broadcastUiUpdate = player?.broadcastUiUpdate;
  const remoteThemeUpdates = player?.remoteThemeUpdates;

  const [prefs, setPrefs] = useState({ ...DEFAULTS, ...sanitize(user?.settings) });
  const prefsRef = useRef(prefs);
  const saveTimer = useRef(null);

  // Al cambio di utente (login/logout) il tema parte da quello salvato nel suo account.
  const userId = user?.id ?? null;
  useEffect(() => {
    const next = { ...DEFAULTS, ...sanitize(user?.settings) };
    prefsRef.current = next;
    setPrefs(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Aggiornamento arrivato da un altro dispositivo dello stesso utente
  useEffect(() => {
    if (!remoteThemeUpdates) return;
    const next = { ...prefsRef.current, ...sanitize(remoteThemeUpdates) };
    prefsRef.current = next;
    setPrefs(next);
  }, [remoteThemeUpdates]);

  // Applicazione al documento: variabili CSS usate da tutta l'app
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', prefs.accent);
    root.style.setProperty('--primary-color', prefs.accent); // nome storico usato in vari CSS
    root.style.setProperty('--border-radius-cards', RADIUS_OPTIONS[prefs.radius].css);
    root.style.setProperty('--radius-container', RADIUS_OPTIONS[prefs.radius].container);
    root.dataset.radius = prefs.radius;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#000000');
  }, [prefs]);

  const updateTheme = useCallback((patch) => {
    const next = { ...prefsRef.current, ...sanitize(patch) };
    prefsRef.current = next;
    setPrefs(next);
    broadcastUiUpdate?.(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.patch('/api/me/settings', next)
        .then(({ data }) => updateUser({ settings: data.settings }))
        .catch((e) => console.error('Salvataggio tema non riuscito', e));
    }, 400);
  }, [broadcastUiUpdate, updateUser]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const value = useMemo(() => ({ themePrefs: prefs, updateTheme }), [prefs, updateTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
