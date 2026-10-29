const fs = require('fs');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const path = require('path');
const express = require('express');
const prisma = require('../db');
const config = require('../config');
const { requireAuth } = require('../auth');
const { safeJoin, safeFileName, trackFileName } = require('../lib/text');
const { zipStream, zipSize, MAX_ZIP_BYTES } = require('../lib/zip');

const router = express.Router();
// <a href download> non può inviare header: il token passa da ?t=, come per lo streaming
router.use(requireAuth(true));

const trackSel = { id: true, title: true, trackNo: true, discNo: true, relPath: true, artist: { select: { name: true } } };

/** File su disco di un brano (relPath è salvato NFC; su dischi macOS i nomi possono essere NFD). */
function absOf(relPath) {
  return [relPath, relPath.normalize('NFD')].map((rel) => safeJoin(config.musicDir, rel)).find((p) => p && fs.existsSync(p)) || null;
}

/** name = nome nell'archivio, deve essere unico */
async function collect(tracks, nameOf) {
  const used = new Set();
  const entries = [];
  let missing = 0;
  for (const t of tracks) {
    const abs = absOf(t.relPath);
    if (!abs) { missing += 1; continue; }
    const st = await fs.promises.stat(abs);
    let name = nameOf(t, path.extname(abs));
    for (let n = 2; used.has(name.toLowerCase()); n += 1) name = name.replace(/(\.[^./]+)?$/, ` (${n})$1`);
    used.add(name.toLowerCase());
    entries.push({ name, absPath: abs, size: st.size, mtimeMs: st.mtimeMs });
  }
  return { entries, missing };
}

async function sendZip(res, zipName, entries) {
  if (!entries.length) return res.status(404).json({ error: 'Nessun file disponibile' });
  const total = zipSize(entries);
  if (total > MAX_ZIP_BYTES) return res.status(413).json({ error: 'Troppo grande per un unico archivio (oltre 4 GB): scarica i brani singolarmente' });
  res.attachment(`${zipName}.zip`);
  res.type('application/zip');
  res.setHeader('Content-Length', String(total));
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    await pipeline(Readable.from(zipStream(entries)), res);
  } catch (e) {
    // connessione chiusa dal client o file cambiato durante la lettura: non c'è altro da fare
    if (!res.headersSent) res.status(500).end(); else res.destroy();
  }
}

router.get('/album/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Album non trovato' });
  if (!config.musicDir) return res.status(503).json({ error: 'MUSIC_DIR non configurata' });
  const album = await prisma.album.findUnique({
    where: { id },
    select: { id: true, title: true, artist: { select: { name: true } }, tracks: { orderBy: [{ discNo: 'asc' }, { trackNo: 'asc' }, { title: 'asc' }], select: trackSel } },
  });
  if (!album) return res.status(404).json({ error: 'Album non trovato' });

  const folder = safeFileName(`${album.artist.name} - ${album.title}`) || 'Album';
  const multiDisc = album.tracks.some((t) => (t.discNo || 1) > 1);
  const { entries } = await collect(album.tracks, (t, ext) => `${folder}/${trackFileName({ title: t.title, trackNo: t.trackNo, discNo: multiDisc ? t.discNo || 1 : 1, ext })}`);
  const coverPath = path.join(config.coversDir, `${album.id}.jpg`);
  try {
    const st = await fs.promises.stat(coverPath);
    entries.push({ name: `${folder}/cover.jpg`, absPath: coverPath, size: st.size, mtimeMs: st.mtimeMs });
  } catch { /* nessuna copertina */ }
  await sendZip(res, folder, entries);
});

router.get('/playlist/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Playlist non trovata' });
  if (!config.musicDir) return res.status(503).json({ error: 'MUSIC_DIR non configurata' });
  const playlist = await prisma.playlist.findFirst({
    where: { id, userId: req.userId },
    select: { name: true, tracks: { orderBy: { position: 'asc' }, select: { track: { select: trackSel } } } },
  });
  if (!playlist) return res.status(404).json({ error: 'Playlist non trovata' });

  const folder = safeFileName(playlist.name) || 'Playlist';
  const tracks = playlist.tracks.map((r) => r.track);
  const pad = String(tracks.length).length;
  let i = 0;
  const { entries } = await collect(tracks, (t, ext) => {
    i += 1;
    return `${folder}/${String(i).padStart(Math.max(2, pad), '0')} ${safeFileName(`${t.artist.name} - ${t.title}`, 110)}${ext}`;
  });
  await sendZip(res, folder, entries);
});

module.exports = router;
