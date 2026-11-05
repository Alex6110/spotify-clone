// Miniature delle copertine e delle foto artista: /covers/12.jpg?w=320 → versione WebP piccola, salvata su disco e riusata.
// Senza ?w= il file originale passa com'era (express.static, più sotto).
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const config = require('../config');

let sharp = null;
try { sharp = require('sharp'); } catch { console.warn('[thumbs] "sharp" non installato: le copertine vengono servite a grandezza intera.'); }

const SIZES = [96, 128, 192, 256, 320, 384, 480, 640];
const THUMBS_DIR = path.join(config.dataDir, 'thumbs');
const inflight = new Map();
let running = 0;
const waiting = [];
const LIMIT = 3; // al massimo 3 ridimensionamenti insieme: alla prima apertura della Home ne servono parecchi

const slot = () => new Promise((resolve) => { if (running < LIMIT) { running += 1; resolve(); } else waiting.push(resolve); });
const release = () => { const next = waiting.shift(); if (next) next(); else running -= 1; };

function snap(w) {
  const n = Number(w);
  if (!Number.isFinite(n) || n <= 0) return null;
  return SIZES.find((s) => s >= n) || null; // più grande di 640: l'originale (le cover originali sono già 640)
}

async function makeThumb(src, dest, size) {
  await slot();
  try {
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${process.pid}.tmp`;
    await sharp(src).rotate().resize(size, size, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 78 }).toFile(tmp);
    await fsp.rename(tmp, dest);
  } finally { release(); }
}

/** Middleware per una cartella pubblica (kind = nome della cartella di cache, dir = cartella dei file originali). */
function thumbMiddleware(kind, dir) {
  return async (req, res, next) => {
    const size = req.query.w !== undefined ? snap(req.query.w) : null;
    if (!sharp || !size) return next();
    const name = decodeURIComponent(req.path.replace(/^\//, ''));
    if (!name || name !== path.basename(name) || name.startsWith('.')) return next();
    const src = path.join(dir, name);
    try {
      const st = await fsp.stat(src);
      const dest = path.join(THUMBS_DIR, kind, `${size}-${Math.round(st.mtimeMs)}-${name}.webp`);
      if (!fs.existsSync(dest)) {
        let job = inflight.get(dest);
        if (!job) { job = makeThumb(src, dest, size).finally(() => inflight.delete(dest)); inflight.set(dest, job); }
        await job;
      }
      res.sendFile(dest, { maxAge: '30d', immutable: true, headers: { 'Content-Type': 'image/webp' } }, (err) => { if (err && !res.headersSent) next(); });
    } catch {
      next(); // file non trovato o non elaborabile: ci pensa express.static (o il 404)
    }
  };
}

/** Prepara in anticipo le miniature di tutta una cartella (usato da "npm run thumbs"). Ritorna quante ne ha create. */
async function warm(kind, dir, sizes = [128, 320]) {
  if (!sharp) throw new Error('"sharp" non è installato: esegui npm install nella cartella server');
  let made = 0;
  let files = [];
  try { files = await fsp.readdir(dir); } catch { return 0; }
  for (const name of files) {
    if (name.startsWith('.') || !/\.(jpe?g|png|webp)$/i.test(name)) continue;
    const src = path.join(dir, name);
    let st;
    try { st = await fsp.stat(src); } catch { continue; }
    for (const size of sizes) {
      const dest = path.join(THUMBS_DIR, kind, `${size}-${Math.round(st.mtimeMs)}-${name}.webp`);
      if (fs.existsSync(dest)) continue;
      try { await makeThumb(src, dest, size); made += 1; } catch { /* immagine rovinata: si salta */ }
    }
  }
  return made;
}

module.exports = { thumbMiddleware, warm };
