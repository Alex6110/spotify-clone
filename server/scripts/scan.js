/**
 * Scanner della libreria. Uso:
 *   npm run scan                 scansione incrementale (legge solo file nuovi o modificati)
 *   npm run scan -- --full       rilegge i tag di tutti i file
 *   npm run scan -- --prune      rimuove dal database i brani non più presenti su disco
 *   npm run scan -- --no-covers  salta cover e foto artisti
 * Gli ID dei brani restano stabili (la chiave è il percorso relativo), quindi playlist e preferiti sopravvivono.
 */
const config = require('../src/config');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const prisma = require('../src/db');
const T = require('../src/lib/text');

const args = new Set(process.argv.slice(2));
const FULL = args.has('--full');
const PRUNE = args.has('--prune');
const FORCE = args.has('--force');
const NO_COVERS = args.has('--no-covers');
// Copertine scelte a mano nello strumento di controllo (npm run curator): la scansione non deve sostituirle.
let LOCKED_COVERS = new Set();
try {
  const st = JSON.parse(require('fs').readFileSync(require('path').join(config.dataDir, 'curator-state.json'), 'utf8'));
  LOCKED_COVERS = new Set(Object.entries(st.albums || {}).filter(([, v]) => v && v.coverLocked).map(([k]) => Number(k)));
} catch { /* nessuna scelta manuale */ }

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const PREFERRED_COVER = ['cover', 'folder', 'front', 'album', 'artwork'];
const COVER_SIZE = 640;
const CONCURRENCY = 6;

let sharp = null;
try { sharp = require('sharp'); } catch { console.warn('[scan] "sharp" non installato: le cover verranno copiate senza ridimensionarle (npm i sharp).'); }

async function walk(root) {
  const audio = [];
  const imagesByDir = new Map();
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { console.warn(`[scan] cartella non leggibile: ${dir} (${e.code})`); continue; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name.startsWith('._')) continue; // file nascosti e resource fork di macOS
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(abs);
      else if (e.isFile()) {
        if (T.isAudioFile(e.name)) {
          const st = await fsp.stat(abs);
          audio.push({ abs, rel: path.relative(root, abs).split(path.sep).join('/').normalize('NFC'), size: st.size, mtimeMs: Math.floor(st.mtimeMs) });
        } else if (IMAGE_EXT.has(path.extname(e.name).toLowerCase())) {
          if (!imagesByDir.has(dir)) imagesByDir.set(dir, []);
          imagesByDir.get(dir).push(e.name);
        }
      }
    }
  }
  return { audio, imagesByDir };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const n = i++; out[n] = await fn(items[n], n); }
  }));
  return out;
}

const first = (v) => (Array.isArray(v) ? v[0] : v);
const majority = (values) => {
  const counts = new Map();
  for (const v of values.filter(Boolean)) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

function pickFolderImage(names) {
  if (!names?.length) return null;
  const lower = names.map((n) => ({ n, base: path.parse(n).name.toLowerCase() }));
  for (const want of PREFERRED_COVER) { const hit = lower.find((x) => x.base === want); if (hit) return hit.n; }
  return names[0];
}

async function toCoverJpeg(buf, outPath) {
  if (sharp) {
    await sharp(buf).rotate().resize(COVER_SIZE, COVER_SIZE, { fit: 'cover' }).jpeg({ quality: 82, progressive: true }).toFile(outPath);
  } else {
    await fsp.writeFile(outPath, buf);
  }
}

async function main() {
  if (!config.musicDir || !fs.existsSync(config.musicDir)) {
    console.error(`[scan] MUSIC_DIR non trovata: "${config.musicDir || '(vuota)'}". Il disco è collegato? Interrompo senza toccare il database.`);
    process.exit(1);
  }
  const mm = await import('music-metadata');
  fs.mkdirSync(config.coversDir, { recursive: true });
  fs.mkdirSync(config.artistPhotosDir, { recursive: true });

  console.log(`[scan] Lettura di ${config.musicDir} ...`);
  const { audio, imagesByDir } = await walk(config.musicDir);
  if (!audio.length) {
    console.error('[scan] Nessun file audio trovato: interrompo senza toccare il database.');
    process.exit(1);
  }
  console.log(`[scan] Trovati ${audio.length} file audio.`);

  const existing = new Map((await prisma.track.findMany({ select: { id: true, relPath: true, size: true, mtimeMs: true, albumId: true } })).map((t) => [t.relPath, t]));

  // File sciolti nella cartella dell'artista (senza sottocartella d'album): l'album si ricava dai tag
  const loose = audio.filter((f) => T.parseRelPath(f.rel).albumMissing);
  if (loose.length) {
    console.log(`[scan] ${loose.length} file senza cartella d'album: leggo i tag per trovare il loro album...`);
    await mapLimit(loose, CONCURRENCY, async (f) => {
      try { f.tagAlbum = T.cleanSpaces((await mm.parseFile(f.abs, { skipCovers: true })).common.album || ''); } catch { f.tagAlbum = ''; }
    });
  }

  // Raggruppa per album usando la struttura delle cartelle (robusto anche se i tag sono incoerenti)
  const groups = new Map();
  for (const f of audio) {
    const info = T.parseRelPath(f.rel);
    if (info.albumMissing) info.album = T.stripArtistPrefix(f.tagAlbum || 'Singoli', info.artist);
    const key = `${T.normKey(info.artist)}\u0000${T.normKey(info.album)}`;
    if (!groups.has(key)) groups.set(key, { artist: info.artist, album: info.album, files: [] });
    groups.get(key).files.push({ ...f, info });
  }
  console.log(`[scan] ${groups.size} album nelle cartelle.`);

  const artistCache = new Map(); // key -> id
  async function artistId(name) {
    const key = T.normKey(name) || 'sconosciuto';
    if (artistCache.has(key)) return artistCache.get(key);
    const a = await prisma.artist.upsert({ where: { key }, create: { name, key }, update: {}, select: { id: true } });
    artistCache.set(key, a.id);
    return a.id;
  }

  const stats = { albumsTouched: 0, tracksNew: 0, tracksUpdated: 0, tracksSkipped: 0, unreadable: 0, covers: 0 };
  let done = 0;

  for (const group of groups.values()) {
    done += group.files.length;
    const changed = group.files.filter((f) => {
      const old = existing.get(f.rel);
      return FULL || f.info.albumMissing || !old || old.size !== f.size || old.mtimeMs !== f.mtimeMs;
    });
    stats.tracksSkipped += group.files.length - changed.length;

    const albumArtistName = group.artist;
    const albumKey = T.normKey(group.album) || 'sconosciuto';
    const aId = await artistId(albumArtistName);
    let album = await prisma.album.findUnique({ where: { artistId_key: { artistId: aId, key: albumKey } } });

    if (!changed.length && album && album.cover) continue; // niente di nuovo

    // --- tag dei file nuovi/modificati ---
    const parsed = await mapLimit(changed, CONCURRENCY, async (f) => {
      try {
        let md = await mm.parseFile(f.abs, { skipCovers: true });
        // senza intestazione VBR la durata può mancare: rileggo scorrendo tutto il file (solo per questi brani)
        if (!md.format.duration) md = await mm.parseFile(f.abs, { skipCovers: true, duration: true });
        return { f, md };
      } catch (e) {
        stats.unreadable++;
        console.warn(`[scan] tag illeggibili (uso il nome del file): ${f.rel} - ${e.message}`);
        return { f, md: null };
      }
    });

    const years = parsed.map((p) => T.parseYear(p.md?.common?.year ?? p.md?.common?.date));
    const genres = parsed.map((p) => T.cleanSpaces(first(p.md?.common?.genre) || ''));
    const albumData = { title: T.cleanSpaces(group.album) || 'Album sconosciuto', key: albumKey, artistId: aId };
    const year = majority(years);
    const genre = majority(genres);

    if (!album) {
      album = await prisma.album.create({ data: { ...albumData, year, genre } });
    } else if (changed.length) {
      album = await prisma.album.update({ where: { id: album.id }, data: { title: albumData.title, ...(year ? { year } : {}), ...(genre ? { genre } : {}) } });
    }

    const ops = [];
    for (const { f, md } of parsed) {
      const c = md?.common;
      const fromName = T.parseTrackFile(f.info.fileName);
      const title = T.cleanSpaces(c?.title) || fromName.title;
      const tagArtist = T.cleanSpaces(c?.artist || '');
      // "Zucchero Feat. Eric Clapton" resta di Zucchero; un artista davvero diverso (compilation) ha il suo
      const trackArtistId = tagArtist && !T.sameArtistFamily(tagArtist, albumArtistName) ? await artistId(tagArtist) : aId;
      const data = {
        title,
        titleKey: T.normKey(title),
        trackNo: c?.track?.no || fromName.trackNo || null,
        discNo: c?.disk?.no || f.info.discNo || fromName.discNo || null,
        durationMs: md?.format?.duration ? Math.round(md.format.duration * 1000) : 0,
        format: path.extname(f.rel).slice(1).toLowerCase(),
        bitrate: md?.format?.bitrate ? Math.round(md.format.bitrate / 1000) : null,
        size: f.size,
        mtimeMs: f.mtimeMs,
        albumId: album.id,
        artistId: trackArtistId,
      };
      ops.push(prisma.track.upsert({ where: { relPath: f.rel }, create: { relPath: f.rel, ...data }, update: data }));
      existing.has(f.rel) ? stats.tracksUpdated++ : stats.tracksNew++;
    }
    if (ops.length) await prisma.$transaction(ops);
    stats.albumsTouched++;

    // --- cover e foto artista ---
    if (!NO_COVERS) {
      const coverFile = path.join(config.coversDir, `${album.id}.jpg`);
      if (!album.cover || !fs.existsSync(coverFile) || (changed.length && !LOCKED_COVERS.has(album.id))) {
        let buf = null;
        // cartella dell'album per prima, poi quelle dei singoli brani (es. CD1, CD2)
        const relParts = group.files[0].rel.split('/');
        const albumDir = path.join(config.musicDir, ...relParts.slice(0, relParts.length > 2 ? 2 : relParts.length - 1));
        const dirs = [...new Set(group.files.map((f) => path.dirname(f.abs)))];
        for (const d of [...new Set([albumDir, ...dirs])]) {
          const img = pickFolderImage(imagesByDir.get(d));
          if (img) { try { buf = await fsp.readFile(path.join(d, img)); break; } catch { /* prova la successiva */ } }
        }
        if (!buf) {
          for (const f of group.files.slice(0, 3)) {
            try {
              const md = await mm.parseFile(f.abs);
              const pic = md.common.picture?.[0];
              if (pic?.data) { buf = Buffer.from(pic.data); break; }
            } catch { /* prova il file successivo */ }
          }
        }
        if (!buf && config.legacyCoversDir) {
          const raw = group.files[0].rel.split('/');
          const slug = T.legacySlug(raw[0], raw.length > 2 ? raw[1] : group.album);
          try { buf = await fsp.readFile(path.join(config.legacyCoversDir, `${slug}.jpg`)); } catch { /* nessuna vecchia cover */ }
        }
        if (buf) {
          try {
            await toCoverJpeg(buf, coverFile);
            await prisma.album.update({ where: { id: album.id }, data: { cover: `/covers/${album.id}.jpg?v=${Date.now().toString(36)}` } });
            stats.covers++;
          } catch (e) { console.warn(`[scan] cover non elaborabile per "${group.album}": ${e.message}`); }
        }
      }
      if (config.legacyArtistDir) {
        const artist = await prisma.artist.findUnique({ where: { id: aId }, select: { photo: true } });
        if (artist && !artist.photo) {
          try {
            const buf = await fsp.readFile(path.join(config.legacyArtistDir, `${T.legacySlug(group.files[0].rel.split('/')[0])}.jpg`));
            await toCoverJpeg(buf, path.join(config.artistPhotosDir, `${aId}.jpg`));
            await prisma.artist.update({ where: { id: aId }, data: { photo: `/artist-photos/${aId}.jpg?v=${Date.now().toString(36)}` } });
          } catch { /* nessuna foto */ }
        }
      }
    }

    if (done % 500 < group.files.length) console.log(`[scan] ${done}/${audio.length} file elaborati...`);
  }

  // --- rimozione di ciò che non esiste più ---
  const onDisk = new Set(audio.map((f) => f.rel));
  const missing = [...existing.keys()].filter((r) => !onDisk.has(r));
  if (missing.length) {
    if (!PRUNE) {
      console.log(`[scan] ${missing.length} brani nel database non sono più su disco. Per rimuoverli: npm run scan -- --prune`);
    } else if (missing.length / existing.size > 0.5 && !FORCE) {
      console.error(`[scan] Rifiuto di rimuovere ${missing.length} brani su ${existing.size} (più del 50%): il disco è montato correttamente? Se è voluto, aggiungi --force.`);
    } else {
      for (let i = 0; i < missing.length; i += 500) {
        await prisma.track.deleteMany({ where: { relPath: { in: missing.slice(i, i + 500) } } });
      }
      console.log(`[scan] Rimossi ${missing.length} brani non più su disco.`);
    }
  }
  if (PRUNE) {
    // album e artisti rimasti senza brani (es. "Album sconosciuto" svuotato, o "Zucchero Feat. ..." non più usato)
    const emptyAlbums = await prisma.album.deleteMany({ where: { tracks: { none: {} } } });
    const emptyArtists = await prisma.artist.deleteMany({ where: { tracks: { none: {} }, albums: { none: {} } } });
    console.log(`[scan] Ripulito: ${emptyAlbums.count} album vuoti, ${emptyArtists.count} artisti vuoti.`);
  }

  const totals = { artisti: await prisma.artist.count({ where: { albums: { some: {} } } }), album: await prisma.album.count(), brani: await prisma.track.count() };
  console.log('[scan] Fatto.', JSON.stringify({ ...stats, ...totals }));
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
