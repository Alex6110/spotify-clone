// Cronologia delle ricerche: salvata su questo dispositivo, separata per ogni utente.
const MAX = 12;
const key = (userId) => `musica_search_history_${userId ?? 'ospite'}`;

export const readHistory = (userId) => {
  try {
    const list = JSON.parse(localStorage.getItem(key(userId)) || '[]');
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : [];
  } catch { return []; }
};

const write = (userId, list) => {
  try { localStorage.setItem(key(userId), JSON.stringify(list.slice(0, MAX))); } catch { /* spazio finito o modalità privata */ }
  return list.slice(0, MAX);
};

/** Aggiunge in cima (senza doppioni, ignorando maiuscole). Restituisce la lista aggiornata. */
export const addHistory = (userId, query) => {
  const q = String(query || '').trim();
  if (q.length < 2) return readHistory(userId);
  const rest = readHistory(userId).filter((s) => s.toLowerCase() !== q.toLowerCase());
  return write(userId, [q, ...rest]);
};

export const removeHistory = (userId, query) => write(userId, readHistory(userId).filter((s) => s !== query));
export const clearHistory = (userId) => write(userId, []);
