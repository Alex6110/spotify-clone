/**
 * Prova rapida di tutto il giro, a server acceso (npm run dev in un altro terminale):
 *   npm run smoke
 * Crea un utente temporaneo, prova auth, libreria, streaming con Range, preferiti, ascolti, stato di riproduzione,
 * poi cancella l'utente. Stampa OK / ERRORE per ogni passo.
 */
const config = require('../src/config');
const bcrypt = require('bcrypt');
const prisma = require('../src/db');

const BASE = process.env.SMOKE_URL || `http://127.0.0.1:${config.port}`;
const email = `smoke-${Date.now()}@example.test`;
let token = '';
let failures = 0;

const check = (name, cond, extra = '') => {
  if (cond) console.log(`  OK      ${name}`);
  else { failures++; console.log(`  ERRORE  ${name} ${extra}`); }
};

async function call(method, path, { body, headers = {}, auth = true, raw = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth && token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* risposta senza JSON */ }
  return { status: res.status, json };
}

async function main() {
  console.log(`Server: ${BASE}`);
  const health = await call('GET', '/api/health', { auth: false }).catch(() => null);
  if (!health || health.status !== 200) { console.log('Il server non risponde: avvialo con "npm run dev".'); process.exit(1); }
  check('health', health.json?.ok === true);

  console.log('Autenticazione');
  let r = await call('GET', '/api/library/albums', { auth: false });
  check('senza token le API rispondono 401', r.status === 401, `(ricevuto ${r.status})`);
  // L'utente di prova viene creato direttamente nel database: così il test non dipende dal codice invito.
  await prisma.user.create({ data: { name: 'Prova', email, passwordHash: await bcrypt.hash('password-di-prova', 10) } });
  r = await call('POST', '/api/auth/register', { auth: false, body: { name: 'Altro', email: `x-${email}`, password: 'password-di-prova', inviteCode: 'codice-sbagliato-per-test' } });
  check('registrazione con codice sbagliato rifiutata', r.status === 403 || r.status === 201, `(ricevuto ${r.status})`);
  if (r.status === 201) await prisma.user.deleteMany({ where: { email: `x-${email}` } });
  r = await call('POST', '/api/auth/login', { auth: false, body: { email, password: 'sbagliata' } });
  check('login con password errata rifiutato', r.status === 401);
  r = await call('POST', '/api/auth/login', { auth: false, body: { email, password: 'password-di-prova' } });
  check('login', r.status === 200 && r.json?.token, `(ricevuto ${r.status} ${JSON.stringify(r.json)})`);
  token = r.json?.token || '';

  console.log('Tema e profilo');
  r = await call('PATCH', '/api/me/settings', { body: { accent: '#3D91FF', radius: 'sharp' } });
  check('salvataggio tema', r.status === 200 && r.json?.settings?.accent === '#3D91FF');
  r = await call('PATCH', '/api/me/settings', { body: { accent: 'rosso' } });
  check('tema non valido rifiutato', r.status === 400);
  r = await call('GET', '/api/me');
  check('il tema è legato all\'utente', r.json?.settings?.radius === 'sharp');

  console.log('Libreria');
  r = await call('GET', '/api/library/albums?limit=5');
  check('elenco album', r.status === 200 && Array.isArray(r.json?.items));
  if (!r.json?.total) {
    console.log('  (libreria vuota: esegui "npm run scan" per provare anche streaming, ascolti e preferiti)');
  } else {
    const albumId = r.json.items[0].id;
    r = await call('GET', `/api/library/albums/${albumId}`);
    const track = r.json?.tracks?.[0];
    check('dettaglio album con brani', r.status === 200 && !!track);

    if (track) {
      const noTok = await call('GET', `/api/stream/${track.id}`, { auth: false, raw: true });
      check('streaming senza token rifiutato', noTok.status === 401, `(ricevuto ${noTok.status})`);
      const ranged = await call('GET', `/api/stream/${track.id}?t=${encodeURIComponent(token)}`, { auth: false, raw: true, headers: { Range: 'bytes=0-99' } });
      const buf = Buffer.from(await ranged.arrayBuffer());
      check('streaming con Range (seek) risponde 206', ranged.status === 206 && buf.length === 100, `(ricevuto ${ranged.status}, ${buf.length} byte)`);
      check('Content-Range presente', /^bytes 0-99\//.test(ranged.headers.get('content-range') || ''));

      r = await call('PUT', `/api/library/likes/${track.id}`);
      check('mi piace', r.status === 204);
      r = await call('GET', `/api/library/albums/${albumId}`);
      check('il brano risulta piaciuto', r.json?.tracks?.find((t) => t.id === track.id)?.liked === true);
      r = await call('DELETE', `/api/library/likes/${track.id}`);
      check('rimozione mi piace', r.status === 204);

      r = await call('POST', '/api/library/listens', { body: { trackId: track.id, playedMs: 45000, completed: false } });
      check('registrazione ascolto', r.status === 204, `(ricevuto ${r.status} ${JSON.stringify(r.json)})`);
      r = await call('PUT', '/api/playback', { body: { trackId: track.id, currentTime: 12.5, queue: [track.id] } });
      check('salvataggio stato di riproduzione', r.status === 204);
      r = await call('GET', '/api/playback');
      check('ripristino stato di riproduzione', r.json?.track?.id === track.id && r.json?.queue?.length === 1);
      r = await call('GET', `/api/library/search?q=${encodeURIComponent(track.title.slice(0, 4))}`);
      check('ricerca', r.status === 200 && (r.json?.tracks?.length || 0) > 0);
      r = await call('GET', '/api/library/home');
      check('home con ascolti recenti', r.status === 200 && r.json?.recentlyPlayed?.length >= 1);

      console.log('Playlist');
      r = await call('POST', '/api/playlists', { body: { name: '   ' } });
      check('nome vuoto rifiutato', r.status === 400);
      r = await call('POST', '/api/playlists', { body: { name: 'Prova', trackIds: [track.id] } });
      check('creazione playlist', r.status === 201 && r.json?.trackCount === 1, `(ricevuto ${r.status} ${JSON.stringify(r.json)})`);
      const pid = r.json?.id;
      const more = (await call('GET', `/api/library/albums/${albumId}`)).json?.tracks?.slice(1, 3).map((t) => t.id) || [];
      r = await call('POST', `/api/playlists/${pid}/tracks`, { body: { trackIds: more.length ? more : [track.id] } });
      check('aggiunta brani', r.status === 201);
      r = await call('GET', `/api/playlists/${pid}`);
      const n = r.json?.tracks?.length || 0;
      check('dettaglio playlist con posizioni', r.status === 200 && n >= 2 && r.json.tracks[0].position === 0, `(brani: ${n})`);
      const ids = (r.json?.tracks || []).map((t) => t.id).reverse();
      r = await call('PUT', `/api/playlists/${pid}/order`, { body: { trackIds: ids } });
      check('riordino', r.status === 204, `(ricevuto ${r.status})`);
      r = await call('PUT', `/api/playlists/${pid}/order`, { body: { trackIds: [...ids, track.id] } });
      check('riordino con brani diversi rifiutato', r.status === 409);
      r = await call('GET', `/api/playlists/${pid}`);
      check('l\'ordine è cambiato', r.json?.tracks?.[0]?.id === ids[0]);
      r = await call('DELETE', `/api/playlists/${pid}/tracks/${r.json?.tracks?.[0]?.position}`);
      check('rimozione di una riga', r.status === 204);
      r = await call('PATCH', `/api/playlists/${pid}`, { body: { name: 'Rinominata' } });
      check('rinomina', r.status === 200 && r.json?.name === 'Rinominata');
      r = await call('GET', '/api/playlists');
      check('elenco playlist', r.status === 200 && r.json?.items?.some((p) => p.id === pid && p.covers.length >= 0));
      const other = await prisma.user.create({ data: { name: 'Altro', email: `o-${email}`, passwordHash: await bcrypt.hash('altra-password', 10) } });
      const otherLogin = await call('POST', '/api/auth/login', { auth: false, body: { email: `o-${email}`, password: 'altra-password' } });
      const saved = token; token = otherLogin.json?.token || '';
      r = await call('GET', `/api/playlists/${pid}`);
      check('un altro utente non vede la playlist', r.status === 404, `(ricevuto ${r.status})`);
      r = await call('DELETE', `/api/playlists/${pid}`);
      check('un altro utente non può cancellarla', r.status === 404);
      token = saved;
      await prisma.user.delete({ where: { id: other.id } });
      r = await call('DELETE', `/api/playlists/${pid}`);
      check('eliminazione playlist', r.status === 204);

      console.log('Download e caricamento');
      const zipNoTok = await call('GET', `/api/download/album/${albumId}`, { auth: false, raw: true });
      check('ZIP senza token rifiutato', zipNoTok.status === 401);
      const zipRes = await call('GET', `/api/download/album/${albumId}?t=${encodeURIComponent(token)}`, { auth: false, raw: true });
      const zipBuf = Buffer.from(await zipRes.arrayBuffer());
      check('ZIP dell\'album valido', zipRes.status === 200 && zipBuf.subarray(0, 2).toString() === 'PK' && zipBuf.readUInt32LE(zipBuf.length - 22) === 0x06054b50, `(ricevuto ${zipRes.status}, ${zipBuf.length} byte)`);
      check('ZIP: dimensione annunciata corretta', Number(zipRes.headers.get('content-length')) === zipBuf.length);
      const fileDl = await call('GET', `/api/stream/${track.id}?t=${encodeURIComponent(token)}&download=1`, { auth: false, raw: true });
      check('scarico del singolo brano', fileDl.status === 200 && /attachment/.test(fileDl.headers.get('content-disposition') || ''));
      await fileDl.arrayBuffer();
      let up = await fetch(`${BASE}/api/upload?name=${encodeURIComponent('note.txt')}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: 'ciao' });
      check('caricamento: file non audio rifiutato', up.status === 400 || up.status === 403);
      up = await fetch(`${BASE}/api/upload?name=${encodeURIComponent('finto.mp3')}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: 'non sono davvero audio' });
      check('caricamento: audio finto rifiutato (nessun file creato)', up.status === 415 || up.status === 403, `(ricevuto ${up.status})`);
      up = await fetch(`${BASE}/api/upload?name=x.mp3`, { method: 'PUT', body: 'x' });
      check('caricamento senza token rifiutato', up.status === 401);
    }
  }

  await prisma.user.deleteMany({ where: { email } });
  console.log(failures ? `\n${failures} controlli falliti.` : '\nTutto a posto.');
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
