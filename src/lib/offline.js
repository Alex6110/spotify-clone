import { useSyncExternalStore } from 'react';
import { coverOf, streamUrl } from './api';

// Brani salvati sul dispositivo.
// L'audio sta nella cache "musica-audio" (la stessa che il service worker legge, vedi public/sw.js), con chiave
// <origine>/api/stream/<id> senza token. Accanto a ogni brano salvo un piccolo JSON con i suoi dati
// (<origine>/offline/meta/<id>) così l'elenco "Scaricati" funziona anche senza rete.

const AUDIO_CACHE = 'musica-audio';
const audioKey = (id) => `${location.origin}/api/stream/${id}`;
const metaKey = (id) => `${location.origin}/offline/meta/${id}`;
const META_PREFIX = `${location.origin}/offline/meta/`;

export const isOfflineSupported = () => typeof caches !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext;

// ---- Stato condiviso (insieme degli id scaricati) ----
let ids = new Set();
let version = 0;
let loaded = false;
const listeners = new Set();
const emit = () => { version += 1; listeners.forEach((l) => l()); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export async function refreshOffline() {
  if (!isOfflineSupported()) return;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const keys = await cache.keys();
    ids = new Set(keys.map((r) => r.url).filter((u) => u.startsWith(META_PREFIX)).map((u) => Number(u.slice(META_PREFIX.length))));
    loaded = true;
    emit();
  } catch { /* la cache non è disponibile (finestra privata, ecc.) */ }
}

/** Insieme degli id salvati; si aggiorna da solo. */
export function useOfflineIds() {
  useSyncExternalStore(subscribe, () => version);
  if (!loaded) refreshOffline();
  return ids;
}

// ---- Operazioni ----
export async function saveTrack(track, signal) {
  const cache = await caches.open(AUDIO_CACHE);
  if (await cache.match(metaKey(track.id))) return; // già salvato
  const res = await fetch(streamUrl(track), { signal });
  if (!res.ok || res.status !== 200) throw new Error('Download non riuscito');
  const audio = await res.blob();
  if (!audio.size) throw new Error('File vuoto');
  await cache.put(audioKey(track.id), new Response(audio, { headers: { 'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg' } }));
  const meta = { ...track, liked: undefined, savedAt: Date.now(), size: audio.size };
  // la copertina passa dal service worker, che la tiene in cache
  fetch(coverOf(track)).catch(() => {});
  // il meta va scritto per ultimo: un brano senza meta è considerato non salvato
  await cache.put(metaKey(track.id), new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
  ids = new Set(ids).add(track.id);
  emit();
}

export async function removeTrack(trackId) {
  const cache = await caches.open(AUDIO_CACHE);
  await cache.delete(metaKey(trackId));
  await cache.delete(audioKey(trackId));
  const next = new Set(ids); next.delete(trackId); ids = next;
  emit();
}

/** Salva più brani uno alla volta. `onProgress(fatti, totale)`; con `signal` si può interrompere. */
export async function saveTracks(tracks, { onProgress, signal } = {}) {
  let done = 0;
  let failed = 0;
  for (const t of tracks) {
    if (signal?.aborted) break;
    try { await saveTrack(t, signal); } catch (e) { if (e?.name === 'AbortError') break; failed += 1; }
    done += 1;
    onProgress?.(done, tracks.length);
  }
  return { done, failed };
}

export async function removeTracks(tracks) {
  for (const t of tracks) await removeTrack(t.id);
}

export async function removeAllOffline() {
  const cache = await caches.open(AUDIO_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.map((r) => cache.delete(r)));
  ids = new Set();
  emit();
}

/** Elenco dei brani salvati con i loro dati (per la pagina "Scaricati"). */
export async function listOffline() {
  const cache = await caches.open(AUDIO_CACHE);
  const keys = (await cache.keys()).filter((r) => r.url.startsWith(META_PREFIX));
  const metas = await Promise.all(keys.map(async (r) => { try { return await (await cache.match(r)).json(); } catch { return null; } }));
  return metas.filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

// ---- Spazio ----
export async function storageInfo() {
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    return { usage: est?.usage ?? null, quota: est?.quota ?? null, persisted: !!persisted };
  } catch { return { usage: null, quota: null, persisted: false }; }
}

/** Chiede al browser di non cancellare i download quando lo spazio scarseggia (utile soprattutto su iPhone e Android). */
export async function requestPersistence() {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

export const formatBytes = (n) => {
  if (n == null) return '—';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 1024 ** 2 * 100 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
};
