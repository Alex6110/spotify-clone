// Accesso diretto al database SQLite dell'app (senza Prisma) + stato delle decisioni prese nello strumento.
const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..', '..');

function readEnv() {
  const env = {};
  try {
    for (const line of fs.readFileSync(path.join(SERVER_DIR, '.env'), 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* nessun .env: si usano i valori predefiniti */ }
  return { ...env, ...process.env };
}

function resolvePaths() {
  const env = readEnv();
  const dataDir = path.resolve(SERVER_DIR, env.DATA_DIR || './data');
  let dbFile = env.CURATOR_DB;
  if (!dbFile) {
    const url = env.DATABASE_URL || 'file:../data/app.db';
    const rel = url.replace(/^file:/, '');
    dbFile = path.isAbsolute(rel) ? rel : path.resolve(SERVER_DIR, 'prisma', rel); // Prisma risolve rispetto alla cartella prisma/
  }
  return { dataDir, dbFile, coversDir: path.join(dataDir, 'covers'), photosDir: path.join(dataDir, 'artist-photos') };
}

class Store {
  constructor() {
    this.paths = resolvePaths();
    let DatabaseSync;
    try { ({ DatabaseSync } = require('node:sqlite')); } catch {
      throw new Error(`Questa versione di Node (${process.version}) non ha il modulo SQLite integrato. Serve Node 22.13 o più recente (node -v).`);
    }
    if (!fs.existsSync(this.paths.dbFile)) throw new Error(`Database non trovato: ${this.paths.dbFile}`);
    this.db = new DatabaseSync(this.paths.dbFile);
    this.db.exec('PRAGMA busy_timeout = 8000');
    this.backedUp = false;
    this.stateFile = path.join(this.paths.dataDir, 'curator-state.json');
    this.state = { artists: {}, albums: {}, ignored: {} };
    try { this.state = { ...this.state, ...JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) }; } catch { /* primo avvio */ }
  }

  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  get(sql, ...args) { return this.db.prepare(sql).get(...args); }

  /** Copia di sicurezza del database prima della prima modifica di ogni avvio. */
  backup() {
    if (this.backedUp) return;
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const dest = path.join(this.paths.dataDir, `app-prima-del-curator-${stamp}.db`);
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(this.paths.dbFile, dest);
    this.backedUp = true;
    console.log(`[curator] copia di sicurezza: ${dest}`);
  }

  saveState() {
    fs.writeFileSync(`${this.stateFile}.tmp`, JSON.stringify(this.state, null, 1));
    fs.renameSync(`${this.stateFile}.tmp`, this.stateFile);
  }

  artistState(id) { return this.state.artists[id] || {}; }
  patchArtist(id, patch) { this.state.artists[id] = { ...this.state.artists[id], ...patch }; this.saveState(); }
  albumState(id) { return this.state.albums[id] || {}; }
  patchAlbum(id, patch) { this.state.albums[id] = { ...this.state.albums[id], ...patch }; this.saveState(); }
  ignoredSet(artistId) {
    const s = new Set();
    for (const k of Object.keys(this.state.ignored)) { const [a, r] = k.split(':'); if (Number(a) === artistId) s.add(r); }
    return s;
  }
  setIgnored(artistId, refId, on) {
    const k = `${artistId}:${refId}`;
    if (on) this.state.ignored[k] = true; else delete this.state.ignored[k];
    this.saveState();
  }

  // ---- letture ----
  artists() {
    return this.all(`
      SELECT a.id, a.name, a.photo,
        (SELECT count(*) FROM Album al WHERE al.artistId = a.id) AS albums,
        (SELECT count(*) FROM Track t WHERE t.artistId = a.id) AS tracks
      FROM Artist a ORDER BY a.name COLLATE NOCASE`);
  }
  artist(id) { return this.get('SELECT id, name, photo FROM Artist WHERE id = ?', id); }
  albumsOfArtist(id) {
    return this.all(`
      SELECT al.id, al.title, al.year, al.cover, count(t.id) AS n,
        coalesce(sum(CASE WHEN t.durationMs = 0 THEN 1 ELSE 0 END), 0) AS zeros,
        coalesce(sum(t.durationMs), 0) AS durationMs
      FROM Album al LEFT JOIN Track t ON t.albumId = al.id
      WHERE al.artistId = ? GROUP BY al.id ORDER BY coalesce(al.year, 9999), al.title COLLATE NOCASE`, id);
  }
  tracksOfAlbum(albumId) {
    return this.all('SELECT id, title, trackNo, discNo, durationMs, relPath, size, format FROM Track WHERE albumId = ? ORDER BY coalesce(discNo, 1), coalesce(trackNo, 999), relPath', albumId);
  }
  zeroTracks() {
    return this.all(`
      SELECT t.id, t.title, t.relPath, t.size, t.format, t.durationMs, t.albumId, al.title AS album, ar.id AS artistId, ar.name AS artist
      FROM Track t JOIN Album al ON al.id = t.albumId JOIN Artist ar ON ar.id = al.artistId
      WHERE t.durationMs = 0 ORDER BY ar.name COLLATE NOCASE, al.title COLLATE NOCASE, t.relPath`);
  }
  overview() {
    return this.get(`SELECT (SELECT count(*) FROM Artist) AS artists, (SELECT count(*) FROM Album) AS albums,
      (SELECT count(*) FROM Track) AS tracks, (SELECT count(*) FROM Track WHERE durationMs = 0) AS zeros,
      (SELECT count(*) FROM Album WHERE cover IS NULL) AS noCover, (SELECT count(*) FROM Artist WHERE photo IS NULL) AS noPhoto`);
  }

  // ---- scritture (sempre dopo la copia di sicurezza) ----
  setAlbumCover(albumId, value) { this.backup(); this.db.prepare('UPDATE Album SET cover = ? WHERE id = ?').run(value, albumId); }
  setArtistPhoto(artistId, value) { this.backup(); this.db.prepare('UPDATE Artist SET photo = ? WHERE id = ?').run(value, artistId); }
}

module.exports = { Store, resolvePaths };
