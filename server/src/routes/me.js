const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../auth');
const { settingsSchema, parseStored } = require('../lib/settings');
const { userDto } = require('./auth');

const router = express.Router();
router.use(requireAuth());

router.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ error: 'Account non trovato' });
  res.json(userDto(user));
});

router.patch('/settings', async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Impostazioni non valide' });
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ error: 'Account non trovato' });
  const merged = { ...parseStored(user.settings), ...parsed.data };
  const updated = await prisma.user.update({ where: { id: req.userId }, data: { settings: JSON.stringify(merged) } });
  res.json(userDto(updated));
});

const onboardingSchema = z.object({
  genres: z.array(z.string().trim().min(1).max(60)).max(30),
  artistIds: z.array(z.number().int().positive()).max(200),
});

router.put('/onboarding', async (req, res) => {
  const parsed = onboardingSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Dati non validi' });
  const { genres, artistIds } = parsed.data;

  const existing = await prisma.artist.findMany({ where: { id: { in: artistIds } }, select: { id: true } });
  const ops = [
    prisma.follow.deleteMany({ where: { userId: req.userId } }),
    ...(existing.length
      ? [prisma.follow.createMany({ data: existing.map((a) => ({ userId: req.userId, artistId: a.id })) })]
      : []),
    prisma.user.update({ where: { id: req.userId }, data: { onboarded: true, favGenres: JSON.stringify(genres) } }),
  ];
  const results = await prisma.$transaction(ops);
  res.json(userDto(results[results.length - 1]));
});

module.exports = router;
