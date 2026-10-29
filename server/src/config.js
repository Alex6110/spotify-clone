// Carica .env PRIMA di tutto il resto e valida la configurazione.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const fail = (msg) => {
  console.error(`\n[config] ${msg}\n`);
  process.exit(1);
};

const JWT_SECRET = process.env.JWT_SECRET || '';
if (JWT_SECRET.length < 32) {
  fail('JWT_SECRET mancante o troppo corto (minimo 32 caratteri). Generalo con:\n  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\ne mettilo in server/.env');
}

const DATA_DIR = path.resolve(path.join(__dirname, '..'), process.env.DATA_DIR || './data');

const config = {
  port: Number(process.env.PORT) || 5001,
  jwtSecret: JWT_SECRET,
  tokenTtl: '7d',
  musicDir: process.env.MUSIC_DIR ? path.resolve(process.env.MUSIC_DIR) : '',
  dataDir: DATA_DIR,
  coversDir: path.join(DATA_DIR, 'covers'),
  artistPhotosDir: path.join(DATA_DIR, 'artist-photos'),
  legacyCoversDir: process.env.LEGACY_COVERS_DIR || '',
  legacyArtistDir: process.env.LEGACY_ARTIST_DIR || '',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  registration: process.env.REGISTRATION === 'open' ? 'open' : 'invite',
  inviteCode: process.env.INVITE_CODE || '',
  allowUpload: process.env.ALLOW_UPLOAD !== 'false',
  maxUploadBytes: (Number(process.env.MAX_UPLOAD_MB) || 600) * 1024 * 1024,
};

if (config.registration === 'invite' && !config.inviteCode) {
  console.warn('[config] REGISTRATION=invite ma INVITE_CODE è vuoto: nessuno potrà registrarsi finché non lo imposti.');
}

module.exports = config;
