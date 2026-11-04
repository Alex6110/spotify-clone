// Deezer: API pubblica, senza chiave. Serve per foto degli artisti e "artisti simili".
// Le risposte vengono tenute in una cache su file (data/deezer-cache.json) per non rifare le stesse richieste.
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { normKey } = require('./text');

const FILE = path.join(config.dataDir, 'deezer-cache.json');
const TTL = 30 * 24 * 3600 * 1000; // 30 giorni
const MISS_TTL = 2 * 24 * 3600 * 1000; // "non trovato": riprova dopo 2 giorni
const TIMEOUT = 5000;

let cache = null;
let saveTimer = null;
let downUntil = 0; // se Deezer non risponde, per qualche minuto non insistiamo

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { cache = {}; }
  if (!cache || typeof cache !== 'object') cache = {};
  return cache;
}
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(cache));
      fs.renameSync(tmp, FILE);
    } catch { /* la cache è solo un'ottimizzazione */ }
  }, 1500);
  saveTimer.unref?.();
}

const fresh = (entry) => entry && Date.now() - entry.t < (entry.v == null || (Array.isArray(entry.v) && !entry.v.length) ? MISS_TTL : TTL);

async function getJson(url) {
  if (Date.now() < downUntil) throw new Error('deezer non raggiungibile');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`deezer ${res.status}`);
    const json = await res.json();
    if (json?.error) throw new Error(`deezer: ${json.error.message || 'errore'}`);
    return json;
  } catch (e) {
    if (e.name === 'AbortError' || /fetch failed|ENOTFOUND|ECONN|EAI_AGAIN/i.test(`${e.message} ${e.cause?.code || ''}`)) downUntil = Date.now() + 5 * 60 * 1000;
    throw e;
  } finally { clearTimeout(timer); }
}

async function cached(key, fetcher) {
  const c = load();
  if (fresh(c[key])) return c[key].v;
  try {
    const v = await fetcher();
    c[key] = { t: Date.now(), v };
    save();
    return v;
  } catch {
    return c[key]?.v ?? null; // meglio un dato vecchio che niente
  }
}

// Deezer restituisce un'immagine generica quando l'artista non ha foto: la scartiamo.
const pic = (a) => {
  const u = a?.picture_big || a?.picture_xl || a?.picture_medium || '';
  return u && !/\/artist\/\/|\/images\/artist\/\//.test(u) ? u : null;
};
const slim = (a) => ({ id: a.id, name: a.name, photo: pic(a), fans: a.nb_fan ?? null });

/** Cerca un artista per nome: restituisce { id, name, photo } o null. */
async function searchArtist(name) {
  const key = `s:${normKey(name)}`;
  const v = await cached(key, async () => {
    const json = await getJson(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`);
    const want = normKey(name);
    const list = json.data || [];
    const hit = list.find((a) => normKey(a.name) === want) || list[0];
    return hit ? slim(hit) : null;
  });
  return v && normKey(v.name) && (normKey(v.name) === normKey(name) || normKey(v.name).includes(normKey(name)) || normKey(name).includes(normKey(v.name))) ? v : null;
}

/** Artisti simili (elenco di { id, name, photo }). */
async function related(deezerId) {
  const v = await cached(`r:${deezerId}`, async () => {
    const json = await getJson(`https://api.deezer.com/artist/${encodeURIComponent(deezerId)}/related?limit=20`);
    return (json.data || []).map(slim);
  });
  return v || [];
}

/** Scheda di un artista. */
async function artist(deezerId) {
  return cached(`a:${deezerId}`, async () => slim(await getJson(`https://api.deezer.com/artist/${encodeURIComponent(deezerId)}`)));
}

module.exports = { searchArtist, related, artist };
