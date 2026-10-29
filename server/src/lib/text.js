// Funzioni pure per nomi, chiavi di confronto e nomi di file. Nessuna dipendenza esterna.
const path = require('path');

/** Chiave di confronto: senza maiuscole, accenti e punteggiatura, ma conserva lettere e numeri di ogni alfabeto. */
function normKey(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function cleanSpaces(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/** Se l'album inizia con "Artista - " (come "Queen - Queen II") toglie il prefisso. */
function stripArtistPrefix(album, artist) {
  const a = cleanSpaces(album);
  const idx = a.indexOf(' - ');
  if (idx > 0 && normKey(a.slice(0, idx)) === normKey(artist)) {
    const rest = cleanSpaces(a.slice(idx + 3));
    if (rest) return rest;
  }
  return a;
}

/** Numero di disco da nomi di cartella tipo "CD2", "Disc 1", "Disco 2". */
function discFromFolder(name) {
  const m = /^(?:cd|disc|disk|disco)\s*0*(\d{1,2})\b/i.exec(cleanSpaces(name));
  return m ? Number(m[1]) : null;
}

/** "03 - Titolo.mp3", "1-03 Titolo.mp3", "03. Titolo.flac" -> { discNo, trackNo, title } */
function parseTrackFile(fileName) {
  const base = cleanSpaces(path.parse(fileName).name);
  let m = /^(\d{1,2})-(\d{2})\s*[-._)]?\s+(.+)$/.exec(base);
  if (m) return { discNo: Number(m[1]), trackNo: Number(m[2]), title: cleanSpaces(m[3]) };
  m = /^(\d{1,3})\s*[-._)]\s*(.+)$/.exec(base);
  if (m) return { discNo: null, trackNo: Number(m[1]), title: cleanSpaces(m[2]) };
  return { discNo: null, trackNo: null, title: base };
}

/**
 * Ricava artista/album/disco dal percorso relativo alla cartella musica.
 *  Artista/Album/01 - x.mp3        -> artista, album
 *  Artista/Album/CD2/01 - x.mp3    -> artista, album, disco 2
 *  Artista - Album/01 - x.mp3      -> artista, album
 *  01 - x.mp3 (nella radice)       -> sconosciuti
 */
function parseRelPath(relPath) {
  const parts = relPath.split(/[\\/]/).filter(Boolean);
  const dirs = parts.slice(0, -1);
  let artist = null;
  let album = null;
  let discNo = null;
  if (dirs.length >= 2) {
    artist = dirs[0];
    album = dirs[1];
    if (dirs.length >= 3) discNo = discFromFolder(dirs[dirs.length - 1]);
  } else if (dirs.length === 1) {
    const i = dirs[0].indexOf(' - ');
    if (i > 0) {
      artist = dirs[0].slice(0, i);
      album = dirs[0].slice(i + 3);
    } else {
      artist = dirs[0];
    }
  }
  artist = cleanSpaces(artist) || 'Artista sconosciuto';
  album = stripArtistPrefix(album || 'Album sconosciuto', artist);
  return { artist, album, discNo, fileName: parts[parts.length - 1] };
}

/** Risolve un percorso relativo dentro una radice impedendo di uscirne (path traversal). */
function safeJoin(root, rel) {
  const base = path.resolve(root);
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav']);
const isAudioFile = (name) => AUDIO_EXT.has(path.extname(name).toLowerCase());

/** Anno da stringhe tipo "1989-05-02" o "1992". */
function parseYear(v) {
  if (v == null) return null;
  const m = /(\d{4})/.exec(String(v));
  const y = m ? Number(m[1]) : null;
  return y && y >= 1000 && y <= 2100 ? y : null;
}

/** Slug usato dal vecchio script Python per i nomi dei file delle cover (serve a riusarle). */
function legacySlug(...parts) {
  const raw = parts.join(' - ');
  return raw.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

/** Nome di file/cartella sicuro per qualsiasi sistema: niente caratteri vietati, spazi o punti ai bordi, lunghezza limitata. */
function safeFileName(name, max = 120) {
  const cleaned = cleanSpaces(String(name || '').normalize('NFC')
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '_'))
    .replace(/^[.\s]+|[.\s]+$/g, '');
  return cleaned.slice(0, max).replace(/[.\s]+$/g, '');
}

/** "03 - Titolo.mp3" oppure, per i dischi successivi al primo, "2-03 Titolo.mp3" (formato che lo scanner sa rileggere). */
function trackFileName({ title, trackNo, discNo, ext }) {
  const t = safeFileName(title, 100) || 'Senza titolo';
  const n = trackNo ? String(trackNo).padStart(2, '0') : null;
  let base;
  if (n && discNo && discNo > 1) base = `${discNo}-${n} ${t}`;
  else if (n) base = `${n} - ${t}`;
  else base = t;
  return `${base}.${String(ext || '').replace(/^\./, '').toLowerCase()}`;
}

module.exports = {
  safeFileName, trackFileName,
  legacySlug,
  normKey, cleanSpaces, stripArtistPrefix, discFromFolder, parseTrackFile,
  parseRelPath, safeJoin, isAudioFile, parseYear,
};
