const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const express = require('express');
const prisma = require('../db');
const config = require('../config');
const { requireAuth } = require('../auth');
const T = require('../lib/text');
const { summarizeTags, planDestination } = require('../lib/upload');
const { requestScan, getState } = require('../lib/scanRunner');

const router = express.Router();
router.use(requireAuth());
router.use((req, res, next) => {
  if (!config.allowUpload) return res.status(403).json({ error: 'Il caricamento di musica è disattivato su questo server' });
  if (!config.musicDir) return res.status(503).json({ error: 'MUSIC_DIR non configurata' });
  next();
});

// La cartella temporanea sta dentro la musica (nome che inizia con ".", ignorato dallo scanner): così lo spostamento
// finale è un semplice rename sullo stesso disco, anche se il database e i dati stanno altrove.
const incomingDir = () => path.join(config.musicDir, '.incoming');
let cleaned = false;
async function cleanStale() {
  if (cleaned) return;
  cleaned = true;
  try {
    for (const f of await fsp.readdir(incomingDir())) {
      const p = path.join(incomingDir(), f);
      const st = await fsp.stat(p);
      if (Date.now() - st.mtimeMs > 24 * 3600 * 1000) await fsp.unlink(p).catch(() => {});
    }
  } catch { /* la cartella non esiste ancora */ }
}

const db = {
  findArtistByKey: (key) => prisma.artist.findUnique({ where: { key }, select: { id: true, name: true } }),
  async findAlbumFolder(artistId, albumKey) {
    const album = await prisma.album.findUnique({ where: { artistId_key: { artistId, key: albumKey } }, select: { id: true } });
    if (!album) return null;
    const t = await prisma.track.findFirst({ where: { albumId: album.id }, select: { relPath: true } });
    if (!t) return null;
    const parts = t.relPath.split('/');
    // Artista/Album/(CD2/)file -> Artista/Album ; "Artista - Album"/file -> la stessa cartella
    return parts.slice(0, Math.min(2, parts.length - 1)).join('/') || null;
  },
};

class SizeLimit extends Transform {
  constructor(max) { super(); this.max = max; this.size = 0; }
  _transform(chunk, enc, cb) {
    this.size += chunk.length;
    if (this.size > this.max) return cb(Object.assign(new Error('File troppo grande'), { status: 413 }));
    cb(null, chunk);
  }
}

// Brani dello stesso album con artisti leggermente diversi nei tag ("Queen" / "Queen & David Bowie") e senza
// tag "artista dell'album" finirebbero in cartelle separate. Ricordo per un'ora l'artista scelto per ogni album
// appena caricato e lo riuso quando i nomi si contengono a vicenda.
const recentAlbums = new Map(); // chiave album -> { artist, at }
function recentArtistFor(albumName, artistName) {
  const rec = recentAlbums.get(T.normKey(albumName));
  if (!rec || Date.now() - rec.at > 3600 * 1000) return null;
  const a = T.normKey(rec.artist);
  const b = T.normKey(artistName);
  return a && b && (a === b || b.includes(a) || a.includes(b)) ? rec.artist : null;
}
function rememberAlbum(albumName, artist) {
  if (recentAlbums.size > 500) recentAlbums.clear();
  recentAlbums.set(T.normKey(albumName), { artist, at: Date.now() });
}

const q = (v) => (typeof v === 'string' ? v : '');

// Un file per richiesta, corpo = il file stesso (nessun multipart: più semplice, e il progresso si vede con XHR).
//   PUT /api/upload?name=<nome file>&dir=<cartelle di provenienza, opzionale>&artist=<opz.>&album=<opz.>
router.put('/', async (req, res) => {
  const name = path.basename(q(req.query.name).replace(/\\/g, '/'));
  if (!name || !T.isAudioFile(name)) return res.status(400).json({ error: 'Formato non supportato (accettati: mp3, flac, m4a, aac, ogg, opus, wav)' });
  const declared = Number(req.headers['content-length']);
  if (declared > config.maxUploadBytes) return res.status(413).json({ error: `File troppo grande (massimo ${Math.round(config.maxUploadBytes / 1048576)} MB)` });

  await cleanStale();
  await fsp.mkdir(incomingDir(), { recursive: true });
  const ext = path.extname(name).slice(1).toLowerCase();
  const tmp = path.join(incomingDir(), `${crypto.randomUUID()}.${ext}`);
  const cleanup = () => fsp.unlink(tmp).catch(() => {});

  try {
    await pipeline(req, new SizeLimit(config.maxUploadBytes), fs.createWriteStream(tmp, { flags: 'wx' }));
  } catch (e) {
    await cleanup();
    if (e.status === 413) return res.status(413).json({ error: `File troppo grande (massimo ${Math.round(config.maxUploadBytes / 1048576)} MB)` });
    return res.status(400).json({ error: 'Caricamento interrotto' });
  }

  try {
    // il file deve essere davvero audio: se i tag non si leggono, niente da fare
    const mm = await import('music-metadata');
    let md;
    try { md = await mm.parseFile(tmp, { skipCovers: true }); } catch { md = null; }
    if (!md?.format?.container && !md?.format?.duration) {
      await cleanup();
      return res.status(415).json({ error: 'Il file non sembra un audio valido' });
    }

    // suggerimenti dalle cartelle di provenienza ("Artista/Album") se non ci sono tag
    const dirHint = q(req.query.dir) ? T.parseRelPath(`${q(req.query.dir).replace(/\\/g, '/')}/${name}`) : {};
    const hint = {
      artist: q(req.query.artist) || '',
      album: q(req.query.album) || '',
    };
    const tags = summarizeTags(md);
    if (!hint.artist && !tags.albumArtist && !tags.artist && dirHint.artist && dirHint.artist !== 'Artista sconosciuto') hint.artist = dirHint.artist;
    if (!hint.album && !tags.album && dirHint.album && dirHint.album !== 'Album sconosciuto') hint.album = dirHint.album;

    if (!hint.artist && !tags.albumArtist && tags.artist && (hint.album || tags.album)) {
      hint.artist = recentArtistFor(hint.album || tags.album, tags.artist) || '';
    }

    const plan = await planDestination({ tags, hint, fileName: name, ext, db });
    rememberAlbum(plan.album, plan.artist);

    const dirAbs = T.safeJoin(config.musicDir, plan.dir);
    if (!dirAbs) { await cleanup(); return res.status(400).json({ error: 'Percorso non valido' }); }
    await fsp.mkdir(dirAbs, { recursive: true });

    const size = (await fsp.stat(tmp)).size;
    let finalName = plan.fileName;
    for (let n = 2; ; n += 1) {
      const target = path.join(dirAbs, finalName);
      const existing = await fsp.stat(target).catch(() => null);
      if (!existing) break;
      if (existing.size === size) { // stesso nome e stessa dimensione: lo consideriamo già presente
        await cleanup();
        return res.json({ status: 'duplicate', rel: `${plan.dir}/${finalName}`, artist: plan.artist, album: plan.album, title: plan.title });
      }
      finalName = plan.fileName.replace(/(\.[^.]+)$/, ` (${n})$1`);
    }
    await fsp.rename(tmp, path.join(dirAbs, finalName));
    res.status(201).json({
      status: 'ok', rel: `${plan.dir}/${finalName}`,
      artist: plan.artist, album: plan.album, title: plan.title,
      artistIsNew: plan.artistIsNew, albumIsNew: plan.albumIsNew,
    });
  } catch (e) {
    await cleanup();
    console.error('[upload]', e);
    res.status(500).json({ error: 'Impossibile archiviare il file' });
  }
});

// Dopo aver caricato uno o più file: aggiorna il catalogo (scansione incrementale, di solito pochi secondi)
router.post('/scan', (req, res) => res.status(202).json(requestScan()));
router.get('/scan', (req, res) => res.json(getState()));

module.exports = router;
