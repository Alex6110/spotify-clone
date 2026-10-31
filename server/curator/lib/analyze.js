// Mette insieme database, Deezer e regole di confronto. Una funzione per artista, una per tutti.
const fs = require('fs');
const path = require('path');
const M = require('./match');
const { downloadImage } = require('./deezer');
const images = require('./images');

class Analyzer {
  constructor(store, deezer) { this.store = store; this.dz = deezer; }

  /** Il Deezer ID dell'artista: scelto da noi, oppure (se il nome coincide esattamente) quello con più fan. */
  async refArtist(artist, network) {
    const st = this.store.artistState(artist.id);
    const list = await this.dz.searchArtist(artist.name, network);
    if (st.ref) return { id: st.ref, manual: true, info: (list || []).find((c) => c.id === st.ref) || null, candidates: list || [] };
    if (!list) return { id: null, candidates: [] };
    const exact = list.filter((c) => M.norm(c.name) === M.norm(artist.name)).sort((a, b) => b.fans - a.fans);
    return { id: exact[0]?.id || null, manual: false, info: exact[0] || null, candidates: list };
  }

  coverFile(album) {
    if (!album.cover) return null;
    const rel = String(album.cover).split('?')[0];
    const f = path.join(this.store.paths.dataDir, rel.replace(/^\//, ''));
    return fs.existsSync(f) ? f : null;
  }

  /** Impronta della copertina nostra (in cache finché il file non cambia) e di quella di riferimento. */
  async ownHash(album, network) {
    const f = this.coverFile(album);
    if (!f || !images.hasSharp()) return null;
    const st = fs.statSync(f);
    const key = `ho:${album.id}:${st.size}:${Math.round(st.mtimeMs)}`;
    if (this.dz.has(key)) return this.dz.peek(key);
    if (!network) return undefined;
    const h = await images.dhash(f);
    this.dz.put(key, h);
    return h;
  }
  async refHash(url, network) {
    if (!url || !images.hasSharp()) return null;
    const key = `hr:${url}`;
    if (this.dz.has(key)) return this.dz.peek(key);
    if (!network) return undefined;
    const buf = await downloadImage(url);
    const h = buf ? await images.dhash(buf) : null;
    this.dz.put(key, h);
    return h;
  }

  /**
   * Analisi completa di un artista.
   * opts.network: false = usa solo la cache (veloce, per le pagine riassuntive); opts.covers: calcola anche il confronto delle copertine.
   */
  async artist(artistId, { network = true, covers = false, thr = 8 } = {}) {
    const artist = this.store.artist(artistId);
    if (!artist) return null;
    const owned = this.store.albumsOfArtist(artistId);
    const ref = await this.refArtist(artist, network);
    const refAlbums = ref.id ? (await this.dz.artistAlbums(ref.id, network)) || null : null;
    const result = {
      artist: { ...artist, state: this.store.artistState(artistId) },
      ref: ref.id ? { id: ref.id, manual: !!ref.manual, info: ref.info } : null,
      candidates: ref.candidates,
      cached: !!refAlbums,
      albums: [], missing: [], stats: { zeros: 0, durationIssues: 0, coverIssues: 0, missingAlbums: 0, missingTracks: 0 },
    };
    const overrides = {};
    for (const o of owned) { const s = this.store.albumState(o.id); if (s.ref != null) overrides[o.id] = s.ref; }
    const matches = refAlbums ? M.matchAlbums(owned, refAlbums, overrides) : new Map();

    for (const o of owned) {
      const st = this.store.albumState(o.id);
      const m = matches.get(o.id) || null;
      const row = { id: o.id, title: o.title, year: o.year, cover: o.cover, n: o.n, zeros: o.zeros, state: st, ref: null, tracks: null, coverDist: null };
      result.stats.zeros += o.zeros;
      if (m) {
        row.ref = { id: m.ref.id, title: m.ref.title, type: m.ref.type, date: m.ref.date, cover: m.ref.cover, thumb: m.ref.thumb, manual: !!m.manual, score: m.score };
        const refTracks = await this.dz.albumTracks(m.ref.id, network);
        if (refTracks) {
          const ours = this.store.tracksOfAlbum(o.id);
          const tm = M.matchTracks(ours, refTracks);
          const pairs = tm.pairs.map((p) => {
            const d = p.ours.durationMs > 0 ? M.durationDiff(p.ours.durationMs, p.ref.d, thr) : { diff: null, bad: false };
            return { id: p.ours.id, title: p.ours.title, ms: p.ours.durationMs, refTitle: p.ref.t, refSec: p.ref.d, diff: d.diff, bad: d.bad, zero: p.ours.durationMs === 0, relPath: p.ours.relPath };
          });
          row.tracks = {
            ref: refTracks.length, pairs,
            extra: tm.extra.map((t) => ({ id: t.id, title: t.title, ms: t.durationMs })),
            missing: tm.missing.map((t) => ({ title: t.t, sec: t.d, no: t.p, disc: t.disc })),
          };
          result.stats.durationIssues += pairs.filter((p) => p.bad).length;
          result.stats.missingTracks += tm.missing.length;
        }
        if (covers && m.ref.thumb) {
          const [a, b] = [await this.ownHash(o, network), await this.refHash(m.ref.thumb, network)];
          if (a && b) row.coverDist = M.hashDistance(a, b);
        } else if (!network && m.ref.thumb) {
          const [a, b] = [await this.ownHash(o, false), await this.refHash(m.ref.thumb, false)];
          if (a && b) row.coverDist = M.hashDistance(a, b);
        }
        if (row.coverDist != null && row.coverDist > 16) result.stats.coverIssues += 1;
      }
      result.albums.push(row);
    }
    if (refAlbums) {
      result.missing = M.missingAlbums(owned, refAlbums, matches, this.store.ignoredSet(artistId));
      result.allRefAlbums = refAlbums.map((r) => ({ id: r.id, title: r.title, type: r.type, date: r.date }));
      result.stats.missingAlbums = result.missing.filter((r) => r.type === 'album' || r.type === 'ep').length;
    }
    return result;
  }

  /** Esegue l'analisi su tutti gli artisti: con network=false è istantanea e usa solo ciò che è già in cache. */
  async all({ network = false, covers = false, thr = 8, onProgress, shouldStop } = {}) {
    const list = this.store.artists().filter((a) => a.albums > 0);
    const out = [];
    let i = 0;
    for (const a of list) {
      if (shouldStop && shouldStop()) break;
      const r = await this.artist(a.id, { network, covers, thr });
      if (r) out.push(r);
      if (onProgress) onProgress(++i, list.length, a.name);
    }
    return out;
  }
}

module.exports = { Analyzer };
