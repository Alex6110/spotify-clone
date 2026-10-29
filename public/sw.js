/* Service worker di Musica.
 * - guscio dell'app (HTML, icone) e file /assets/* (con hash nel nome): disponibili anche senza rete
 * - copertine e foto artista: cache al primo uso
 * - API di sola lettura (libreria, playlist): rete per prima, ultima copia se sei offline
 * - audio: se il brano è stato scaricato lo serve da qui (con supporto Range, indispensabile per <audio> e per lo scorrimento),
 *   altrimenti passa in rete come sempre. I brani vengono salvati dalla pagina (src/lib/offline.js).
 * Il nome della cache audio NON cambia con le versioni: aggiornare l'app non deve cancellare i download.
 */
const VERSION = 'v2';
const SHELL_CACHE = `musica-shell-${VERSION}`;
const ASSETS_CACHE = 'musica-assets';
const API_CACHE = 'musica-api';
const AUDIO_CACHE = 'musica-audio';
const SHELL_FILES = ['/', '/manifest.webmanifest', '/favicon.svg', '/cover-placeholder.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // un file mancante (404) non deve impedire di salvare gli altri: addAll fallirebbe in blocco
      .then((cache) => Promise.allSettled(SHELL_FILES.map((f) => cache.add(f))))
      .catch(() => { /* senza rete l'installazione riprova al prossimo avvio */ })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('musica-shell-') && n !== SHELL_CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// La pagina chiede di svuotare i dati dell'utente (logout): le copie delle API non devono restare per il prossimo account.
// I brani scaricati restano: sono file della libreria, non dati personali.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'clear-user-data') event.waitUntil(caches.delete(API_CACHE));
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
});

const isCacheableApi = (path) => /^\/api\/(library|playlists|me)(\/|$)/.test(path) && !path.startsWith('/api/library/search');

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (path.startsWith('/api/stream/')) {
    if (url.searchParams.has('download')) return; // scaricamento del file: sempre dalla rete
    event.respondWith(handleAudio(request, url));
    return;
  }
  if (path.startsWith('/socket.io') || path.startsWith('/api/auth') || path.startsWith('/api/playback')) return;
  if (isCacheableApi(path)) { event.respondWith(networkFirst(request, API_CACHE)); return; }
  if (path.startsWith('/api/')) return;

  if (request.mode === 'navigate') { event.respondWith(handleNavigation(request)); return; }
  if (path.startsWith('/assets/') || path.startsWith('/covers/') || path.startsWith('/artist-photos/')) {
    event.respondWith(cacheFirst(request, ASSETS_CACHE));
    return;
  }
  if (SHELL_FILES.includes(path)) event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});

// ---------- Strategie ----------
async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put('/', res.clone());
    return res;
  } catch {
    const cached = await cache.match('/');
    return cached || new Response('Sei offline e l\'app non è ancora stata salvata su questo dispositivo.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request).then((res) => { if (res.ok) cache.put(request, res.clone()); return res; }).catch(() => null);
  return cached || (await refresh) || Response.error();
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const key = request.url; // le intestazioni (token) non fanno parte della chiave
  const cached = await cache.match(key, { ignoreVary: true });
  try {
    const net = fetch(request);
    // con una rete lentissima e una copia già in cache, meglio la copia dopo qualche secondo
    const res = cached
      ? await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('lento')), 6000))])
      : await net;
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch {
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Sei offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

// ---------- Audio ----------
async function handleAudio(request, url) {
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(url.origin + url.pathname); // la chiave non contiene il token
  if (!cached) return fetch(request);
  return rangeResponse(request, cached);
}

async function rangeResponse(request, cached) {
  const blob = await cached.blob();
  const size = blob.size;
  const type = cached.headers.get('Content-Type') || 'audio/mpeg';
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  const header = request.headers.get('Range');
  const m = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) {
    return new Response(blob, { status: 200, headers: { ...base, 'Content-Length': String(size) } });
  }
  let start; let end;
  if (m[1] === '') { // "ultimi N byte"
    const n = Number(m[2]);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1, type), {
    status: 206,
    headers: { ...base, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
  });
}
