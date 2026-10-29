const jwt = require('jsonwebtoken');
const config = require('./config');

const signToken = (user) => jwt.sign({ uid: user.id }, config.jwtSecret, { expiresIn: config.tokenTtl });

function verifyToken(token) {
  try {
    const p = jwt.verify(token, config.jwtSecret);
    return typeof p.uid === 'number' ? p.uid : null;
  } catch {
    return null;
  }
}

/**
 * Legge il token da "Authorization: Bearer ..." oppure, solo se allowQuery,
 * da ?t=... (serve a <audio src> e <a download>, che non possono inviare header).
 */
function tokenFrom(req, allowQuery) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  if (allowQuery && typeof req.query.t === 'string') return req.query.t;
  return null;
}

const requireAuth = (allowQuery = false) => (req, res, next) => {
  const uid = verifyToken(tokenFrom(req, allowQuery) || '');
  if (!uid) return res.status(401).json({ error: 'Non autenticato' });
  req.userId = uid;
  next();
};

module.exports = { signToken, verifyToken, requireAuth };
