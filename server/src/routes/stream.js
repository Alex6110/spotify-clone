const fs = require('fs');
const express = require('express');
const prisma = require('../db');
const config = require('../config');
const { requireAuth } = require('../auth');
const { safeJoin } = require('../lib/text');

const router = express.Router();

// <audio src> non può inviare header: il token arriva in ?t=. sendFile gestisce Range (seek) e ETag.
router.get('/:id', requireAuth(true), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).end();
  if (!config.musicDir) return res.status(503).json({ error: 'MUSIC_DIR non configurata' });

  const track = await prisma.track.findUnique({
    where: { id },
    select: { relPath: true, title: true, format: true, artist: { select: { name: true } } },
  });
  if (!track) return res.status(404).end();
  // relPath è salvato in forma NFC; su dischi creati da macOS i nomi possono essere NFD.
  const abs = [track.relPath, track.relPath.normalize('NFD')]
    .map((rel) => safeJoin(config.musicDir, rel))
    .find((p) => p && fs.existsSync(p));
  if (!abs) return res.status(404).end();

  if (req.query.download === '1') {
    const safe = `${track.artist.name} - ${track.title}`.replace(/[\\/:*?"<>|]+/g, '_');
    res.attachment(`${safe}.${track.format}`);
  }
  res.sendFile(abs, {
    acceptRanges: true,
    dotfiles: 'allow',
    headers: { 'Cache-Control': 'private, max-age=86400' },
  }, (err) => {
    if (err && !res.headersSent) res.status(err.status === 404 || err.code === 'ENOENT' ? 404 : 500).end();
  });
});

module.exports = router;
