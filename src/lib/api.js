import axios from 'axios';

// In sviluppo le chiamate passano dal proxy di Vite (stessa origine) e BASE è vuota.
// In produzione, se il frontend è servito da un'altra origine, imposta VITE_API_URL (es. https://musica.mio-server.ts.net).
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const AUTH_KEY = 'auth';

export const apiBase = BASE;
export const PLACEHOLDER_COVER = '/cover-placeholder.svg';

export function readAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
}
export function writeAuth(value) {
  try {
    if (value) localStorage.setItem(AUTH_KEY, JSON.stringify(value));
    else localStorage.removeItem(AUTH_KEY);
  } catch { /* storage non disponibile: la sessione resta solo in memoria */ }
}

export const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  const auth = readAuth();
  if (auth?.token) config.headers.Authorization = `Bearer ${auth.token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    if (err.response?.status === 401 && readAuth()?.token && !url.includes('/api/auth/login')) {
      window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(err);
  },
);

export const assetUrl = (path) => (path ? (/^https?:/.test(path) ? path : BASE + path) : null);
export const coverOf = (item) => assetUrl(item?.cover) || PLACEHOLDER_COVER;
export const photoOf = (artist) => assetUrl(artist?.photo) || assetUrl(artist?.cover) || PLACEHOLDER_COVER;

/** URL di streaming di un brano. Il token è in query perché <audio> non può inviare header. */
export function streamUrl(track, { download = false } = {}) {
  const token = readAuth()?.token || '';
  return `${BASE}/api/stream/${track.id}?t=${encodeURIComponent(token)}${download ? '&download=1' : ''}`;
}

/** Archivio ZIP di un album o di una playlist (kind: 'album' | 'playlist'). Il token è in query: serve a un normale link di download. */
export function downloadUrl(kind, id) {
  const token = readAuth()?.token || '';
  return `${BASE}/api/download/${kind}/${id}?t=${encodeURIComponent(token)}`;
}

export const errorMessage = (err, fallback = 'Qualcosa è andato storto') =>
  err?.response?.data?.error || (err?.request && !err?.response ? 'Server non raggiungibile' : fallback);

export const formatDuration = (ms) => {
  const total = Math.round((ms || 0) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
