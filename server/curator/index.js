/**
 * Strumento di controllo della libreria ("curator"). Si apre sul Mac, non fa parte dell'app e non ha bisogno di login:
 * ascolta solo su 127.0.0.1. Legge e (su tua richiesta) corregge foto e copertine nel database dell'app.
 *   npm run curator          poi apri http://localhost:5055
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Store, readEnv } = require('./lib/store');
const { Deezer, downloadImage } = require('./lib/deezer');
const { Analyzer } = require('./lib/analyze');
const images = require('./lib/images');
const files = require('./lib/files');

const PORT = Number(process.env.CURATOR_PORT) || 5055;
const PUBLIC = path.join(__dirname, 'public');

let store;
try { store = new Store(); } catch (e) { console.error(`\n[curator] ${e.message}\n`); process.exit(1); }
const dz = new Deezer({ base: process.env.DEEZER_BASE || 'https://api.deezer.com', cacheFile: path.join(store.paths.dataDir, 'curator-cache.json') });
const an = new Analyzer(store, dz);

// scansione delle cartelle (aggiorna il database dopo che hai aggiunto/spostato file)
const scan = { running: false, lines: [], code: null };
function runScan() {
  Object.assign(scan, { running: true, lines: [], code: null });
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'scan.js')], { cwd: path.join(__dirname, '..'), env: process.env });
  const feed = (d) => { for (const l of String(d).split(/\r?\n/)) if (l.trim()) scan.lines.push(l); scan.lines = scan.lines.slice(-40); };
  child.stdout.on('data', feed); child.stderr.on('data', feed);
  child.on('close', (c) => { scan.running = false; scan.code = c; summaryCache = null; });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

// ---- sincronizzazione in background (scarica le discografie di tutti gli artisti) ----
const job = { running: false, stop: false, phase: '', done: 0, total: 0, current: '', error: null, startedAt: 0, requests: 0 };
async function runSync(covers) {
  Object.assign(job, { running: true, stop: false, phase: covers ? 'Discografie e copertine' : 'Discografie', done: 0, total: 0, current: '', error: null, startedAt: Date.now() });
  try {
    await an.all({
      network: true, covers,
      shouldStop: () => job.stop,
      onProgress: (i, n, name) => { job.done = i; job.total = n; job.current = name; },
    });
  } catch (e) { job.error = e.message; console.error('[curator] sync:', e); }
  dz.flush();
  job.running = false;
  job.requests = dz.requests;
  summaryCache = null;
}

// Riepilogo di tutti gli artisti basato solo sulla cache (istantaneo): serve alle pagine "Mancanti", "Durate", "Copertine".
let summaryCache = null;
async function summary(thr = 8) {
  if (!summaryCache || summaryCache.thr !== thr || Date.now() - summaryCache.at > 30000) {
    summaryCache = { at: Date.now(), thr, data: await an.all({ network: false, thr }) };
  }
  return summaryCache.data;
}

// ---- utilità HTTP ----
const send = (res, status, body, headers = {}) => {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'content-type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
};
const readBody = (req, limit = 25 * 1024 * 1024) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('File troppo grande')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
const readJson = async (req) => { const b = await readBody(req, 1024 * 1024); return b.length ? JSON.parse(b.toString('utf8')) : {}; };

function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Non trovato');
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}
const safeJoin = (root, rel) => { const f = path.normalize(path.join(root, rel)); return f.startsWith(root + path.sep) ? f : null; };

// ---- scrittura di foto e copertine ----
async function applyAlbumCover(albumId, buf) {
  const row = store.get('SELECT id FROM Album WHERE id = ?', albumId);
  if (!row) throw new Error('Album inesistente');
  fs.mkdirSync(store.paths.coversDir, { recursive: true });
  store.backup();
  await images.saveJpeg(buf, path.join(store.paths.coversDir, `${albumId}.jpg`));
  const value = `/covers/${albumId}.jpg?v=${Date.now().toString(36)}`;
  store.setAlbumCover(albumId, value);
  store.patchAlbum(albumId, { coverLocked: true }); // la scansione non la sostituirà
  summaryCache = null;
  return value;
}
async function applyArtistPhoto(artistId, buf) {
  if (!store.artist(artistId)) throw new Error('Artista inesistente');
  fs.mkdirSync(store.paths.photosDir, { recursive: true });
  store.backup();
  await images.saveJpeg(buf, path.join(store.paths.photosDir, `${artistId}.jpg`));
  const value = `/artist-photos/${artistId}.jpg?v=${Date.now().toString(36)}`;
  store.setArtistPhoto(artistId, value);
  return value;
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);
  const m = (re) => re.exec(p);
  let x;

  // file statici
  if (req.method === 'GET' && p.startsWith('/covers/')) return serveFile(res, safeJoin(store.paths.coversDir, p.slice(8)) || '/nope');
  if (req.method === 'GET' && p.startsWith('/artist-photos/')) return serveFile(res, safeJoin(store.paths.photosDir, p.slice(15)) || '/nope');
  if (req.method === 'GET' && !p.startsWith('/api/')) return serveFile(res, safeJoin(PUBLIC, p === '/' ? 'index.html' : p.slice(1)) || '/nope');

  // panoramica e stato
  if (req.method === 'GET' && p === '/api/overview') {
    return send(res, 200, { ...store.overview(), sharp: images.hasSharp(), db: store.paths.dbFile, cacheEntries: Object.keys(dz.cache).length, requests: dz.requests });
  }
  if (req.method === 'GET' && p === '/api/artists') {
    const sum = await summary();
    const info = new Map(sum.map((s) => [s.artist.id, s]));
    return send(res, 200, store.artists().map((a) => {
      const s = info.get(a.id); const st = store.artistState(a.id);
      return { ...a, confirmed: !!st.confirmed, ref: st.ref || s?.ref?.id || null, refName: s?.ref?.info?.name || st.refName || null, checked: !!s?.cached, missing: s?.stats.missingAlbums ?? null, zeros: s?.stats.zeros ?? 0, durationIssues: s?.stats.durationIssues ?? 0 };
    }));
  }
  if (req.method === 'GET' && (x = m(/^\/api\/artist\/(\d+)$/))) {
    const r = await an.artist(Number(x[1]), { network: true, covers: true, thr: Number(url.searchParams.get('thr')) || 8 });
    return r ? send(res, 200, r) : send(res, 404, { error: 'Artista inesistente' });
  }
  if (req.method === 'POST' && (x = m(/^\/api\/artist\/(\d+)\/state$/))) {
    const b = await readJson(req); const patch = {};
    if ('confirmed' in b) patch.confirmed = !!b.confirmed;
    if ('ref' in b) { patch.ref = b.ref ? Number(b.ref) : null; patch.refName = b.refName || null; }
    store.patchArtist(Number(x[1]), patch); summaryCache = null;
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && (x = m(/^\/api\/artist\/(\d+)\/photo$/))) {
    const b = await readJson(req);
    const buf = await downloadImage(String(b.url || ''));
    if (!buf) return send(res, 400, { error: 'Immagine non scaricabile' });
    return send(res, 200, { photo: await applyArtistPhoto(Number(x[1]), buf) });
  }
  if (req.method === 'PUT' && (x = m(/^\/api\/artist\/(\d+)\/photo$/))) {
    return send(res, 200, { photo: await applyArtistPhoto(Number(x[1]), await readBody(req)) });
  }
  if (req.method === 'DELETE' && (x = m(/^\/api\/artist\/(\d+)\/photo$/))) {
    store.setArtistPhoto(Number(x[1]), null);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && (x = m(/^\/api\/album\/(\d+)\/cover$/))) {
    const b = await readJson(req);
    const buf = await downloadImage(String(b.url || ''));
    if (!buf) return send(res, 400, { error: 'Immagine non scaricabile' });
    return send(res, 200, { cover: await applyAlbumCover(Number(x[1]), buf) });
  }
  if (req.method === 'PUT' && (x = m(/^\/api\/album\/(\d+)\/cover$/))) {
    return send(res, 200, { cover: await applyAlbumCover(Number(x[1]), await readBody(req)) });
  }
  if (req.method === 'POST' && (x = m(/^\/api\/album\/(\d+)\/state$/))) {
    const b = await readJson(req); const patch = {};
    if ('ref' in b) patch.ref = b.ref == null ? null : Number(b.ref); // -1 = "nessun album corrisponde"
    if ('confirmed' in b) patch.confirmed = !!b.confirmed;
    store.patchAlbum(Number(x[1]), patch); summaryCache = null;
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && p === '/api/ignore') {
    const b = await readJson(req);
    store.setIgnored(Number(b.artistId), String(b.refAlbumId), !!b.on); summaryCache = null;
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && (x = m(/^\/api\/album\/(\d+)\/tracks$/))) return send(res, 200, store.tracksOfAlbum(Number(x[1])));

  // modifica dei brani (file sul disco + database)
  if (req.method === 'GET' && p === '/api/tracks') {
    const q = (url.searchParams.get('q') || '').trim();
    return send(res, 200, q.length >= 2 ? store.searchTracks(q, Number(url.searchParams.get('artist'))) : []);
  }
  if (req.method === 'POST' && (x = m(/^\/api\/track\/(\d+)\/move$/))) {
    const b = await readJson(req);
    const r = files.moveTrack(store, Number(x[1]), b.albumId ? { albumId: Number(b.albumId) } : { title: b.title, artistId: b.artistId });
    summaryCache = null;
    return send(res, 200, r);
  }
  if (req.method === 'POST' && (x = m(/^\/api\/track\/(\d+)\/remove$/))) {
    const r = files.removeTrack(store, Number(x[1])); summaryCache = null;
    return send(res, 200, r);
  }
  if (req.method === 'POST' && (x = m(/^\/api\/track\/(\d+)\/artist$/))) {
    const b = await readJson(req);
    return send(res, 200, files.setTrackArtist(store, Number(x[1]), b.name));
  }

  if (req.method === 'GET' && p === '/api/rescan') return send(res, 200, scan);
  if (req.method === 'POST' && p === '/api/rescan') { if (scan.running) return send(res, 409, { error: 'Scansione già in corso' }); runScan(); return send(res, 202, { ok: true }); }

  // pagine riassuntive
  if (req.method === 'GET' && p === '/api/zero') {
    const rows = store.zeroTracks();
    return send(res, 200, rows);
  }
  if (req.method === 'GET' && p === '/api/missing') {
    const sum = await summary();
    const types = (url.searchParams.get('types') || 'album,ep').split(',');
    const rows = [];
    for (const s of sum) {
      const list = s.missing.filter((r) => types.includes(r.type));
      if (list.length) rows.push({ artistId: s.artist.id, artist: s.artist.name, refName: s.ref?.info?.name || null, albums: s.albums.length, missing: list });
    }
    return send(res, 200, { artistsChecked: sum.filter((s) => s.cached).length, artistsTotal: sum.length, rows });
  }
  if (req.method === 'GET' && p === '/api/durations') {
    const thr = Number(url.searchParams.get('thr')) || 8;
    const sum = await summary(thr);
    const rows = [];
    for (const s of sum) for (const a of s.albums) {
      const bad = (a.tracks?.pairs || []).filter((t) => t.bad);
      if (bad.length) rows.push({ artistId: s.artist.id, artist: s.artist.name, albumId: a.id, album: a.title, refTitle: a.ref.title, tracks: bad });
    }
    return send(res, 200, { rows });
  }
  if (req.method === 'GET' && p === '/api/covers') {
    const sum = await summary();
    const rows = [];
    for (const s of sum) for (const a of s.albums) {
      if (!a.ref) continue;
      rows.push({ artistId: s.artist.id, artist: s.artist.name, albumId: a.id, album: a.title, cover: a.cover, refTitle: a.ref.title, refThumb: a.ref.thumb, refCover: a.ref.cover, dist: a.coverDist, confirmed: !!a.state.confirmed });
    }
    return send(res, 200, { sharp: images.hasSharp(), rows });
  }

  // sincronizzazione
  if (req.method === 'GET' && p === '/api/sync') return send(res, 200, { ...job, requests: dz.requests });
  if (req.method === 'POST' && p === '/api/sync') {
    if (job.running) return send(res, 409, { error: 'Già in corso' });
    const b = await readJson(req);
    runSync(!!b.covers);
    return send(res, 202, { ok: true });
  }
  if (req.method === 'POST' && p === '/api/sync/stop') { job.stop = true; return send(res, 200, { ok: true }); }

  return send(res, 404, { error: 'Non trovato' });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((e) => { console.error('[curator]', req.method, req.url, e); if (!res.headersSent) send(res, 500, { error: e.message }); else res.end(); });
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[curator] database: ${store.paths.dbFile}`);
  console.log(`[curator] pronto: apri http://localhost:${PORT}`);
  if (!images.hasSharp()) console.log('[curator] attenzione: "sharp" non trovato, il confronto automatico delle copertine non sarà disponibile (esegui npm install).');
});
process.on('SIGINT', () => { dz.flush(); process.exit(0); });
