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
      if (store.state.overrides && store.state.overrides[t.relPath]) store.moveOverride(t.relPath, finalRel, store.state.overrides[t.relPath]);
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


// ---------- nomi dei file secondo la discografia ----------
/** Titolo per il nome del file: toglie le code di Deezer tipo " - Remastered 2011" o "(2011 Remaster)". */
function fileTitle(t) {
  return T.cleanSpaces(String(t || '').replace(/\s*[-–]\s*(\d{4}\s+)?remaster(ed)?(\s+\d{4})?.*$/i, '').replace(/\s*[\[(]\s*(\d{4}\s+)?remaster(ed)?(\s+\d{4})?\s*[\])]/gi, ''));
}

/**
 * Piano di ridenominazione: per ogni brano abbinato a uno della discografia, il nome "NN - Titolo.ext" corretto.
 * pairs: [{ id, relPath, refTitle, refNo, refDisc }], multiDisc: l'album ha più dischi.
 * Non tocca nulla: restituisce solo la proposta, con i conflitti segnalati.
 */
function renamePlan(store, pairs, multiDisc) {
  const root = musicRoot(store);
  const items = pairs.map((p) => {
    const title = fileTitle(p.refTitle);
    const ext = path.extname(p.relPath).slice(1);
    const dir = path.posix.dirname(p.relPath);
    const fileName = T.trackFileName({ title, trackNo: p.refNo || null, discNo: multiDisc ? p.refDisc : null, ext });
    const to = nfc(`${dir}/${fileName}`);
    return { trackId: p.id, from: p.relPath, to, title, trackNo: p.refNo || null, discNo: multiDisc ? p.refDisc : null, same: nfc(p.relPath) === to, conflict: null, curNo: p.ourNo ?? null, curDisc: p.ourDisc ?? null };
  });
  for (const it of items) it.dbOnly = it.same && (it.curNo !== it.trackNo || (multiDisc && (it.curDisc || 1) !== it.discNo));
  const count = new Map();
  for (const it of items) count.set(it.to.toLowerCase(), (count.get(it.to.toLowerCase()) || 0) + 1);
  const mine = new Set(items.map((i) => i.trackId));
  for (const it of items) {
    if (it.same) continue;
    if (count.get(it.to.toLowerCase()) > 1) it.conflict = 'due brani avrebbero lo stesso nome';
    else {
      const other = store.get('SELECT id FROM Track WHERE relPath = ? AND id != ?', it.to, it.trackId);
      const onDisk = locate(root, it.to);
      const fromAbs = locate(root, it.from);
      if (other && !mine.has(other.id)) it.conflict = 'esiste già un altro brano con questo nome';
      else if (onDisk && fromAbs && path.resolve(onDisk).toLowerCase() !== path.resolve(fromAbs).toLowerCase()) it.conflict = 'esiste già un file con questo nome';
      else if (!fromAbs) it.conflict = 'il file non esiste sul disco';
    }
  }
  return items;
}

/** Applica le ridenominazioni scelte: file sul disco + percorso/titolo/numeri nel database (l'ID resta lo stesso, quindi Mi piace e playlist sopravvivono). */
function applyRename(store, plan, onlyIds) {
  const root = musicRoot(store);
  const want = new Set(onlyIds.map(Number));
  const done = []; const skipped = [];
  store.backup();
  for (const it of plan) {
    if (!want.has(it.trackId)) continue;
    if (it.conflict || (it.same && !it.dbOnly)) { skipped.push({ trackId: it.trackId, why: it.conflict || 'già corretto' }); continue; }
    const t = store.track(it.trackId);
    if (it.same) { // il nome del file è giusto: correggo solo numero di traccia e disco
      store.run('UPDATE Track SET title = ?, titleKey = ?, trackNo = ?, discNo = COALESCE(?, discNo) WHERE id = ?', it.title, T.normKey(it.title), it.trackNo, it.discNo, it.trackId);
      store.moveOverride(t.relPath, t.relPath, { title: it.title, trackNo: it.trackNo, ...(it.discNo ? { discNo: it.discNo } : {}) });
      log(store, { op: 'renumber', trackId: it.trackId, trackNo: it.trackNo });
      done.push(it.trackId);
      continue;
    }
    const src = t && locate(root, t.relPath);
    if (!src) { skipped.push({ trackId: it.trackId, why: 'file non trovato' }); continue; }
    const dest = path.join(root, it.to);
    if (!dest.startsWith(root + path.sep)) { skipped.push({ trackId: it.trackId, why: 'percorso non valido' }); continue; }
    try {
      fs.renameSync(src, dest);
      try {
        store.run('UPDATE Track SET relPath = ?, title = ?, titleKey = ?, trackNo = ?, discNo = COALESCE(?, discNo) WHERE id = ?', it.to, it.title, T.normKey(it.title), it.trackNo, it.discNo, it.trackId);
      } catch (e) { fs.renameSync(dest, src); throw e; }
      store.moveOverride(t.relPath, it.to, { title: it.title, trackNo: it.trackNo, ...(it.discNo ? { discNo: it.discNo } : {}) });
      log(store, { op: 'rename', trackId: it.trackId, from: t.relPath, to: it.to });
      done.push(it.trackId);
    } catch (e) { skipped.push({ trackId: it.trackId, why: e.message }); }
  }
  return { done, skipped };
}

/** Modifica a mano titolo e numero di un brano: rinomina il file (NN - Titolo.ext) e aggiorna il database. L'ID resta lo stesso. */
function editTrack(store, trackId, { title, no, disc }) {
  const root = musicRoot(store);
  const t = store.track(trackId);
  if (!t) throw new Error('Brano inesistente');
  const newTitle = T.cleanSpaces(title);
  if (!newTitle) throw new Error('Il titolo non può essere vuoto');
  const trackNo = Number(no) > 0 ? Number(no) : null;
  const discNo = Number(disc) > 0 ? Number(disc) : (t.discNo || 1);
  const ext = path.extname(t.relPath).slice(1);
  const dir = path.posix.dirname(t.relPath);
  const to = nfc(`${dir}/${T.trackFileName({ title: newTitle, trackNo, discNo: discNo > 1 ? discNo : null, ext })}`);
  const src = locate(root, t.relPath);
  if (!src) throw new Error(`Il file non esiste sul disco: ${t.relPath}`);
  store.backup();
  if (nfc(t.relPath) !== to) {
    if (store.get('SELECT id FROM Track WHERE relPath = ? AND id != ?', to, trackId)) throw new Error('Esiste già un brano con questo nome in questa cartella');
    const dest = path.join(root, to);
    const existing = locate(root, to);
    if (existing && path.resolve(existing).toLowerCase() !== path.resolve(src).toLowerCase()) throw new Error('Esiste già un file con questo nome');
    fs.renameSync(src, dest);
    try { store.run('UPDATE Track SET relPath = ?, title = ?, titleKey = ?, trackNo = ?, discNo = ? WHERE id = ?', to, newTitle, T.normKey(newTitle), trackNo, discNo, trackId); }
    catch (e) { fs.renameSync(dest, src); throw e; }
  } else {
    store.run('UPDATE Track SET title = ?, titleKey = ?, trackNo = ?, discNo = ? WHERE id = ?', newTitle, T.normKey(newTitle), trackNo, discNo, trackId);
  }
  store.moveOverride(t.relPath, to, { title: newTitle, trackNo, discNo });
  log(store, { op: 'edit', trackId, from: t.relPath, to, title: newTitle, trackNo });
  return { relPath: to, title: newTitle, trackNo };
}

// ---------- nuovi file dal computer ----------
let mm = null;
async function readTags(file) {
  try {
    mm = mm || await import('music-metadata');
    const md = await mm.parseFile(file, { duration: true });
    return { durationMs: md.format?.duration ? Math.round(md.format.duration * 1000) : 0, bitrate: md.format?.bitrate ? Math.round(md.format.bitrate / 1000) : null };
  } catch { return { durationMs: 0, bitrate: null, noTags: true }; }
}

/** Mette un file (già copiato in una cartella temporanea dentro MUSIC_DIR) in un album col nome giusto e lo registra nel database. */
async function addFile(store, albumId, tmpAbs, origName, slot) {
  const root = musicRoot(store);
  const ext = path.extname(origName || '').toLowerCase();
  if (!T.isAudioFile(`x${ext}`)) throw new Error(`Formato non supportato (${ext || 'senza estensione'}): usa mp3, flac, m4a, aac, ogg, opus o wav`);
  const album = store.get('SELECT * FROM Album WHERE id = ?', albumId);
  if (!album) throw new Error('Album inesistente');
  const artist = store.get('SELECT id, name FROM Artist WHERE id = ?', album.artistId);
  const title = fileTitle(slot.title) || T.cleanSpaces(path.parse(origName).name);
  const trackNo = Number(slot.no) || null;
  const discNo = Number(slot.disc) > 1 ? Number(slot.disc) : null; // nel nome del file solo dal disco 2
  const dbDisc = discNo || 1;
  const dir = destDirFor(store, album, artist, -1);
  const fileName = T.trackFileName({ title, trackNo, discNo, ext });
  const destRel = nfc(`${dir}/${fileName}`);
  if (store.get('SELECT id FROM Track WHERE relPath = ?', destRel)) throw new Error(`Esiste già un brano con questo nome: ${destRel}`);
  const destAbs = path.join(root, destRel);
  if (!destAbs.startsWith(root + path.sep)) throw new Error('Percorso di destinazione non valido');
  if (fs.existsSync(destAbs)) throw new Error(`Esiste già un file con questo nome: ${destRel}`);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.renameSync(tmpAbs, destAbs);
  const st = fs.statSync(destAbs);
  const tags = await readTags(destAbs);
  store.backup();
  try {
    store.run(`INSERT INTO Track (title, titleKey, relPath, trackNo, discNo, durationMs, format, bitrate, size, mtimeMs, albumId, artistId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      title, T.normKey(title), destRel, trackNo, dbDisc, tags.durationMs, ext.slice(1), tags.bitrate, st.size, st.mtimeMs, albumId, album.artistId);
  } catch (e) { try { fs.renameSync(destAbs, tmpAbs); } catch { /* il file resta nella cartella temporanea */ } throw e; }
  store.moveOverride(null, destRel, { title, trackNo, ...(discNo ? { discNo } : {}) });
  log(store, { op: 'add', albumId, to: destRel, original: origName });
  return { relPath: destRel, durationMs: tags.durationMs, noTags: !!tags.noTags };
}

// ---------- artisti: pulizia ----------
/** Artisti senza nessun album: spesso frammenti di nomi ("AC" da "AC/DC") o ospiti di featuring. */
function artistsWithoutAlbums(store) {
  const rows = store.all(`SELECT a.id, a.name, a.photo, (SELECT count(*) FROM Track t WHERE t.artistId = a.id) AS tracks
    FROM Artist a WHERE NOT EXISTS (SELECT 1 FROM Album al WHERE al.artistId = a.id) ORDER BY a.name COLLATE NOCASE`);
  for (const r of rows) {
    r.under = r.tracks ? store.all(`SELECT ar.id, ar.name, count(*) AS n FROM Track t JOIN Album al ON al.id = t.albumId JOIN Artist ar ON ar.id = al.artistId
      WHERE t.artistId = ? GROUP BY ar.id ORDER BY n DESC LIMIT 4`, r.id) : [];
    r.fragment = r.under.some((u) => T.sameArtistFamily(u.name, r.name));
  }
  return rows;
}
/** I brani tornano all'artista dell'album in cui stanno; se l'artista resta vuoto viene eliminato. */
function foldArtist(store, artistId) {
  if (!store.artist(artistId)) throw new Error('Artista inesistente');
  store.backup();
  return store.tx(() => {
    const moved = store.run('UPDATE Track SET artistId = (SELECT al.artistId FROM Album al WHERE al.id = Track.albumId) WHERE artistId = ?', artistId).changes;
    const left = store.get('SELECT (SELECT count(*) FROM Album WHERE artistId = ?) AS a, (SELECT count(*) FROM Track WHERE artistId = ?) AS t', artistId, artistId);
    let removed = false;
    if (!left.a && !left.t) { store.run('DELETE FROM Artist WHERE id = ?', artistId); removed = true; }
    log(store, { op: 'fold-artist', artistId, moved: Number(moved), removed });
    return { moved: Number(moved), removed };
  });
}
function deleteArtist(store, artistId) {
  const left = store.get('SELECT (SELECT count(*) FROM Album WHERE artistId = ?) AS a, (SELECT count(*) FROM Track WHERE artistId = ?) AS t', artistId, artistId);
  if (left.a || left.t) throw new Error('L\'artista ha ancora album o brani: usa "Riporta i brani" oppure spostali prima');
  store.backup();
  store.run('DELETE FROM Artist WHERE id = ?', artistId);
  log(store, { op: 'delete-artist', artistId });
}
/** Cambia il nome mostrato (la chiave di confronto resta uguale se cambia solo la punteggiatura, es. "AC:DC" -> "AC/DC"). */
function renameArtist(store, artistId, name) {
  const clean = T.cleanSpaces(name);
  if (!clean) throw new Error('Scrivi il nome');
  const key = T.normKey(clean);
  const other = store.get('SELECT id, name FROM Artist WHERE key = ? AND id != ?', key, artistId);
  if (other) throw new Error(`Esiste già un artista "${other.name}" con questo nome: unisci invece i due artisti spostando i brani`);
  store.backup();
  store.run('UPDATE Artist SET name = ?, key = ? WHERE id = ?', clean, key, artistId);
  log(store, { op: 'rename-artist', artistId, name: clean });
}

// ---------- file da una cartella del Mac (spostati, non solo copiati) ----------
const os = require('os');
function expand(p) { return path.resolve(String(p || '').trim().replace(/^~(?=\/|$)/, os.homedir())); }
function allowedSource(abs) {
  const extra = (process.env.CURATOR_ALLOW || '').split(':').filter(Boolean);
  return [os.homedir(), '/Volumes', ...extra].some((r) => abs === r || abs.startsWith(r + path.sep));
}
function listDir(store, dir) {
  const abs = expand(dir);
  if (!allowedSource(abs)) throw new Error('Per sicurezza posso leggere solo cartelle nella tua cartella utente o nei dischi collegati (/Volumes)');
  const root = store.paths.musicDir;
  if (root && (abs === root || abs.startsWith(root + path.sep))) throw new Error('Questa è la cartella della libreria: scegli una cartella con i file nuovi');
  let st; try { st = fs.statSync(abs); } catch { throw new Error('Cartella non trovata'); }
  if (!st.isDirectory()) throw new Error('Non è una cartella');
  const out = [];
  const walk = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory() && depth < 2) walk(full, depth + 1);
      else if (e.isFile() && T.isAudioFile(e.name) && out.length < 400) out.push({ path: full, name: e.name, rel: path.relative(abs, full), size: fs.statSync(full).size });
    }
  };
  walk(abs, 0);
  out.sort((a, b) => a.rel.localeCompare(b.rel, 'it', { numeric: true }));
  return { dir: abs, files: out };
}
/** Copia il file nella libreria col nome giusto e, se move=true, cancella l'originale solo dopo che tutto è andato a buon fine. */
async function addFromPath(store, albumId, srcPath, slot, move) {
  const root = musicRoot(store);
  const src = expand(srcPath);
  if (!allowedSource(src) || src.startsWith(root + path.sep)) throw new Error('File non consentito');
  const st = fs.statSync(src);
  if (!st.isFile() || !T.isAudioFile(src)) throw new Error('Non è un file audio');
  const tmpDir = path.join(root, '.incoming');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, `curator-${Date.now()}-${Math.random().toString(36).slice(2)}.part`);
  fs.copyFileSync(src, tmp);
  if (fs.statSync(tmp).size !== st.size) { fs.rmSync(tmp, { force: true }); throw new Error('Copia incompleta, originale non toccato'); }
  let r;
  try { r = await addFile(store, albumId, tmp, path.basename(src), slot); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
  let moved = false;
  if (move) { try { fs.unlinkSync(src); moved = true; log(store, { op: 'move-source', from: src, to: r.relPath }); } catch { /* resta anche l'originale */ } }
  return { ...r, moved };
}

module.exports = { editTrack, artistsWithoutAlbums, foldArtist, deleteArtist, renameArtist, listDir, addFromPath, moveTrack, removeTrack, setTrackArtist, fileTitle, renamePlan, applyRename, addFile, musicRoot };
