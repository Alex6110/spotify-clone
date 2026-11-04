// Cronologia delle ricerche: salvata su questo dispositivo, separata per ogni utente.
// Contiene sia ricerche testuali ({ type: 'query' }) sia i risultati toccati (brano, album, artista) come in Spotify.
const MAX = 20;
const key = (userId) => `musica_search_history_${userId ?? 'ospite'}`;

const idOf = (e) => (e.type === 'query' ? `query:${e.title.toLowerCase()}` : `${e.type}:${e.id}`);

// le versioni precedenti salvavano solo stringhe
const normalize = (x) => {
  if (typeof x === 'string') return x.trim() ? { type: 'query', title: x.trim() } : null;
  if (x && typeof x === 'object' && typeof x.title === 'string' && ['query', 'track', 'album', 'artist'].includes(x.type)) return x;
  return null;
};

export const readHistory = (userId) => {
  try {
    const list = JSON.parse(localStorage.getItem(key(userId)) || '[]');
    return Array.isArray(list) ? list.map(normalize).filter(Boolean) : [];
  } catch { return []; }
};

const write = (userId, list) => {
  const out = list.slice(0, MAX);
  try { localStorage.setItem(key(userId), JSON.stringify(out)); } catch { /* spazio finito o modalità privata */ }
  return out;
};

/** Aggiunge in cima (senza doppioni). Restituisce la lista aggiornata. */
export const addHistory = (userId, entry) => {
  const e = typeof entry === 'string' ? normalize(entry) : normalize(entry);
  if (!e || (e.type === 'query' && e.title.length < 2)) return readHistory(userId);
  return write(userId, [e, ...readHistory(userId).filter((x) => idOf(x) !== idOf(e))]);
};

export const removeHistory = (userId, entry) => write(userId, readHistory(userId).filter((x) => idOf(x) !== idOf(entry)));
export const clearHistory = (userId) => write(userId, []);
export const historyKey = idOf;
