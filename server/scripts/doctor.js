/**
 * Controllo di salute della libreria. Non modifica nulla, salvo con --fix-durations.
 *   npm run doctor                    report completo (anche salvato in data/doctor-report.txt)
 *   npm run doctor -- --fix-durations rilegge i brani con durata 0:00 scandendo tutto il file e aggiorna il database
 *   npm run doctor -- --deep          in più confronta, per gli mp3, la durata scritta nell'intestazione con quella reale
 *                                     (scopre i file tagliati: richiede qualche minuto)
 *   npm run doctor -- --reset-photos   toglie TUTTE le foto artista (le foto del vecchio archivio sono abbinate solo per nome e
 *                                     spesso sbagliate): gli artisti mostrano la copertina di un loro album finché non avremo foto affidabili
 *   npm run doctor -- --limit 60      quante righe mostrare per ogni problema (predefinito 25)
 */
const config = require('../src/config');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const prisma = require('../src/db');
const T = require('../src/lib/text');

const argv = process.argv.slice(2);
const FIX = argv.includes('--fix-durations');
const DEEP = argv.includes('--deep');
const RESET_PHOTOS = argv.includes('--reset-photos');
const li = argv.indexOf('--limit');
const LIMIT = li >= 0 ? Math.max(1, Number(argv[li + 1]) || 25) : 25;

const lines = [];
const out = (s = '') => { lines.push(s); console.log(s); };
const section = (t) => { out(''); out(`=== ${t} ===`); };
const list = (items, fmt) => {
  items.slice(0, LIMIT).forEach((x) => out(`  - ${fmt(x)}`));
  if (items.length > LIMIT) out(`  ... e altri ${items.length - LIMIT} (usa --limit per vederne di più)`);
};

async function mapLimit(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const n = i++; await fn(items[n], n); }
  }));
}

const absOf = (relPath) => [relPath, relPath.normalize('NFD')]
  .map((rel) => T.safeJoin(config.musicDir, rel)).find((p) => p && fs.existsSync(p)) || null;

const md5File = async (p) => crypto.createHash('md5').update(await fsp.readFile(p)).digest('hex');

function finish() {
  const reportPath = path.join(config.dataDir, 'doctor-report.txt');
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  out('');
  out(`Report salvato in ${reportPath}`);
}

async function main() {
  if (!config.musicDir || !fs.existsSync(config.musicDir)) {
    console.error(`MUSIC_DIR non trovata: "${config.musicDir || '(vuota)'}". Il disco è collegato?`);
    process.exit(1);
  }
  const mm = await import('music-metadata');

  const [artists, albums, tracks] = await Promise.all([
    prisma.artist.findMany({ select: { id: true, name: true, key: true, photo: true } }),
    prisma.album.findMany({ select: { id: true, title: true, cover: true, artistId: true, artist: { select: { name: true } }, _count: { select: { tracks: true } } } }),
    prisma.track.findMany({ select: { id: true, relPath: true, format: true, size: true, durationMs: true, bitrate: true, albumId: true } }),
  ]);
  out(`Libreria: ${artists.length} artisti, ${albums.length} album, ${tracks.length} brani. Cartella: ${config.musicDir}`);
  const byFormat = {};
  tracks.forEach((t) => { byFormat[t.format] = (byFormat[t.format] || 0) + 1; });
  out(`Formati: ${Object.entries(byFormat).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(', ')}`);
  const totalGb = tracks.reduce((s, t) => s + (t.size || 0), 0) / 1024 ** 3;
  out(`Dimensione totale: ${totalGb.toFixed(1)} GB (media ${(totalGb * 1024 / Math.max(1, tracks.length)).toFixed(1)} MB a brano)`);

  // ---------- 1. File mancanti ----------
  section('1. File presenti nel database ma non sul disco');
  const missing = [];
  await mapLimit(tracks, 32, async (t) => { if (!absOf(t.relPath)) missing.push(t); });
  out(missing.length ? `${missing.length} brani non trovati (disco scollegato o file spostati?)` : 'Tutto presente.');
  list(missing, (t) => t.relPath);
  const missingIds = new Set(missing.map((t) => t.id));

  // ---------- 2. Durata 0:00 ----------
  section('2. Brani con durata 0:00 (non partono o non mostrano la durata)');
  const zero = tracks.filter((t) => !t.durationMs && !missingIds.has(t.id));
  out(zero.length ? `${zero.length} brani con durata zero.` : 'Nessuno.');
  if (zero.length) {
    const perFormat = {};
    zero.forEach((t) => { perFormat[t.format] = (perFormat[t.format] || 0) + 1; });
    out(`Per formato: ${Object.entries(perFormat).map(([f, n]) => `${f} ${n}`).join(', ')}`);
    if (!FIX) {
      list(zero, (t) => `${t.relPath} (${t.format}, ${(t.size / 1048576).toFixed(1)} MB)`);
      out('  Per provare a recuperarli: npm run doctor -- --fix-durations');
    } else {
      out('  Rilettura completa dei file in corso...');
      const unfixable = [];
      let fixed = 0;
      await mapLimit(zero, 4, async (t) => {
        try {
          const md = await mm.parseFile(absOf(t.relPath), { duration: true, skipCovers: true });
          const ms = md.format.duration ? Math.round(md.format.duration * 1000) : 0;
          if (ms > 0) {
            await prisma.track.update({ where: { id: t.id }, data: { durationMs: ms, bitrate: md.format.bitrate ? Math.round(md.format.bitrate / 1000) : t.bitrate } });
            fixed += 1;
          } else unfixable.push({ t, why: 'durata non rilevabile' });
        } catch (e) { unfixable.push({ t, why: e.message }); }
      });
      out(`  Recuperati: ${fixed}. Non recuperabili: ${unfixable.length}.`);
      if (unfixable.length) {
        out('  Questi file sono probabilmente danneggiati o incompleti (da rippare di nuovo, oppure da provare in un altro player):');
        list(unfixable, ({ t, why }) => `${t.relPath} - ${why}`);
      }
    }
  }

  // ---------- 3. Brani sospetti ----------
  section('3. Brani sospetti (molto piccoli)');
  const tiny = tracks.filter((t) => t.size < 100 * 1024 && !missingIds.has(t.id));
  out(tiny.length ? `${tiny.length} file sotto i 100 KB: quasi certamente vuoti o tagliati.` : 'Nessuno.');
  list(tiny, (t) => `${t.relPath} (${Math.round(t.size / 1024)} KB)`);

  // Elenco per album dei file da recuperare: da rippare di nuovo o ricopiare dall'originale
  {
    const bad = tracks.filter((t) => !missingIds.has(t.id) && (!t.durationMs || t.size < 100 * 1024));
    if (bad.length) {
      const byDir = new Map();
      bad.forEach((t) => { const d = path.dirname(t.relPath); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(path.basename(t.relPath)); });
      const text = [`File vuoti o incompleti da rippare di nuovo o ricopiare: ${bad.length} brani in ${byDir.size} cartelle`, '']
        .concat([...byDir.entries()].sort().flatMap(([d, names]) => [d, ...names.sort().map((n) => `    ${n}`), '']));
      fs.mkdirSync(config.dataDir, { recursive: true });
      const listPath = path.join(config.dataDir, 'da-rippare.txt');
      fs.writeFileSync(listPath, `${text.join('\n')}\n`);
      out(`  Elenco completo per cartella: ${listPath} (${bad.length} brani in ${byDir.size} cartelle)`);
    }
  }

  if (DEEP) {
    section('3b. Durata dichiarata vs durata reale (solo mp3)');
    const mp3 = tracks.filter((t) => t.format === 'mp3' && !missingIds.has(t.id));
    const cut = [];
    const broken = [];
    let done = 0;
    await mapLimit(mp3, 4, async (t) => {
      const abs = absOf(t.relPath);
      try {
        const quick = await mm.parseFile(abs, { skipCovers: true });
        const real = await mm.parseFile(abs, { duration: true, skipCovers: true });
        const a = quick.format.duration || 0;
        const b = real.format.duration || 0;
        if (a && b && a - b > 2) cut.push({ t, a, b });
      } catch (e) { broken.push({ t, why: e.message }); }
      done += 1;
      if (done % 1000 === 0) console.log(`  ...${done}/${mp3.length}`);
    });
    out(cut.length ? `${cut.length} mp3 con intestazione che promette più musica di quella presente (file tagliati):` : 'Nessun mp3 tagliato trovato.');
    list(cut, ({ t, a, b }) => `${t.relPath} - dichiarati ${a.toFixed(0)} s, reali ${b.toFixed(0)} s`);
    if (broken.length) { out(`${broken.length} mp3 illeggibili:`); list(broken, ({ t, why }) => `${t.relPath} - ${why}`); }
  } else {
    out('  Per cercare anche gli mp3 tagliati (intestazione che promette più musica di quella presente): npm run doctor -- --deep');
  }

  // ---------- 4. Copertine ----------
  section('4. Copertine degli album');
  const noCover = albums.filter((a) => !a.cover);
  const brokenCover = [];
  const hashes = new Map();
  await mapLimit(albums.filter((a) => a.cover), 16, async (a) => {
    const f = path.join(config.coversDir, `${a.id}.jpg`);
    try {
      const st = await fsp.stat(f);
      if (!st.size) { brokenCover.push({ a, why: 'file vuoto' }); return; }
      const buf = await fsp.readFile(f);
      const jpeg = buf[0] === 0xFF && buf[1] === 0xD8;
      const png = buf[0] === 0x89 && buf[1] === 0x50;
      if (!jpeg && !png) { brokenCover.push({ a, why: 'non è un JPEG/PNG (sharp non installato?)' }); return; }
      const h = crypto.createHash('md5').update(buf).digest('hex');
      if (!hashes.has(h)) hashes.set(h, []);
      hashes.get(h).push(a);
    } catch { brokenCover.push({ a, why: 'file non trovato in data/covers' }); }
  });
  out(`Con copertina: ${albums.length - noCover.length} su ${albums.length}. Senza copertina: ${noCover.length}. File danneggiati o mancanti: ${brokenCover.length}.`);
  if (config.legacyCoversDir) out(`ATTENZIONE: LEGACY_COVERS_DIR è impostata (${config.legacyCoversDir}). Le vecchie copertine si abbinano per nome e possono essere sbagliate: toglila da .env se vedi scambi.`);
  if (noCover.length) {
    out('Album senza copertina (non c\'è né un\'immagine nella cartella né una copertina nei tag dei file):');
    list(noCover, (a) => `${a.artist.name} - ${a.title} (${a._count.tracks} brani)`);
  }
  if (brokenCover.length) { out('Copertine da rifare:'); list(brokenCover, ({ a, why }) => `${a.artist.name} - ${a.title}: ${why}`); }
  const shared = [...hashes.values()].filter((g) => g.length > 1 && new Set(g.map((a) => a.artistId)).size > 1);
  out(shared.length ? `${shared.length} immagini identiche usate da artisti DIVERSI (probabili scambi o copertine generiche):` : 'Nessuna copertina identica tra artisti diversi.');
  list(shared, (g) => g.map((a) => `${a.artist.name} - ${a.title}`).join('  |  '));

  // ---------- 5. Foto artisti ----------
  section('5. Foto degli artisti');
  const withPhoto = artists.filter((a) => a.photo);
  out(`Con foto: ${withPhoto.length} su ${artists.length}.`);
  if (config.legacyArtistDir) out(`ATTENZIONE: LEGACY_ARTIST_DIR è impostata. Le foto arrivano dal vecchio archivio, abbinate solo per nome: è l'origine degli scambi (es. persona sbagliata).`);
  if (RESET_PHOTOS) {
    const r = await prisma.artist.updateMany({ where: { photo: { not: null } }, data: { photo: null } });
    let removed = 0;
    for (const f of await fsp.readdir(config.artistPhotosDir).catch(() => [])) { await fsp.unlink(path.join(config.artistPhotosDir, f)).then(() => { removed += 1; }).catch(() => {}); }
    out(`  Foto rimosse: ${r.count} artisti, ${removed} file. Ricorda di togliere LEGACY_ARTIST_DIR da server/.env, altrimenti la prossima scansione le rimette.`);
    return finish();
  }
  const photoHashes = new Map();
  await mapLimit(withPhoto, 16, async (a) => {
    try { const h = await md5File(path.join(config.artistPhotosDir, `${a.id}.jpg`)); if (!photoHashes.has(h)) photoHashes.set(h, []); photoHashes.get(h).push(a); } catch { /* foto mancante */ }
  });
  const dupPhotos = [...photoHashes.values()].filter((g) => g.length > 1);
  if (dupPhotos.length) { out(`${dupPhotos.length} foto identiche usate da più artisti:`); list(dupPhotos, (g) => g.map((a) => a.name).join('  |  ')); }

  // ---------- 6. Nomi ----------
  section('6. Nomi da controllare');
  const unknown = albums.filter((a) => /sconosciut/i.test(a.title) || /sconosciut/i.test(a.artist.name));
  out(unknown.length ? `${unknown.length} album con artista o titolo "sconosciuto" (file senza cartelle):` : 'Nessun artista o album "sconosciuto".');
  list(unknown, (a) => `${a.artist.name} - ${a.title} (${a._count.tracks} brani)`);
  const sorted = artists.map((a) => ({ ...a, k: a.key })).sort((x, y) => x.k.length - y.k.length);
  const similar = [];
  for (let i = 0; i < sorted.length && similar.length < 400; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i].k; const b = sorted[j].k;
      if (a.length >= 4 && b.length > a.length && (b.startsWith(`${a} `) || b.endsWith(` ${a}`))) similar.push([sorted[i].name, sorted[j].name]);
    }
  }
  out(similar.length ? `${similar.length} artisti con nomi molto simili (possibili doppioni, es. "Bennato" e "Eugenio Bennato"):` : 'Nessun doppione evidente tra gli artisti.');
  list(similar, ([a, b]) => `"${a}"  /  "${b}"`);

  finish();
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
