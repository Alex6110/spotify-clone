// Funzioni pure per confrontare i nostri album/brani con la discografia di riferimento. Nessuna rete, nessun database.

function norm(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const NOISE_WORDS = /\b(remaster(ed)?( \d{4})?|deluxe( edition)?|expanded( edition)?|anniversary( edition)?|special edition|collector'?s edition|platinum edition|bonus( tracks?)?|disc|cd)\s*\d*\b/gi;

/** Titolo album "pulito": via "_" (era ":"), parentesi, parole come Remastered/Deluxe/Disc 1. */
function cleanAlbum(title) {
  return norm(String(title || '')
    .replace(/_/g, ' ')
    .replace(/[\[(][^\])]*[\])]/g, ' ')
    .replace(NOISE_WORDS, ' '));
}

/** Titolo brano "pulito": via parentesi e code tipo " - Remastered 2011", " - Live at ...". */
function cleanTrack(title) {
  let t = String(title || '').replace(/_/g, ' ').replace(/[\[(][^\])]*[\])]/g, ' ');
  t = t.replace(/\s+-\s+(remaster(ed)?|live|mono|stereo|single|album|radio|edit|version|demo|bonus|\d{4}).*$/i, ' ');
  return norm(t);
}

const STOP = new Set(['the', 'of', 'and', 'a', 'il', 'la', 'le', 'lo', 'di', 'e', 'live', 'best', 'vol', 'volume', 'greatest', 'hits']);
function tokens(clean) {
  return new Set(clean.split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)));
}
function similarity(cleanA, cleanB) {
  const A = tokens(cleanA), B = tokens(cleanB);
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common += 1;
  return common / Math.max(A.size, B.size);
}

/** Quanto due titoli album si somigliano: 3 = uguali, 2 = uno è l'inizio dell'altro (cartelle tagliate), altrimenti 0..1 per parole in comune. */
function albumScore(ours, theirs) {
  const a = cleanAlbum(ours), b = cleanAlbum(theirs);
  if (!a || !b) return 0;
  if (a === b) return 3;
  if (a.length >= 8 && (b.startsWith(a) || (b.length >= 8 && a.startsWith(b)))) return 2;
  return similarity(a, b);
}
const GOOD = 0.8; // soglia: sopra questo valore consideriamo lo stesso album

/** Abbina ogni nostro album a un album di riferimento. overrides: { [ownedId]: refId | -1 (nessuno) }. */
function matchAlbums(owned, refs, overrides = {}) {
  const byId = new Map(refs.map((r) => [String(r.id), r]));
  const out = new Map();
  for (const o of owned) {
    const ov = overrides[o.id];
    if (ov === -1) { out.set(o.id, null); continue; }
    if (ov != null && byId.has(String(ov))) { out.set(o.id, { ref: byId.get(String(ov)), score: 99, manual: true }); continue; }
    let best = null;
    for (const r of refs) {
      const s = albumScore(o.title, r.title);
      if (s < GOOD) continue;
      const rank = s + (r.type === 'album' ? 0.05 : 0);
      if (!best || rank > best.rank) best = { ref: r, score: s, rank, manual: false };
    }
    out.set(o.id, best ? { ref: best.ref, score: best.score, manual: false } : null);
  }
  return out;
}

/** Elimina le doppie edizioni (deluxe, remaster, esplicito/pulito) tenendo per ogni titolo "pulito" la prima versione. */
function dedupeRefs(refs) {
  const seen = new Map();
  for (const r of refs) {
    const k = cleanAlbum(r.title);
    if (!k) continue;
    const prev = seen.get(k);
    if (!prev || (prev.type !== 'album' && r.type === 'album')) seen.set(k, r);
  }
  return [...seen.values()];
}

/** Album di riferimento che non abbiamo (nessuno dei nostri album gli somiglia, nessun abbinamento manuale). */
function missingAlbums(owned, refs, matches, ignoredIds = new Set()) {
  const usedRef = new Set();
  for (const m of matches.values()) if (m) usedRef.add(String(m.ref.id));
  const res = [];
  for (const r of dedupeRefs(refs)) {
    if (usedRef.has(String(r.id)) || ignoredIds.has(String(r.id))) continue;
    if (owned.some((o) => albumScore(o.title, r.title) >= GOOD)) continue;
    res.push(r);
  }
  return res;
}

/** Confronta i brani di un nostro album con quelli del riferimento. ours: {id,title,trackNo,discNo,durationMs}; refs: {t,d,p,disc}. */
function matchTracks(ours, refs) {
  const usedO = new Set(), usedR = new Set();
  const pairs = [];
  const take = (oi, ri) => { usedO.add(oi); usedR.add(ri); pairs.push({ ours: ours[oi], ref: refs[ri] }); };
  const oc = ours.map((o) => cleanTrack(o.title));
  const rc = refs.map((r) => cleanTrack(r.t));
  // 1) titolo identico
  for (let oi = 0; oi < ours.length; oi++) {
    let pick = -1;
    for (let ri = 0; ri < refs.length; ri++) {
      if (usedR.has(ri) || !oc[oi] || oc[oi] !== rc[ri]) continue;
      if (pick < 0 || (refs[ri].p === ours[oi].trackNo && (refs[ri].disc || 1) === (ours[oi].discNo || 1))) pick = ri;
    }
    if (pick >= 0) take(oi, pick);
  }
  // 2) stessa posizione e titolo simile
  for (let oi = 0; oi < ours.length; oi++) {
    if (usedO.has(oi)) continue;
    for (let ri = 0; ri < refs.length; ri++) {
      if (usedR.has(ri)) continue;
      if (refs[ri].p === ours[oi].trackNo && (refs[ri].disc || 1) === (ours[oi].discNo || 1) && similarity(oc[oi], rc[ri]) >= 0.5) { take(oi, ri); break; }
    }
  }
  // 3) titolo molto simile ovunque
  for (let oi = 0; oi < ours.length; oi++) {
    if (usedO.has(oi)) continue;
    let best = -1, bs = 0.7;
    for (let ri = 0; ri < refs.length; ri++) {
      if (usedR.has(ri)) continue;
      const s = similarity(oc[oi], rc[ri]);
      if (s >= bs) { bs = s; best = ri; }
    }
    if (best >= 0) take(oi, best);
  }
  return {
    pairs,
    extra: ours.filter((_, i) => !usedO.has(i)),
    missing: refs.filter((_, i) => !usedR.has(i)),
  };
}

/** Differenza di durata in secondi (nostra - riferimento) e se è "troppa": oltre la soglia e oltre il 3% della durata. */
function durationDiff(ourMs, refSec, thr) {
  const diff = Math.round(ourMs / 1000 - refSec);
  return { diff, bad: Math.abs(diff) > Math.max(thr, refSec * 0.03) };
}

/** Distanza di Hamming tra due hash esadecimali a 64 bit (0 = identiche, >20 = molto diverse). */
function hashDistance(a, b) {
  if (!a || !b) return null;
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

module.exports = { norm, cleanAlbum, cleanTrack, similarity, albumScore, GOOD, matchAlbums, dedupeRefs, missingAlbums, matchTracks, durationDiff, hashDistance };
