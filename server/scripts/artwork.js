/**
 * Recupero online di copertine e foto artista, SOLO dove mancano. Servizi gratuiti e senza chiave:
 *   copertine  -> iTunes Search API (circa 20 richieste al minuto)
 *   foto       -> Deezer API
 * Si accetta un risultato solo se il nome dell'artista e quello dell'album/artista corrispondono davvero
 * (mai "il primo risultato"): meglio nessuna immagine che quella sbagliata.
 *
 *   npm run artwork -- --dry-run            mostra cosa troverebbe, senza scrivere nulla (consigliato la prima volta)
 *   npm run artwork                         scarica le copertine mancanti
 *   npm run artwork -- --artists            scarica le foto artista mancanti (con --dry-run per vederle prima)
 *   npm run artwork -- --limit 20           si ferma dopo 20 elementi (per provare)
 * Si può interrompere e rilanciare: riparte da ciò che manca ancora.
 */
const config = require('../src/config');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const prisma = require('../src/db');
const T = require('../src/lib/text');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const ARTISTS = argv.includes('--artists');
const li = argv.indexOf('--limit');
const LIMIT = li >= 0 ? Math.max(1, Number(argv[li + 1]) || 20) : Infinity;
const UA = 'MusicaPersonale/1.0 (uso privato)';

let sharp = null;
try { sharp = require('sharp'); } catch { console.warn('[artwork] "sharp" non installato: le immagini verranno salvate senza ridimensionarle.'); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      if (res.status === 429 || res.status === 403) { console.log('  (troppe richieste: aspetto 40 secondi)'); await sleep(40000); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch { await sleep(2000); }
  }
  return null;
}

async function getImage(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const jpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    const png = buf[0] === 0x89 && buf[1] === 0x50;
    return buf.length > 2000 && (jpeg || png) ? buf : null;
  } catch { return null; }
}

async function save(buf, outPath) {
  if (sharp) await sharp(buf).rotate().resize(640, 640, { fit: 'cover' }).jpeg({ quality: 82, progressive: true }).toFile(outPath);
  else await fsp.writeFile(outPath, buf);
}

/** Titolo "pulito" per il confronto: via "_" (era ":"), parentesi, "Remastered", "Deluxe", "Disc 1"... */
function cleanAlbum(title) {
  return T.normKey(String(title)
    .replace(/_/g, ' ')
    .replace(/[\[(][^\])]*[\])]/g, ' ')
    .replace(/\b(remaster(ed)?( \d{4})?|deluxe( edition)?|expanded( edition)?|anniversary edition|disc|cd)\s*\d*\b/gi, ' '));
}

function albumMatches(ours, theirs) {
  const a = cleanAlbum(ours);
  const b = cleanAlbum(theirs);
  if (!a || !b) return 0;
  if (a === b) return 2;
  // i nomi delle cartelle sono spesso tagliati a 40 caratteri: il nostro può essere l'inizio di quello ufficiale
  if (a.length >= 8 && (b.startsWith(a) || (b.length >= 8 && a.startsWith(b)))) return 1;
  return 0;
}

async function findAlbumCover(artist, title) {
  const clean = String(title).replace(/_/g, ' ').replace(/[\[(][^\])]*[\])]/g, ' ').replace(/\s+/g, ' ').trim();
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${clean}`)}&media=music&entity=album&limit=15&country=IT`;
  const data = await getJson(url);
  const results = data?.results || [];
  let best = null;
  for (const r of results) {
    if (!r.artworkUrl100 || !r.collectionName) continue;
    // l'artista deve coincidere (stesso nome, o collaborazione "X feat. Y")
    if (!T.sameArtistFamily(r.artistName || '', artist) && T.normKey(r.artistName) !== 'various artists') continue;
    const score = albumMatches(title, r.collectionName);
    if (score && (!best || score > best.score)) best = { score, name: r.collectionName, artist: r.artistName, img: r.artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/600x600bb.$1') };
  }
  return best;
}

async function findArtistPhoto(name) {
  const data = await getJson(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=8`);
  const exact = (data?.data || []).filter((a) => a.picture_xl && !/artist\/\/?(0|1000x1000-000000)/.test(a.picture_xl) && T.normKey(a.name) === T.normKey(name));
  exact.sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0));
  return exact[0] ? { name: exact[0].name, fans: exact[0].nb_fan, img: exact[0].picture_xl } : null;
}

async function main() {
  fs.mkdirSync(config.coversDir, { recursive: true });
  fs.mkdirSync(config.artistPhotosDir, { recursive: true });
  const notFound = [];
  let found = 0;
  let n = 0;

  if (!ARTISTS) {
    const albums = await prisma.album.findMany({ where: { cover: null }, select: { id: true, title: true, artist: { select: { name: true } } }, orderBy: { id: 'asc' } });
    console.log(`[artwork] ${albums.length} album senza copertina.${DRY ? ' (prova: non scrivo niente)' : ''}`);
    for (const a of albums) {
      if (n++ >= LIMIT) break;
      if (/sconosciut/i.test(a.artist.name) || /sconosciut/i.test(a.title)) { notFound.push(`${a.artist.name} - ${a.title} (nome non valido)`); continue; }
      const hit = await findAlbumCover(a.artist.name, a.title);
      if (!hit) { notFound.push(`${a.artist.name} - ${a.title}`); console.log(`  --  ${a.artist.name} - ${a.title}`); await sleep(3200); continue; }
      console.log(`  OK  ${a.artist.name} - ${a.title}  ->  ${hit.artist} - ${hit.name}${hit.score === 1 ? ' (titolo parziale)' : ''}`);
      if (!DRY) {
        const buf = await getImage(hit.img);
        if (!buf) { notFound.push(`${a.artist.name} - ${a.title} (immagine non scaricabile)`); await sleep(3200); continue; }
        try {
          await save(buf, path.join(config.coversDir, `${a.id}.jpg`));
          await prisma.album.update({ where: { id: a.id }, data: { cover: `/covers/${a.id}.jpg?v=${Date.now().toString(36)}` } });
        } catch (e) { notFound.push(`${a.artist.name} - ${a.title} (${e.message})`); continue; }
      }
      found += 1;
      await sleep(3200); // iTunes accetta circa 20 richieste al minuto
    }
  } else {
    const artists = await prisma.artist.findMany({ where: { photo: null, albums: { some: {} } }, select: { id: true, name: true }, orderBy: { id: 'asc' } });
    console.log(`[artwork] ${artists.length} artisti senza foto.${DRY ? ' (prova: non scrivo niente)' : ''}`);
    for (const a of artists) {
      if (n++ >= LIMIT) break;
      const hit = /sconosciut/i.test(a.name) ? null : await findArtistPhoto(a.name);
      if (!hit) { notFound.push(a.name); console.log(`  --  ${a.name}`); await sleep(350); continue; }
      console.log(`  OK  ${a.name}  ->  ${hit.name} (${hit.fans ?? '?'} fan)`);
      if (!DRY) {
        const buf = await getImage(hit.img);
        if (!buf) { notFound.push(`${a.name} (immagine non scaricabile)`); await sleep(350); continue; }
        try {
          await save(buf, path.join(config.artistPhotosDir, `${a.id}.jpg`));
          await prisma.artist.update({ where: { id: a.id }, data: { photo: `/artist-photos/${a.id}.jpg?v=${Date.now().toString(36)}` } });
        } catch (e) { notFound.push(`${a.name} (${e.message})`); continue; }
      }
      found += 1;
      await sleep(350);
    }
  }

  const report = path.join(config.dataDir, ARTISTS ? 'foto-artisti-non-trovate.txt' : 'copertine-non-trovate.txt');
  fs.writeFileSync(report, `${notFound.join('\n')}\n`);
  console.log(`[artwork] Trovati: ${found}. Non trovati: ${notFound.length} (elenco in ${report}).${DRY ? ' Nessun file scritto (--dry-run).' : ''}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
