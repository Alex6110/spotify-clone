// Consigliati: mix, artisti simili, generi, richieste di nuovi artisti. Tutto legato all'utente che chiede.
const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../auth');
const { normKey } = require('../lib/text');
const { trackSelect, trackDto, albumSelect, albumDto } = require('../lib/dto');
const deezer = require('../lib/deezer');
const requests = require('../lib/requests');

const router = express.Router();
router.use(requireAuth());

const DAY = 24 * 3600 * 1000;
const intParam = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const uniq = (a) => [...new Set(a)];

const artistSelect = {
  id: true, name: true, photo: true,
  albums: { where: { cover: { not: null } }, take: 1, select: { cover: true } },
};
const artistCard = (a) => ({ id: a.id, name: a.name, photo: a.photo, cover: a.albums?.[0]?.cover ?? null });

/** Ascolti recenti dell'utente (dal più recente), con artista, album e genere del brano. */
async function recentListens(userId, take = 400, sinceDays = 0) {
  return prisma.listen.findMany({
    where: { userId, ...(sinceDays ? { at: { gte: new Date(Date.now() - sinceDays * DAY) } } : {}) },
    orderBy: { at: 'desc' }, take,
    select: { completed: true, playedMs: true, track: { select: { artistId: true, albumId: true, album: { select: { genre: true } } } } },
  });
}

/** Artisti preferiti dell'utente, dal più ascoltato: ascolti recenti + artisti seguiti; per chi è nuovo, gli artisti con più album. */
async function topArtistIds(userId, n, listens) {
  const score = new Map();
  for (const l of listens) score.set(l.track.artistId, (score.get(l.track.artistId) || 0) + (l.completed || l.playedMs > 60000 ? 1 : 0.4));
  const follows = await prisma.follow.findMany({ where: { userId }, select: { artistId: true } });
  for (const f of follows) score.set(f.artistId, (score.get(f.artistId) || 0) + 3);
  let ids = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  if (ids.length < n) {
    const more = await prisma.artist.findMany({ where: { albums: { some: {} }, id: { notIn: ids } }, orderBy: { albums: { _count: 'desc' } }, take: n * 2, select: { id: true } });
    ids = ids.concat(shuffle(more.map((a) => a.id)));
  }
  return ids.slice(0, n);
}

async function playableTrackIds(where, take = 4000) {
  const rows = await prisma.track.findMany({ where: { durationMs: { gt: 0 }, ...where }, select: { id: true, artistId: true }, take });
  return rows;
}

const withTracks = async (userId, ids) => {
  if (!ids.length) return [];
  const rows = await prisma.track.findMany({ where: { id: { in: ids } }, select: trackSelect });
  const byId = new Map(rows.map((t) => [t.id, t]));
  const liked = new Set((await prisma.like.findMany({ where: { userId, trackId: { in: ids } }, select: { trackId: true } })).map((r) => r.trackId));
  return ids.map((id) => byId.get(id)).filter(Boolean).map((t) => trackDto(t, liked.has(t.id)));
};

/** Al massimo `perArtist` brani per artista, in ordine casuale. */
function pickBalanced(rows, perArtist, total) {
  const used = new Map();
  const out = [];
  for (const r of shuffle(rows)) {
    const c = used.get(r.artistId) || 0;
    if (c >= perArtist) continue;
    used.set(r.artistId, c + 1);
    out.push(r.id);
    if (out.length >= total) break;
  }
  return out;
}

// ---- Home ----
router.get('/home', async (req, res) => {
  const userId = req.userId;
  const listens = await recentListens(userId, 600);

  const albumIds = uniq(listens.map((l) => l.track.albumId)).slice(0, 14);
  const artistIdsRecent = uniq(listens.map((l) => l.track.artistId)).slice(0, 14);

  const [albumRows, artistRows, likeCount, newest] = await Promise.all([
    albumIds.length ? prisma.album.findMany({ where: { id: { in: albumIds } }, select: albumSelect }) : [],
    artistIdsRecent.length ? prisma.artist.findMany({ where: { id: { in: artistIdsRecent } }, select: artistSelect }) : [],
    prisma.like.count({ where: { userId } }),
    prisma.album.findMany({ orderBy: { id: 'desc' }, take: 24, select: albumSelect }),
  ]);
  const albumById = new Map(albumRows.map((a) => [a.id, a]));
  const artistById = new Map(artistRows.map((a) => [a.id, a]));
  const recentAlbums = albumIds.map((id) => albumById.get(id)).filter(Boolean).map(albumDto);
  const recentArtists = artistIdsRecent.map((id) => artistById.get(id)).filter(Boolean).map(artistCard);

  // accesso rapido: preferiti + ultimi album (o gli ultimi aggiunti, se non ha ancora ascoltato nulla)
  const quickAlbums = (recentAlbums.length ? recentAlbums : newest.map(albumDto)).slice(0, likeCount ? 5 : 6);
  const quick = [
    ...(likeCount ? [{ type: 'liked', title: 'Brani che ti piacciono' }] : []),
    ...quickAlbums.map((a) => ({ type: 'album', id: a.id, title: a.title, cover: a.cover })),
  ];

  // mix per artista: i 6 più ascoltati
  const tops = await topArtistIds(userId, 6, listens);
  const topRows = tops.length ? await prisma.artist.findMany({ where: { id: { in: tops } }, select: artistSelect }) : [];
  const topById = new Map(topRows.map((a) => [a.id, a]));
  const mixes = tops.map((id) => topById.get(id)).filter(Boolean).map((a) => ({ kind: 'artist', id: a.id, title: `${a.name} Mix`, artist: a.name, photo: a.photo, cover: a.albums[0]?.cover ?? null }));

  // mix per genere: generi più ascoltati, poi quelli scelti all'onboarding, poi i più presenti
  const genreCount = new Map();
  for (const l of listens) { const g = l.track.album.genre?.trim(); if (g) genreCount.set(g, (genreCount.get(g) || 0) + 1); }
  let genres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  if (genres.length < 4) {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { favGenres: true } });
    let fav = [];
    try { fav = JSON.parse(me?.favGenres || '[]'); } catch { /* vuoto */ }
    const all = await prisma.album.groupBy({ by: ['genre'], where: { genre: { not: null } }, _count: { _all: true } });
    const byNorm = new Map(all.filter((r) => r.genre?.trim()).map((r) => [normKey(r.genre), r.genre]));
    for (const f of fav) { const g = byNorm.get(normKey(f)); if (g) genres.push(g); }
    genres = genres.concat(all.filter((r) => r.genre?.trim()).sort((a, b) => b._count._all - a._count._all).map((r) => r.genre));
  }
  genres = uniq(genres).slice(0, 4);
  const genreMixes = await Promise.all(genres.map(async (g) => {
    const al = await prisma.album.findFirst({ where: { genre: g, cover: { not: null } }, orderBy: { id: 'desc' }, select: { cover: true } });
    return { kind: 'genre', name: g, title: `Mix ${g}`, cover: al?.cover ?? null };
  }));

  res.json({
    hasHistory: listens.length > 0,
    quick,
    continue: recentAlbums,
    recentArtists,
    mixes,
    genreMixes,
    newest: newest.map(albumDto),
  });
});

// ---- Artisti simili a quelli che ascolti (Deezer): alcuni sono in libreria, altri no ----
router.get('/similar', async (req, res) => {
  const listens = await recentListens(req.userId, 600, 180);
  const tops = await topArtistIds(req.userId, 4, listens);
  const topRows = tops.length ? await prisma.artist.findMany({ where: { id: { in: tops } }, select: { id: true, name: true } }) : [];
  const topKeys = new Set(topRows.map((a) => normKey(a.name)));

  const lists = await Promise.all(topRows.map(async (a) => {
    const found = await deezer.searchArtist(a.name);
    return found ? deezer.related(found.id) : [];
  }));
  if (lists.every((l) => !l.length)) return res.json({ items: [], basedOn: topRows.map((a) => a.name) });

  const score = new Map();
  lists.forEach((list) => list.forEach((r, i) => {
    if (topKeys.has(normKey(r.name))) return;
    const cur = score.get(r.id) || { r, s: 0 };
    cur.s += 20 - i;
    score.set(r.id, cur);
  }));
  const ranked = [...score.values()].sort((a, b) => b.s - a.s).slice(0, 24).map((x) => x.r);

  const local = await prisma.artist.findMany({ where: { albums: { some: {} } }, select: { ...artistSelect, key: true } });
  const byKey = new Map(local.map((a) => [normKey(a.name), a]));
  const items = ranked.map((r) => {
    const l = byKey.get(normKey(r.name));
    return l
      ? { name: l.name, libraryId: l.id, photo: l.photo || l.albums[0]?.cover || r.photo, deezerId: r.id }
      : { name: r.name, libraryId: null, photo: r.photo, deezerId: r.id };
  }).filter((i) => i.photo);
  res.json({ items, basedOn: topRows.map((a) => a.name) });
});

// ---- Contenuto di un mix ----
router.get('/mix', async (req, res) => {
  const userId = req.userId;
  const kind = String(req.query.kind || '');

  if (kind === 'genre') {
    const name = String(req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Genere mancante' });
    const rows = await playableTrackIds({ album: { genre: name } });
    if (!rows.length) return res.status(404).json({ error: 'Nessun brano per questo genere' });
    const tracks = await withTracks(userId, pickBalanced(rows, 3, 40));
    return res.json({ title: `Mix ${name}`, subtitle: uniq(tracks.map((t) => t.artist)).slice(0, 3).join(', ') + ' e altro', tracks });
  }

  if (kind === 'artist') {
    const id = intParam(req.query.id);
    const artist = id ? await prisma.artist.findUnique({ where: { id }, select: { id: true, name: true, albums: { select: { genre: true } } } }) : null;
    if (!artist) return res.status(404).json({ error: 'Artista non trovato' });

    // artisti vicini presenti in libreria: prima quelli "simili" di Deezer, poi lo stesso genere
    let simIds = [];
    const found = await deezer.searchArtist(artist.name);
    if (found) {
      const rel = await deezer.related(found.id);
      const keys = rel.map((r) => normKey(r.name));
      const local = await prisma.artist.findMany({ where: { albums: { some: {} }, id: { not: artist.id } }, select: { id: true, key: true } });
      const byKey = new Map(local.map((a) => [normKey(a.key), a.id]));
      simIds = keys.map((k) => byKey.get(k)).filter(Boolean);
    }
    if (simIds.length < 4) {
      const genres = uniq(artist.albums.map((a) => a.genre).filter(Boolean));
      if (genres.length) {
        const g = await prisma.artist.findMany({ where: { id: { not: artist.id, notIn: simIds }, albums: { some: { genre: { in: genres } } } }, select: { id: true }, take: 80 });
        simIds = simIds.concat(shuffle(g.map((a) => a.id)).slice(0, 8 - simIds.length));
      }
    }
    simIds = uniq(simIds).slice(0, 8);

    const own = pickBalanced(await playableTrackIds({ artistId: artist.id }), 40, 20);
    const others = simIds.length ? pickBalanced(await playableTrackIds({ artistId: { in: simIds } }), 3, 20) : [];
    const ids = [];
    for (let i = 0; i < Math.max(own.length, others.length); i += 1) { if (own[i]) ids.push(own[i]); if (others[i]) ids.push(others[i]); }
    const tracks = await withTracks(userId, ids);
    const names = uniq(tracks.map((t) => t.artist));
    const subtitle = `${[artist.name, ...names.filter((n) => n !== artist.name)].slice(0, 3).join(', ')}${names.length > 3 ? ' e altro' : ''}`;
    return res.json({ title: `${artist.name} Mix`, subtitle, tracks });
  }

  return res.status(400).json({ error: 'Tipo di mix non valido' });
});

// ---- Sfoglia (pagina Cerca): generi con una copertina + album da riscoprire ----
router.get('/explore', async (req, res) => {
  const rows = await prisma.album.groupBy({ by: ['genre'], where: { genre: { not: null } }, _count: { _all: true } });
  const genres = rows.filter((r) => r.genre?.trim()).sort((a, b) => b._count._all - a._count._all).slice(0, 24);
  const withCover = await Promise.all(genres.map(async (r) => {
    const al = await prisma.album.findFirst({ where: { genre: r.genre, cover: { not: null } }, orderBy: { id: 'desc' }, select: { cover: true } });
    return { name: r.genre, albumCount: r._count._all, cover: al?.cover ?? null };
  }));
  const ids = (await prisma.album.findMany({ where: { cover: { not: null } }, select: { id: true } })).map((a) => a.id);
  const pick = shuffle(ids).slice(0, 12);
  const albums = pick.length ? await prisma.album.findMany({ where: { id: { in: pick } }, select: albumSelect }) : [];
  const byId = new Map(albums.map((a) => [a.id, a]));
  res.json({ genres: withCover, rediscover: pick.map((id) => byId.get(id)).filter(Boolean).map(albumDto) });
});

// ---- Artisti fuori libreria ----
router.get('/external/:deezerId', async (req, res) => {
  const deezerId = intParam(req.params.deezerId);
  if (!deezerId) return res.status(404).json({ error: 'Artista non trovato' });
  const a = await deezer.artist(deezerId);
  if (!a) return res.status(502).json({ error: 'Deezer non risponde, riprova tra poco' });
  const key = normKey(a.name);
  const local = (await prisma.artist.findMany({ where: { albums: { some: {} } }, select: { id: true, name: true } })).find((x) => normKey(x.name) === key);
  const mine = requests.readAll().some((r) => r.userId === req.userId && r.key === key);
  res.json({ deezerId, name: a.name, photo: a.photo, fans: a.fans, libraryId: local?.id ?? null, requested: mine });
});

const requestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  deezerId: z.number().int().positive().optional(),
});
router.post('/requests', async (req, res) => {
  const parsed = requestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Dati non validi' });
  const { name, deezerId } = parsed.data;
  const key = normKey(name);
  const mineAll = requests.readAll().filter((r) => r.userId === req.userId);
  if (mineAll.some((r) => r.key === key)) return res.status(200).json({ ok: true, already: true });
  if (mineAll.filter((r) => r.status === 'nuova').length >= 30) return res.status(429).json({ error: 'Hai già molte richieste in attesa' });
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });
  requests.add({ userId: req.userId, userName: user?.name || '', name, key, ...(deezerId ? { deezerId } : {}) });
  res.status(201).json({ ok: true });
});

router.get('/requests', (req, res) => {
  res.json({ items: requests.readAll().filter((r) => r.userId === req.userId).map(({ id, name, at, status }) => ({ id, name, at, status })) });
});

module.exports = router;
