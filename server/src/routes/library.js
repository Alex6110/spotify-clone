const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../auth');
const { normKey } = require('../lib/text');
const { trackSelect, trackDto, albumSelect, albumDto } = require('../lib/dto');

const router = express.Router();
router.use(requireAuth());

const page = (req, max = 100, def = 30) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || def, 1), max);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  return { limit, offset };
};
const intParam = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

async function likedSet(userId, trackIds) {
  if (!trackIds.length) return new Set();
  const rows = await prisma.like.findMany({ where: { userId, trackId: { in: trackIds } }, select: { trackId: true } });
  return new Set(rows.map((r) => r.trackId));
}

const trackOrder = [{ discNo: 'asc' }, { trackNo: 'asc' }, { titleKey: 'asc' }];

// ---- Home ----
router.get('/home', async (req, res) => {
  const recentListens = await prisma.listen.findMany({
    where: { userId: req.userId },
    orderBy: { at: 'desc' },
    take: 200,
    select: { track: { select: { albumId: true } } },
  });
  const albumIds = [];
  for (const l of recentListens) {
    if (!albumIds.includes(l.track.albumId)) albumIds.push(l.track.albumId);
    if (albumIds.length === 6) break;
  }
  let recentlyPlayed = [];
  if (albumIds.length) {
    const rows = await prisma.album.findMany({ where: { id: { in: albumIds } }, select: albumSelect });
    const byId = new Map(rows.map((a) => [a.id, a]));
    recentlyPlayed = albumIds.map((id) => byId.get(id)).filter(Boolean).map(albumDto);
  }
  const newest = await prisma.album.findMany({ orderBy: { id: 'desc' }, take: 24, select: albumSelect });
  res.json({ recentlyPlayed, newest: newest.map(albumDto) });
});

// ---- Album ----
router.get('/albums', async (req, res) => {
  const { limit, offset } = page(req);
  const sort = String(req.query.sort || 'recent');
  const orderBy = sort === 'title' ? [{ key: 'asc' }] : sort === 'artist' ? [{ artist: { key: 'asc' } }, { year: 'asc' }] : [{ id: 'desc' }];
  const q = normKey(req.query.q);
  const where = {
    ...(q ? { OR: [{ key: { contains: q } }, { artist: { key: { contains: q } } }] } : {}),
    ...(req.query.artistId ? { artistId: intParam(req.query.artistId) ?? -1 } : {}),
    ...(req.query.genre ? { genre: String(req.query.genre) } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.album.count({ where }),
    prisma.album.findMany({ where, orderBy, skip: offset, take: limit, select: albumSelect }),
  ]);
  res.json({ total, items: items.map(albumDto) });
});

router.get('/albums/:id', async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) return res.status(404).json({ error: 'Album non trovato' });
  const album = await prisma.album.findUnique({
    where: { id },
    select: { ...albumSelect, tracks: { orderBy: trackOrder, select: trackSelect } },
  });
  if (!album) return res.status(404).json({ error: 'Album non trovato' });
  const liked = await likedSet(req.userId, album.tracks.map((t) => t.id));
  res.json({ ...albumDto(album), tracks: album.tracks.map((t) => trackDto(t, liked.has(t.id))) });
});

// ---- Artisti ----
router.get('/artists', async (req, res) => {
  const { limit, offset } = page(req, 300, 60);
  const q = normKey(req.query.q);
  const where = { albums: { some: {} }, ...(q ? { key: { contains: q } } : {}) };
  const orderBy = req.query.sort === 'albums' ? [{ albums: { _count: 'desc' } }, { key: 'asc' }] : [{ key: 'asc' }];
  const [total, rows] = await Promise.all([
    prisma.artist.count({ where }),
    prisma.artist.findMany({
      where, orderBy, skip: offset, take: limit,
      select: {
        id: true, name: true, photo: true,
        _count: { select: { albums: true } },
        albums: { where: { cover: { not: null } }, take: 1, select: { cover: true } },
      },
    }),
  ]);
  res.json({
    total,
    items: rows.map((a) => ({ id: a.id, name: a.name, photo: a.photo, cover: a.albums[0]?.cover ?? null, albumCount: a._count.albums })),
  });
});

router.get('/artists/:id', async (req, res) => {
  const id = intParam(req.params.id);
  if (!id) return res.status(404).json({ error: 'Artista non trovato' });
  const artist = await prisma.artist.findUnique({
    where: { id },
    select: { id: true, name: true, photo: true, albums: { orderBy: [{ year: 'asc' }, { key: 'asc' }], select: albumSelect } },
  });
  if (!artist) return res.status(404).json({ error: 'Artista non trovato' });
  const followed = !!(await prisma.follow.findUnique({ where: { userId_artistId: { userId: req.userId, artistId: id } } }));
  res.json({ id: artist.id, name: artist.name, photo: artist.photo, followed, albums: artist.albums.map(albumDto) });
});

router.put('/follows/:artistId', async (req, res) => {
  const artistId = intParam(req.params.artistId);
  if (!artistId || !(await prisma.artist.findUnique({ where: { id: artistId }, select: { id: true } }))) return res.status(404).json({ error: 'Artista non trovato' });
  await prisma.follow.upsert({ where: { userId_artistId: { userId: req.userId, artistId } }, create: { userId: req.userId, artistId }, update: {} });
  res.status(204).end();
});
router.delete('/follows/:artistId', async (req, res) => {
  const artistId = intParam(req.params.artistId);
  if (artistId) await prisma.follow.deleteMany({ where: { userId: req.userId, artistId } });
  res.status(204).end();
});

// ---- Generi ----
router.get('/genres', async (req, res) => {
  const rows = await prisma.album.groupBy({ by: ['genre'], where: { genre: { not: null } }, _count: { _all: true } });
  const items = rows
    .filter((r) => r.genre && r.genre.trim())
    .map((r) => ({ name: r.genre, albumCount: r._count._all }))
    .sort((a, b) => b.albumCount - a.albumCount);
  res.json({ items });
});

// ---- Ricerca ----
router.get('/search', async (req, res) => {
  const q = normKey(req.query.q);
  if (q.length < 2) return res.json({ artists: [], albums: [], tracks: [] });
  const [artists, albums, tracks] = await Promise.all([
    prisma.artist.findMany({
      where: { albums: { some: {} }, key: { contains: q } }, orderBy: { key: 'asc' }, take: 8,
      select: { id: true, name: true, photo: true, albums: { where: { cover: { not: null } }, take: 1, select: { cover: true } } },
    }),
    prisma.album.findMany({
      where: { OR: [{ key: { contains: q } }, { artist: { key: { contains: q } } }] },
      orderBy: { key: 'asc' }, take: 12, select: albumSelect,
    }),
    prisma.track.findMany({
      where: { OR: [{ titleKey: { contains: q } }, { artist: { key: { contains: q } } }] },
      orderBy: { titleKey: 'asc' }, take: 25, select: trackSelect,
    }),
  ]);
  const liked = await likedSet(req.userId, tracks.map((t) => t.id));
  res.json({
    artists: artists.map((a) => ({ id: a.id, name: a.name, photo: a.photo, cover: a.albums[0]?.cover ?? null })),
    albums: albums.map(albumDto),
    tracks: tracks.map((t) => trackDto(t, liked.has(t.id))),
  });
});

// ---- Brani per ID (ordine mantenuto) ----
router.get('/tracks', async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(intParam).filter(Boolean).slice(0, 500);
  if (!ids.length) return res.json({ items: [] });
  const rows = await prisma.track.findMany({ where: { id: { in: ids } }, select: trackSelect });
  const byId = new Map(rows.map((t) => [t.id, t]));
  const liked = await likedSet(req.userId, ids);
  res.json({ items: ids.map((id) => byId.get(id)).filter(Boolean).map((t) => trackDto(t, liked.has(t.id))) });
});

// ---- Preferiti ----
router.get('/likes', async (req, res) => {
  const { limit, offset } = page(req, 200, 100);
  const where = { userId: req.userId };
  const [total, rows] = await Promise.all([
    prisma.like.count({ where }),
    prisma.like.findMany({ where, orderBy: { at: 'desc' }, skip: offset, take: limit, select: { track: { select: trackSelect } } }),
  ]);
  res.json({ total, items: rows.map((r) => trackDto(r.track, true)) });
});
router.put('/likes/:trackId', async (req, res) => {
  const trackId = intParam(req.params.trackId);
  if (!trackId || !(await prisma.track.findUnique({ where: { id: trackId }, select: { id: true } }))) return res.status(404).json({ error: 'Brano non trovato' });
  await prisma.like.upsert({ where: { userId_trackId: { userId: req.userId, trackId } }, create: { userId: req.userId, trackId }, update: {} });
  res.status(204).end();
});
router.delete('/likes/:trackId', async (req, res) => {
  const trackId = intParam(req.params.trackId);
  if (trackId) await prisma.like.deleteMany({ where: { userId: req.userId, trackId } });
  res.status(204).end();
});

// ---- Cronologia di ascolto ----
const listenSchema = z.object({
  trackId: z.number().int().positive(),
  playedMs: z.number().int().min(0).max(6 * 3600 * 1000),
  completed: z.boolean().optional(),
});
router.post('/listens', async (req, res) => {
  const parsed = listenSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Dati non validi' });
  const { trackId, playedMs, completed } = parsed.data;
  if (!(await prisma.track.findUnique({ where: { id: trackId }, select: { id: true } }))) return res.status(404).json({ error: 'Brano non trovato' });
  await prisma.listen.create({ data: { userId: req.userId, trackId, playedMs, completed: !!completed } });
  res.status(204).end();
});

module.exports = router;
