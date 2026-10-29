// Decide dove va archiviato un brano caricato: Artista/Album/NN - Titolo.ext dentro MUSIC_DIR.
// Se l'artista o l'album esistono già (anche scritti in modo diverso: "AC/DC" e "ac dc") usa le loro cartelle,
// altrimenti le crea. La struttura è la stessa che lo scanner sa leggere (vedi parseRelPath in text.js).
const T = require('./text');

const first = (v) => (Array.isArray(v) ? v[0] : v);

/** Estrae da music-metadata solo ciò che serve. */
function summarizeTags(md) {
  const c = md?.common || {};
  return {
    title: T.cleanSpaces(c.title || ''),
    artist: T.cleanSpaces(first(c.artists) || c.artist || ''),
    albumArtist: T.cleanSpaces(c.albumartist || ''),
    album: T.cleanSpaces(c.album || ''),
    trackNo: c.track?.no || null,
    discNo: c.disk?.no || null,
    discOf: c.disk?.of || null,
    year: T.parseYear(c.year ?? c.date),
    duration: md?.format?.duration || 0,
  };
}

/**
 * @param {object} p
 *  tags: summarizeTags(...); hint: { artist, album } da cartelle o scelte dell'utente (hanno la precedenza); fileName: nome originale
 *  db: { findArtistByKey(key), findAlbumFolder(artistId, albumKey) } (iniettato per poter testare senza database)
 * @returns {{ dir: string, fileName: string, artist: string, album: string, title: string, artistIsNew: boolean, albumIsNew: boolean }}
 */
async function planDestination({ tags, hint = {}, fileName, ext, db }) {
  const fromName = T.parseTrackFile(fileName);
  const artistName = T.cleanSpaces(hint.artist) || tags.albumArtist || tags.artist || 'Artista sconosciuto';
  const rawAlbum = T.cleanSpaces(hint.album) || tags.album || 'Album sconosciuto';
  const albumName = T.stripArtistPrefix(rawAlbum, artistName);
  const title = tags.title || fromName.title;
  const trackNo = tags.trackNo || fromName.trackNo || null;
  const discNo = tags.discNo || fromName.discNo || null;

  const artist = await db.findArtistByKey(T.normKey(artistName) || 'sconosciuto');
  const artistFolder = T.safeFileName(artist?.name || artistName) || 'Artista sconosciuto';

  let dir = null;
  let albumIsNew = true;
  if (artist) {
    const existingDir = await db.findAlbumFolder(artist.id, T.normKey(albumName) || 'sconosciuto');
    if (existingDir) { dir = existingDir; albumIsNew = false; }
  }
  if (!dir) dir = `${artistFolder}/${T.safeFileName(albumName) || 'Album sconosciuto'}`;

  return {
    dir,
    fileName: T.trackFileName({ title, trackNo, discNo, ext }),
    artist: artist?.name || artistName,
    album: albumName,
    title,
    artistIsNew: !artist,
    albumIsNew,
  };
}

module.exports = { summarizeTags, planDestination };
