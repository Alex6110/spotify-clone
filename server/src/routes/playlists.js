const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../auth');
const { trackSelect, trackDto } = require('../lib/dto');

const router = express.Router();
router.use(requireAuth());

const intParam = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const nameSchema = z.string().trim().min(1, 'Dai un nome alla playlist').max(80, 'Nome troppo lungo');
const MAX_TRACKS_PER_CALL = 500;

/** Restituisce la playlist solo se appartiene all'utente: gli altri ricevono 404, non 403. */
async function ownPlaylist(req, res) {
  const id = intParam(req.params.id);
  const playlist = id ? await prisma.playlist.findFirst({ where: { id, userId: req.userId } }) : null;
  if (!playlist) res.status(404).json({ error: 'Playlist non trovata' });
  return playlist;
}

async function trackIdsExist(ids) {
  const unique = [...new Set(ids)];
  const found = await prisma.track.count({ where: { id: { in: unique } } });
  return found === unique.length;
}

// ---- Elenco ----
router.get('/', async (req, res) => {
  const playlists = await prisma.playlist.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, _count: { select: { tracks: true } } },
  });
  const items = await Promise.all(playlists.map(async (p) => {
    // copertine dei primi brani (senza doppioni) per il mosaico
    const first = await prisma.playlistTrack.findMany({
      where: { playlistId: p.id },
      orderBy: { position: 'asc' },
      take: 12,
      select: { track: { select: { album: { select: { cover: true } } } } },
    });
    const covers = [...new Set(first.map((r) => r.track.album.cover).filter(Boolean))].slice(0, 4);
    return { id: p.id, name: p.name, trackCount: p._count.tracks, covers };
  }));
  res.json({ items });
});

// ---- Creazione (con brani iniziali opzionali) ----
const createSchema = z.object({
  name: nameSchema,
  trackIds: z.array(z.number().int().positive()).max(MAX_TRACKS_PER_CALL).optional(),
});
router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dati non validi' });
  const { name, trackIds = [] } = parsed.data;
  if (trackIds.length && !(await trackIdsExist(trackIds))) return res.status(404).json({ error: 'Brano non trovato' });

  const playlist = await prisma.playlist.create({
    data: {
      name,
      userId: req.userId,
      tracks: { create: trackIds.map((trackId, position) => ({ trackId, position })) },
    },
    select: { id: true, name: true },
  });
  res.status(201).json({ ...playlist, trackCount: trackIds.length });
});

// ---- Dettaglio ----
router.get('/:id', async (req, res) => {
  const playlist = await ownPlaylist(req, res);
  if (!playlist) return;
  const rows = await prisma.playlistTrack.findMany({
    where: { playlistId: playlist.id },
    orderBy: { position: 'asc' },
    select: { position: true, track: { select: trackSelect } },
  });
  const likedRows = rows.length
    ? await prisma.like.findMany({ where: { userId: req.userId, trackId: { in: rows.map((r) => r.track.id) } }, select: { trackId: true } })
    : [];
  const liked = new Set(likedRows.map((l) => l.trackId));
  res.json({
    id: playlist.id,
    name: playlist.name,
    tracks: rows.map((r) => ({ ...trackDto(r.track, liked.has(r.track.id)), position: r.position })),
  });
});

// ---- Rinomina ----
router.patch('/:id', async (req, res) => {
  const playlist = await ownPlaylist(req, res);
  if (!playlist) return;
  const parsed = z.object({ name: nameSchema }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dati non validi' });
  const updated = await prisma.playlist.update({ where: { id: playlist.id }, data: { name: parsed.data.name }, select: { id: true, name: true } });
  res.json(updated);
});

// ---- Eliminazione ----
router.delete('/:id', async (req, res) => {
  const playlist = await ownPlaylist(req, res);
  if (!playlist) return;
  await prisma.playlist.delete({ where: { id: playlist.id } });
  res.status(204).end();
});

// ---- Aggiunta di brani in fondo ----
const addSchema = z.object({ trackIds: z.array(z.number().int().positive()).min(1).max(MAX_TRACKS_PER_CALL) });
router.post('/:id/tracks', async (req, res) => {
  const playlist = await ownPlaylist(req, res);
  if (!playlist) return;
  const parsed = addSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Dati non validi' });
  const { trackIds } = parsed.data;
  if (!(await trackIdsExist(trackIds))) return res.status(404).json({ error: 'Brano non trovato' });

  const last = await prisma.playlistTrack.aggregate({ where: { playlistId: playlist.id }, _max: { position: true } });
  const start = (last._max.position ?? -1) + 1;
  await prisma.playlistTrack.createMany({
    data: trackIds.map((trackId, i) => ({ playlistId: playlist.id, trackId, position: start + i })),
  });
  res.status(201).json({ added: trackIds.length });
});

// ---- Rimozione di una riga (per posizione, perché lo stesso brano può comparire due volte) ----
router.delete('/:id/tracks/:position', async (req, res) => {
  const playlist = await ownPlaylist(req, res);
  if (!playlist) return;
  const position = Number(req.params.position);
  if (!Number.isInteger(position) || position < 0) return res.status(400).json({ error: 'Posizione non valida' });
  await prisma.playlistTrack.deleteMany({ where: { playlistId: playlist.id, position } });
  res.status(204).end();
});

// ---- Riordino: il client invia l'elenco completo nel nuovo ordine ----
const orderSchema = z.object({ trackIds: z.array(z.number().int().positive()).max(5000) });
router.put('/:id/order', async (req, res) => {
  const playlist = await ownPlaylist(req, res);
  if (!playlist) return;
  const parsed = orderSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Dati non validi' });
  const { trackIds } = parsed.data;

  // Per non perdere o inventare brani, il nuovo elenco deve contenere esattamente gli stessi brani.
  const current = await prisma.playlistTrack.findMany({ where: { playlistId: playlist.id }, select: { trackId: true } });
  const sig = (ids) => [...ids].sort((a, b) => a - b).join(',');
  if (sig(current.map((c) => c.trackId)) !== sig(trackIds)) {
    return res.status(409).json({ error: 'La playlist è cambiata, ricarica la pagina' });
  }
  await prisma.$transaction([
    prisma.playlistTrack.deleteMany({ where: { playlistId: playlist.id } }),
    prisma.playlistTrack.createMany({ data: trackIds.map((trackId, position) => ({ playlistId: playlist.id, trackId, position })) }),
  ]);
  res.status(204).end();
});

module.exports = router;
