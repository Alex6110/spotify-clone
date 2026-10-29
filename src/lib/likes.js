import { useSyncExternalStore } from 'react';
import { api } from './api';

// Stato "mi piace" condiviso: se cambi un cuore in una lista, si aggiorna ovunque (player, coda, album).
const overrides = new Map();
const listeners = new Set();
const emitChange = () => listeners.forEach((l) => l());
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export function useLiked(track) {
  const override = useSyncExternalStore(subscribe, () => (track ? overrides.get(track.id) : undefined));
  return override ?? track?.liked ?? false;
}

export async function toggleLike(track, currentlyLiked) {
  const next = !currentlyLiked;
  overrides.set(track.id, next);
  emitChange();
  try {
    if (next) await api.put(`/api/library/likes/${track.id}`);
    else await api.delete(`/api/library/likes/${track.id}`);
  } catch {
    overrides.set(track.id, currentlyLiked); // annulla se il server non risponde
    emitChange();
  }
}

export const clearLikeOverrides = () => { overrides.clear(); emitChange(); };
