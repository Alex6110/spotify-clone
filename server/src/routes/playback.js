const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../auth');
const { trackSelect, trackDto } = require('../lib/dto');

const router = express.Router();
router.use(requireAuth());

router.get('/', async (req, res) => {
  const state = await prisma.playbackState.findUnique({ where: { userId: req.userId } });
  if (!state) return res.json({ track: null, currentTime: 0, queue: [] });

  let ids = [];
  try { ids = JSON.parse(state.queue || '[]').filter(Number.isInteger); } catch { /* coda corrotta: vuota */ }
  const wanted = [...new Set([...(state.trackId ? [state.trackId] : []), ...ids])];
  const rows = wanted.length ? await prisma.track.findMany({ where: { id: { in: wanted } }, select: trackSelect }) : [];
  const likedRows = wanted.length ? await prisma.like.findMany({ where: { userId: req.userId, trackId: { in: wanted } }, select: { trackId: true } }) : [];
  const liked = new Set(likedRows.map((l) => l.trackId));
  const byId = new Map(rows.map((t) => [t.id, trackDto(t, liked.has(t.id))]));
  res.json({
    track: state.trackId ? byId.get(state.trackId) ?? null : null,
    currentTime: state.currentTime,
    queue: ids.map((id) => byId.get(id)).filter(Boolean),
  });
});

const putSchema = z.object({
  trackId: z.number().int().positive().nullable(),
  currentTime: z.number().min(0).max(24 * 3600).default(0),
  queue: z.array(z.number().int().positive()).max(500).optional(),
});

// Accetta anche text/plain: è così che sendBeacon invia i dati alla chiusura della pagina.
router.put('/', async (req, res) => {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const parsed = putSchema.safeParse(body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Dati non validi' });
  const { trackId, currentTime, queue } = parsed.data;

  if (trackId && !(await prisma.track.findUnique({ where: { id: trackId }, select: { id: true } }))) {
    return res.status(404).json({ error: 'Brano non trovato' });
  }
  const data = { trackId, currentTime, ...(queue ? { queue: JSON.stringify(queue) } : {}) };
  await prisma.playbackState.upsert({ where: { userId: req.userId }, update: data, create: { userId: req.userId, ...data } });
  res.status(204).end();
});

module.exports = router;
