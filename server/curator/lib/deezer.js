// Client Deezer (API pubblica, senza chiave) con coda a velocità limitata e cache su disco.
// Nella cache salviamo solo i campi che servono, così il file resta piccolo.
const fs = require('fs');

const EMPTY_IMG = /\/images\/(artist|cover)\/\//; // Deezer usa un'immagine vuota quando non ne ha una vera

class Deezer {
  constructor({ base = 'https://api.deezer.com', cacheFile, minIntervalMs = 180 } = {}) {
    this.base = base.replace(/\/$/, '');
    this.cacheFile = cacheFile;
    this.minInterval = minIntervalMs;
    this.cache = {};
    this.last = 0;
    this.queue = Promise.resolve();
    this.requests = 0;
    this.saveTimer = null;
    try { if (cacheFile && fs.existsSync(cacheFile)) this.cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { this.cache = {}; }
  }

  has(key) { return key in this.cache; }
  peek(key) { return this.cache[key]; }
  put(key, value) {
    this.cache[key] = value;
    if (!this.cacheFile || this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.flush(); }, 3000);
  }
  flush() {
    if (!this.cacheFile) return;
    try { fs.writeFileSync(`${this.cacheFile}.tmp`, JSON.stringify(this.cache)); fs.renameSync(`${this.cacheFile}.tmp`, this.cacheFile); } catch (e) { console.warn('[curator] cache non salvata:', e.message); }
  }

  /** Una richiesta alla volta, con pausa tra l'una e l'altra; riprova se Deezer dice "troppe richieste". */
  raw(pathname) {
    const run = async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const wait = this.last + this.minInterval - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        this.last = Date.now();
        this.requests += 1;
        let data;
        try {
          const res = await fetch(`${this.base}${pathname}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
          data = await res.json();
        } catch (e) {
          if (attempt === 3) throw new Error(`Deezer non raggiungibile (${e.message})`);
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        if (data && data.error) {
          if (data.error.code === 4 || data.error.code === 700) { await new Promise((r) => setTimeout(r, 5000)); continue; } // quota
          if (data.error.code === 800) return null; // non trovato
          throw new Error(`Deezer: ${data.error.message || data.error.code}`);
        }
        return data;
      }
      throw new Error('Deezer: troppe richieste, riprova tra poco');
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async cached(key, network, fetcher) {
    if (this.has(key)) return this.cache[key];
    if (!network) return undefined;
    const v = await fetcher();
    this.put(key, v);
    return v;
  }

  searchArtist(name, network = true) {
    return this.cached(`sa:${name.toLowerCase()}`, network, async () => {
      const d = await this.raw(`/search/artist?q=${encodeURIComponent(name)}&limit=8`);
      return (d?.data || []).map((a) => ({
        id: a.id, name: a.name, fans: a.nb_fan || 0, albums: a.nb_album || 0,
        picture: a.picture_xl && !EMPTY_IMG.test(a.picture_xl) ? a.picture_xl : null,
      }));
    });
  }

  artistAlbums(id, network = true) {
    return this.cached(`aa:${id}`, network, async () => {
      const out = [];
      for (let index = 0; index < 500; index += 100) {
        const d = await this.raw(`/artist/${id}/albums?limit=100&index=${index}`);
        for (const a of d?.data || []) {
          out.push({
            id: a.id, title: a.title, type: a.record_type || 'album', date: a.release_date || '',
            cover: a.cover_xl && !EMPTY_IMG.test(a.cover_xl) ? a.cover_xl : null,
            thumb: a.cover_medium && !EMPTY_IMG.test(a.cover_medium) ? a.cover_medium : null,
          });
        }
        if (!d?.next) break;
      }
      return out;
    });
  }

  albumTracks(id, network = true) {
    return this.cached(`at:${id}`, network, async () => {
      const d = await this.raw(`/album/${id}/tracks?limit=200`);
      return (d?.data || []).map((t) => ({ t: t.title, d: t.duration || 0, p: t.track_position || 0, disc: t.disk_number || 1 }));
    });
  }
}

/** Scarica un'immagine (con limite di dimensione). Restituisce un Buffer o null. */
async function downloadImage(url, { maxBytes = 15 * 1024 * 1024 } = {}) {
  if (!/^https?:\/\//i.test(url) || EMPTY_IMG.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length && buf.length <= maxBytes ? buf : null;
  } catch { return null; }
}

module.exports = { Deezer, downloadImage };
