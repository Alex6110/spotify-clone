const express = require('express');
const bcrypt = require('bcrypt');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const prisma = require('../db');
const config = require('../config');
const { signToken, requireAuth } = require('../auth');
const { parseStored } = require('../lib/settings');

const router = express.Router();

const userDto = (u) => {
  let favGenres = [];
  try { favGenres = JSON.parse(u.favGenres || '[]'); } catch { /* valore corrotto: lista vuota */ }
  return { id: u.id, name: u.name, email: u.email, onboarded: u.onboarded, favGenres, settings: parseStored(u.settings) };
};

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Troppi tentativi, riprova tra qualche minuto' } });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Troppe registrazioni, riprova più tardi' } });

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Inserisci un nome').max(60),
  email: z.string().trim().toLowerCase().email('Email non valida').max(200),
  password: z.string().min(8, 'La password deve avere almeno 8 caratteri').max(200),
  inviteCode: z.string().max(200).optional(),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

const firstError = (err) => err.issues?.[0]?.message || 'Dati non validi';

router.get('/config', (req, res) => {
  res.json({ registration: config.registration });
});

router.post('/register', registerLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed.error) });
  const { name, email, password, inviteCode } = parsed.data;

  const isFirstUser = (await prisma.user.count()) === 0;
  if (config.registration === 'invite' && !isFirstUser) {
    if (!config.inviteCode || inviteCode !== config.inviteCode) {
      return res.status(403).json({ error: 'Codice invito non valido' });
    }
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: 'Esiste già un account con questa email' });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { name, email, passwordHash } });
  res.status(201).json({ token: signToken(user), user: userDto(user) });
});

// Hash fittizio: il tempo di risposta non rivela se l'email esiste.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Email o password non valide' });
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Credenziali non valide' });
  res.json({ token: signToken(user), user: userDto(user) });
});

router.post('/refresh', requireAuth(), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ error: 'Account non trovato' });
  res.json({ token: signToken(user), user: userDto(user) });
});

module.exports = { router, userDto };
