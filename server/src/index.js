const config = require('./config'); // deve essere il primo require: carica .env
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');

const { router: authRouter } = require('./routes/auth');
const meRouter = require('./routes/me');
const libraryRouter = require('./routes/library');
const playbackRouter = require('./routes/playback');
const playlistsRouter = require('./routes/playlists');
const streamRouter = require('./routes/stream');
const downloadRouter = require('./routes/download');
const uploadRouter = require('./routes/upload');
const { attachSocket } = require('./socket');

fs.mkdirSync(config.coversDir, { recursive: true });
fs.mkdirSync(config.artistPhotosDir, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
if (config.corsOrigins.length) {
  app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
}
app.use(express.json({ limit: '512kb', type: ['application/json', 'text/plain'] }));

// File pubblici (nessun dato personale): cover e foto artisti
const staticOpts = { maxAge: '30d', fallthrough: true };
app.use('/covers', express.static(config.coversDir, staticOpts));
app.use('/artist-photos', express.static(config.artistPhotosDir, staticOpts));

// API (tutte protette, tranne /api/auth/*)
app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/library', libraryRouter);
app.use('/api/playback', playbackRouter);
app.use('/api/playlists', playlistsRouter);
app.use('/api/stream', streamRouter);
app.use('/api/download', downloadRouter);
app.use('/api/upload', uploadRouter);
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Percorso non trovato' }));

// Frontend compilato (npm run build nella cartella principale), se presente
const dist = path.join(__dirname, '..', '..', 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  // il service worker e il manifest non vanno mai tenuti in cache dal browser, altrimenti gli aggiornamenti non arrivano
  app.get(['/sw.js', '/manifest.webmanifest', '/index.html'], (req, res, next) => { res.set('Cache-Control', 'no-cache'); next(); });
  app.use(express.static(dist, { setHeaders: (res, file) => { if (file.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable'); } }));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Errore interno' });
});

const server = http.createServer(app);
// Il proxy di Vite riusa le connessioni: se il server le chiude prima (default 5 s) risponde 502 a caso.
server.keepAliveTimeout = 65 * 1000;
server.headersTimeout = 66 * 1000;
attachSocket(server);

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
server.listen(config.port, '0.0.0.0', () => {
  console.log(`Server attivo sulla porta ${config.port}`);
  console.log(config.musicDir ? `Musica: ${config.musicDir}` : 'ATTENZIONE: MUSIC_DIR non impostata');
});
