// Modifiche ai brani: sposta un file in un altro album (sul disco E nel database) o toglilo dall'archivio.
// Nessun file viene mai cancellato: "rimuovi" lo sposta in MUSIC_DIR/.cestino (cartella ignorata dalla scansione).
const fs = require('fs');
const path = require('path');
const T = require('../../src/lib/text');

const nfc = (s) => s.normalize('NFC');

function musicRoot(store) {
  const root = store.paths.musicDir;
  if (!root) throw new Error('MUSIC_DIR non impostata in server/.env');
  if (!fs.existsSync(root)) throw new Error(`Non trovo la cartella della musica (${root}): il disco è collegato?`);
  return root;
}
/** Percorso reale di un brano: su macOS i nomi possono essere salvati con accenti scomposti (NFD). */
function locate(root, relPath) {
  for (const rel of [relPath, relPath.normalize('NFD')]) {
    const abs = path.join(root, rel);
    if (abs.startsWith(root + path.sep) && fs.existsSync(abs)) return abs;
  }
  return null;
}
function uniquePath(abs) {
  if (!fs.existsSync(abs)) return abs;
  const { dir, name, ext } = path.parse(abs);
  for (let i = 2; i < 100; i++) { const c = path.join(dir, `${name} (${i})${ext}`); if (!fs.existsSync(c)) return c; }
  throw new Error('Esistono già troppi file con lo stesso nome');
}
function log(store, entry) {
  try { fs.appendFileSync(path.join(store.paths.dataDir, 'curator-log.txt'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`); } catch { /* il log non deve bloccare */ }
}
/** Toglie le cartelle rimaste vuote (anche se contengono solo .DS_Store). */
function pruneEmptyDirs(root, dir) {
  while (dir.startsWith(root + path.sep)) {
    let names;
    try { names = fs.readdirSync(dir); } catch { return; }
    if (names.some((n) => n !== '.DS_Store')) return;
    try { for (const n of names) fs.unlinkSync(path.join(dir, n)); fs.rmdirSync(dir); } catch { return; }
    dir = path.dirname(dir);
  }
}
/** Come Prisma salva le date: lo copiamo da una riga esistente (numero in ms oppure testo ISO). */
function nowLike(store) {
  const r = store.get('SELECT typeof(addedAt) AS t FROM Album WHERE addedAt IS NOT NULL LIMIT 1');
  return r && r.t === 'text' ? new Date().toISOString() : Date.now();
}

/** Cartella di destinazione: quella dei brani già presenti nell'album, altrimenti Artista/Album. */
function destDirFor(store, album, artist, excludeTrackId) {
  const sibling = store.get('SELECT relPath FROM Track WHERE albumId = ? AND id != ? LIMIT 1', album.id, excludeTrackId);
  if (sibling) return path.posix.dirname(sibling.relPath);
  const any = store.get('SELECT relPath FROM Track WHERE artistId = ? AND id != ? LIMIT 1', artist.id, excludeTrackId)
    || store.get('SELECT t.relPath FROM Track t JOIN Album a ON a.id = t.albumId WHERE a.artistId = ? AND t.id != ? LIMIT 1', artist.id, excludeTrackId);
  const artistFolder = any ? any.relPath.split('/')[0] : T.safeFileName(artist.name) || 'Artista sconosciuto';
  return `${artistFolder}/${T.safeFileName(album.title) || 'Album sconosciuto'}`;
}

function dropAlbumIfEmpty(store, albumId) {
  const n = store.get('SELECT count(*) AS n FROM Track WHERE albumId = ?', albumId).n;
  if (n === 0) store.run('DELETE FROM Album WHERE id = ?', albumId);
  return n === 0;
}

/** target: { albumId } oppure { title, artistId } per creare un album nuovo. */
function moveTrack(store, trackId, target) {
  const root = musicRoot(store);
  const t = store.track(trackId);
  if (!t) throw new Error('Brano inesistente');
  const src = locate(root, t.relPath);
  if (!src) throw new Error(`Il file non esiste sul disco: ${t.relPath}`);

  let album;
  if (target.albumId) {
    album = store.get('SELECT * FROM Album WHERE id = ?', target.albumId);
    if (!album) throw new Error('Album di destinazione inesistente');
  } else {
    const title = T.cleanSpaces(target.title);
    if (!title) throw new Error('Scrivi il titolo del nuovo album');
    const artistId = Number(target.artistId) || t.albumArtistId;
    album = store.get('SELECT * FROM Album WHERE artistId = ? AND key = ?', artistId, T.normKey(title)) || { id: null, title, key: T.normKey(title), artistId };
  }
  const artist = store.get('SELECT id, name FROM Artist WHERE id = ?', album.artistId);
  if (album.id === t.albumId) throw new Error('Il brano è già in questo album');

  const destRel = nfc(`${destDirFor(store, album, artist, t.id)}/${path.posix.basename(t.relPath)}`);
  const destAbs = uniquePath(path.join(root, destRel));
  if (!destAbs.startsWith(root + path.sep)) throw new Error('Percorso di destinazione non valido');
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.renameSync(src, destAbs);
  const finalRel = nfc(path.relative(root, destAbs).split(path.sep).join('/'));

  store.backup();
  try {
    store.tx(() => {
      let albumId = album.id;
      if (!albumId) {
        store.run('INSERT INTO Album (title, key, artistId, addedAt) VALUES (?, ?, ?, ?)', album.title, album.key, album.artistId, nowLike(store));
        albumId = store.get('SELECT id FROM Album WHERE artistId = ? AND key = ?', album.artistId, album.key).id;
      }
      // se il brano "apparteneva" all'artista del vecchio album segue il nuovo; un featuring resta com'è
      const newArtistId = t.artistId === t.albumArtistId ? album.artistId : t.artistId;
      store.run('UPDATE Track SET relPath = ?, albumId = ?, artistId = ? WHERE id = ?', finalRel, albumId, newArtistId, t.id);
      dropAlbumIfEmpty(store, t.albumId);
      album.id = albumId;
    });
  } catch (e) { // database non aggiornato: rimetto il file dov'era
    try { fs.renameSync(destAbs, src); } catch { /* nulla da fare */ }
    throw e;
  }
  pruneEmptyDirs(root, path.dirname(src));
  log(store, { op: 'move', trackId: t.id, from: t.relPath, to: finalRel, fromAlbumId: t.albumId, toAlbumId: album.id });
  return { relPath: finalRel, albumId: album.id };
}

/** Toglie il brano dall'archivio: file in .cestino, righe del database cancellate (compresi Mi piace e playlist). */
function removeTrack(store, trackId) {
  const root = musicRoot(store);
  const t = store.track(trackId);
  if (!t) throw new Error('Brano inesistente');
  const src = locate(root, t.relPath);
  let trashRel = null;
  if (src) {
    const destAbs = uniquePath(path.join(root, '.cestino', nfc(t.relPath)));
    fs.mkdirSync(path.dirname(destAbs), { recursive: true });
    fs.renameSync(src, destAbs);
    trashRel = path.relative(root, destAbs).split(path.sep).join('/');
  }
  store.backup();
  store.tx(() => {
    store.run('DELETE FROM Track WHERE id = ?', t.id);
    dropAlbumIfEmpty(store, t.albumId);
  });
  if (src) pruneEmptyDirs(root, path.dirname(src));
  log(store, { op: 'remove', trackId: t.id, from: t.relPath, to: trashRel, title: t.title, albumId: t.albumId });
  return { trash: trashRel };
}

/** Artista del brano (per i featuring): cambia solo il database, il file resta dov'è. Crea l'artista se non esiste. */
function setTrackArtist(store, trackId, name) {
  const t = store.track(trackId);
  if (!t) throw new Error('Brano inesistente');
  const clean = T.cleanSpaces(name);
  if (!clean) throw new Error('Scrivi il nome dell\'artista');
  const key = T.normKey(clean);
  store.backup();
  return store.tx(() => {
    let a = store.get('SELECT id, name FROM Artist WHERE key = ?', key);
    if (!a) { store.run('INSERT INTO Artist (name, key) VALUES (?, ?)', clean, key); a = store.get('SELECT id, name FROM Artist WHERE key = ?', key); }
    store.run('UPDATE Track SET artistId = ? WHERE id = ?', a.id, t.id);
    log(store, { op: 'artist', trackId: t.id, artistId: a.id, name: a.name });
    return a;
  });
}

module.exports = { moveTrack, removeTrack, setTrackArtist };
