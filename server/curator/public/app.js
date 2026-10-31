'use strict';
// Controllo libreria: pagine Artisti, Artista, Mancanti, Brani a 00:00, Durate diverse, Copertine, Sincronizzazione.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = {
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 010 6M18 14c2 .6 3 2.4 3 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>', image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/>',
  sync: '<path d="M20 11a8 8 0 00-14-4M4 4v4h4M4 13a8 8 0 0014 4M20 20v-4h-4"/>', check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  up: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>', link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const ic = (n) => `<svg class="i" viewBox="0 0 24 24">${ICON[n] || ''}</svg>`;
const mmss = (sec) => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
const dur = (ms) => mmss(ms / 1000);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);
  return data;
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
let toastTimer;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = `toast${bad ? ' bad' : ''}`; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
const busy = async (btn, fn) => {
  btn.disabled = true;
  try { await fn(); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; }
};
function pickFile(accept, cb) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept;
  inp.onchange = () => { if (inp.files[0]) cb(inp.files[0]); };
  inp.click();
}

// ---------- navigazione ----------
const PAGES = [
  ['#/', 'Artisti', 'users'], ['#/missing', 'Mancanti', 'plus'], ['#/zero', 'Brani a 00:00', 'clock'],
  ['#/durations', 'Durate diverse', 'timer'], ['#/covers', 'Copertine', 'image'], ['#/sync', 'Sincronizzazione', 'sync'],
];
function renderNav(active) {
  $('#nav').innerHTML = PAGES.map(([h, l, i]) => `<a href="${h}" class="${active === h ? 'on' : ''}">${ic(i)}<span>${l}</span></a>`).join('');
}
const main = $('#main');
async function router() {
  const hash = location.hash || '#/';
  const m = /^#\/artist\/(\d+)/.exec(hash);
  renderNav(m ? '#/' : hash);
  main.innerHTML = '<p class="dim">Caricamento…</p>';
  window.scrollTo(0, 0);
  try {
    if (m) await pageArtist(Number(m[1]));
    else if (hash === '#/missing') await pageMissing();
    else if (hash === '#/zero') await pageZero();
    else if (hash === '#/durations') await pageDurations();
    else if (hash === '#/covers') await pageCovers();
    else if (hash === '#/sync') await pageSync();
    else await pageArtists();
  } catch (e) { main.innerHTML = `<div class="note">${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', router);

// ---------- Artisti ----------
const view = { q: '', filter: 'all' };
async function pageArtists() {
  const list = await api('/api/artists');
  const ov = await api('/api/overview');
  $('#sidefoot').textContent = `${ov.artists} artisti · ${ov.albums} album · ${ov.tracks} brani`;
  const checked = list.filter((a) => a.checked).length;
  main.innerHTML = `
    <h1>Artisti</h1>
    <p class="sub">Apri un artista per confrontare la tua discografia con quella ufficiale e controllare foto e copertine.</p>
    ${checked === 0 ? `<div class="note">Nessuna discografia è ancora stata scaricata: vai in <a href="#/sync"><b>Sincronizzazione</b></a> e avvia il controllo di tutti gli artisti (si può anche riprendere più tardi).</div>` : ''}
    <div class="bar"><input type="search" id="q" placeholder="Cerca artista…" value="${esc(view.q)}">
      <div class="chips" id="chips"></div></div>
    <div class="list" id="alist"></div>`;
  const filters = [['all', 'Tutti'], ['todo', 'Da controllare'], ['done', 'Confermati'], ['missing', 'Con album mancanti'], ['nophoto', 'Senza foto'], ['noref', 'Senza riferimento']];
  const draw = () => {
    $('#chips').innerHTML = filters.map(([k, l]) => `<button class="chip ${view.filter === k ? 'on' : ''}" data-k="${k}">${l}</button>`).join('');
    const q = view.q.trim().toLowerCase();
    const rows = list.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q)) return false;
      if (view.filter === 'todo') return !a.confirmed;
      if (view.filter === 'done') return a.confirmed;
      if (view.filter === 'missing') return (a.missing || 0) > 0;
      if (view.filter === 'nophoto') return !a.photo;
      if (view.filter === 'noref') return !a.ref;
      return true;
    });
    $('#alist').innerHTML = rows.length ? rows.slice(0, 700).map((a) => `
      <a class="row" href="#/artist/${a.id}">
        ${a.photo ? `<img class="ph" loading="lazy" src="${esc(a.photo)}" alt="">` : '<div class="ph empty">no foto</div>'}
        <div class="grow"><div class="name">${esc(a.name)}</div>
          <div class="meta">${plural(a.albums, 'album', 'album')} · ${plural(a.tracks, 'brano', 'brani')}${a.refName ? ` · riferimento: ${esc(a.refName)}` : ''}</div></div>
        <div class="badges">
          ${a.missing ? `<span class="badge warn">${a.missing} mancanti</span>` : ''}
          ${a.zeros ? `<span class="badge bad">${a.zeros} a 00:00</span>` : ''}
          ${a.durationIssues ? `<span class="badge warn">${a.durationIssues} durate</span>` : ''}
          ${a.confirmed ? `<span class="badge ok">${ic('check')} confermato</span>` : ''}
        </div></a>`).join('') : '<div class="empty-state">Nessun artista con questo filtro.</div>';
  };
  draw();
  $('#q').oninput = (e) => { view.q = e.target.value; draw(); };
  $('#chips').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { view.filter = b.dataset.k; draw(); } };
}

// ---------- Artista ----------
let thr = 8;
async function pageArtist(id) {
  const r = await api(`/api/artist/${id}?thr=${thr}`);
  const a = r.artist;
  const st = a.state || {};
  const s = r.stats;
  const refNote = !r.ref ? '<div class="note">Nessun artista di Deezer corrisponde con certezza al nome: scegli quello giusto qui sotto, oppure aggiungi una foto a mano.</div>'
    : !r.cached ? '<div class="note">Discografia non ancora scaricata (serve internet).</div>' : '';
  main.innerHTML = `
    <p class="dim"><a href="#/">Artisti</a> / ${esc(a.name)}</p>
    <div class="hero">
      ${a.photo ? `<img class="ph" src="${esc(a.photo)}" alt="">` : '<div class="ph empty">nessuna foto</div>'}
      <div><h1>${esc(a.name)}</h1>
        <p class="sub" style="margin:0 0 10px">${plural(r.albums.length, 'album', 'album')} nel database${r.ref?.info ? ` · riferimento: ${esc(r.ref.info.name)}` : ''}</p>
        <div class="bar" style="margin:0">
          <button class="btn ${st.confirmed ? 'ok' : 'primary'}" id="confirm">${ic('check')} ${st.confirmed ? 'Confermato' : 'Segna come controllato'}</button>
          <button class="btn" id="upphoto">${ic('up')} Carica foto</button>
          ${a.photo ? `<button class="btn" id="rmphoto">${ic('x')} Rimuovi foto</button>` : ''}
        </div></div></div>
    ${refNote}
    <div class="stats">
      <div class="stat"><b>${s.missingAlbums}</b><span>album che non hai</span></div>
      <div class="stat"><b>${s.missingTracks}</b><span>brani mancanti negli album</span></div>
      <div class="stat"><b>${s.zeros}</b><span>brani a 00:00</span></div>
      <div class="stat"><b>${s.durationIssues}</b><span>durate diverse (> ${thr} s)</span></div>
      <div class="stat"><b>${s.coverIssues}</b><span>copertine probabilmente diverse</span></div>
    </div>
    <h2>Foto: scegli l'artista corretto</h2>
    <div class="cands" id="cands"></div>
    <div class="tabs"><button class="chip on" data-t="cmp">Confronto album</button><button class="chip" data-t="miss">Solo mancanti (${r.missing.length})</button></div>
    <div id="tab"></div>`;

  const reload = () => pageArtist(id);
  $('#confirm').onclick = (e) => busy(e.currentTarget, async () => { await post(`/api/artist/${id}/state`, { confirmed: !st.confirmed }); await reload(); });
  $('#upphoto').onclick = () => pickFile('image/*', (f) => busy($('#upphoto'), async () => { await api(`/api/artist/${id}/photo`, { method: 'PUT', body: f }); toast('Foto aggiornata'); await reload(); }));
  if ($('#rmphoto')) $('#rmphoto').onclick = (e) => busy(e.currentTarget, async () => { await api(`/api/artist/${id}/photo`, { method: 'DELETE' }); await reload(); });

  // candidati artista
  $('#cands').innerHTML = r.candidates.length ? r.candidates.map((c) => `
    <div class="cand ${r.ref && r.ref.id === c.id ? 'on' : ''}">
      ${c.picture ? `<img src="${esc(c.picture)}" alt="" loading="lazy">` : '<div class="cv empty">nessuna foto</div>'}
      <div><b>${esc(c.name)}</b><div class="meta dim">${c.fans.toLocaleString('it-IT')} fan · ${c.albums} album</div></div>
      <div class="acts">
        <button class="btn small ${r.ref && r.ref.id === c.id ? 'ok' : ''}" data-ref="${c.id}" data-name="${esc(c.name)}">${r.ref && r.ref.id === c.id ? 'Riferimento attuale' : 'Usa come riferimento'}</button>
        ${c.picture ? `<button class="btn small" data-photo="${esc(c.picture)}">Usa questa foto</button>` : ''}
      </div></div>`).join('') : '<div class="dim">Nessun risultato da Deezer (controlla la connessione).</div>';
  $('#cands').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ref) busy(b, async () => { await post(`/api/artist/${id}/state`, { ref: Number(b.dataset.ref), refName: b.dataset.name }); await reload(); });
    if (b.dataset.photo) busy(b, async () => { await post(`/api/artist/${id}/photo`, { url: b.dataset.photo }); toast('Foto aggiornata'); await reload(); });
  };

  const tab = $('#tab');
  const showCmp = () => {
    tab.innerHTML = r.albums.length ? `<div class="list">${r.albums.map(albumRow).join('')}</div>` : '<div class="empty-state">Nessun album.</div>';
  };
  const showMiss = () => {
    tab.innerHTML = r.missing.length ? `<div class="list">${r.missing.map((m) => `
      <div class="row">
        ${m.thumb ? `<img class="cv" loading="lazy" src="${esc(m.thumb)}" alt="">` : '<div class="cv empty">—</div>'}
        <div class="grow"><div class="name">${esc(m.title)}</div><div class="meta">${esc(m.date ? m.date.slice(0, 4) : '')} · ${esc(typeLabel(m.type))}</div></div>
        <button class="btn small" data-ign="${m.id}">Ignora</button></div>`).join('')}</div>`
      : `<div class="empty-state">${r.cached ? 'Non risulta mancare nessun album.' : 'Discografia non disponibile.'}</div>`;
  };
  function albumRow(al) {
    const ref = al.ref; const t = al.tracks;
    const badges = [];
    if (!al.cover) badges.push('<span class="badge bad">senza copertina</span>');
    if (al.coverDist != null) badges.push(al.coverDist > 16 ? '<span class="badge bad">copertina diversa?</span>' : al.coverDist > 8 ? '<span class="badge warn">copertina simile</span>' : '<span class="badge ok">copertina uguale</span>');
    if (al.zeros) badges.push(`<span class="badge bad">${al.zeros} a 00:00</span>`);
    if (t) {
      const bad = t.pairs.filter((p) => p.bad).length;
      if (bad) badges.push(`<span class="badge warn">${bad} durate</span>`);
      if (t.missing.length) badges.push(`<span class="badge warn">${t.missing.length} brani mancanti</span>`);
    }
    if (!ref && r.cached) badges.push('<span class="badge warn">nessun abbinamento</span>');
    if (al.state.confirmed) badges.push(`<span class="badge ok">${ic('check')}</span>`);
    return `<div class="album" data-album="${al.id}">
      <div class="row">
        <div class="cvs">
          ${al.cover ? `<div class="cvwrap"><img class="cv" loading="lazy" src="${esc(al.cover)}" alt=""><small>tua</small></div>` : '<div class="cv empty">manca</div>'}
          ${ref && (ref.thumb || ref.cover) ? `<div class="cvwrap"><img class="cv" loading="lazy" src="${esc(ref.thumb || ref.cover)}" alt=""><small>Deezer</small></div>` : '<div class="cv empty">—</div>'}
        </div>
        <div class="grow"><div class="name">${esc(al.title)}${al.year ? ` <span class="dim">(${al.year})</span>` : ''}</div>
          <div class="meta">${ref ? `Riferimento: ${esc(ref.title)}${ref.date ? ` · ${esc(ref.date.slice(0, 4))}` : ''} · ${esc(typeLabel(ref.type))}${ref.manual ? ' · scelto a mano' : ''}` : 'Nessun album di riferimento'}
          · ${al.n} brani${t ? ` su ${t.ref}` : ''}</div>
          <div class="badges" style="justify-content:flex-start;margin-top:5px">${badges.join('')}</div></div>
        <button class="btn small" data-act="toggle">${ic('chevron')} Dettagli</button>
      </div><div class="detail" hidden></div></div>`;
  }
  function albumDetail(al) {
    const ref = al.ref; const t = al.tracks;
    const opts = [`<option value="">Scegli album di riferimento…</option>`, `<option value="-1">Nessuno: non esiste su Deezer</option>`]
      .concat((r.allRefAlbums || []).map((x) => `<option value="${x.id}" ${ref && ref.id === x.id ? 'selected' : ''}>${esc(x.title)} (${esc(typeLabel(x.type))}${x.date ? `, ${esc(x.date.slice(0, 4))}` : ''})</option>`));
    let h = `<div class="bar" style="margin-top:0">
      ${ref && ref.cover ? '<button class="btn small" data-act="usecover">Usa la copertina di Deezer</button>' : ''}
      <button class="btn small" data-act="upcover">${ic('up')} Carica copertina</button>
      <button class="btn small ${al.state.confirmed ? 'ok' : ''}" data-act="confirm">${ic('check')} ${al.state.confirmed ? 'Controllato' : 'Segna controllato'}</button>
      <select data-act="link" style="max-width:340px">${opts.join('')}</select></div>`;
    if (t) {
      h += `<table><thead><tr><th>Nel tuo archivio</th><th class="num">Durata</th><th>Su Deezer</th><th class="num">Durata</th><th class="num">Differenza</th></tr></thead><tbody>
        ${t.pairs.map((p) => `<tr><td>${esc(p.title)}</td><td class="num ${p.zero ? 'bad-t' : ''}">${p.zero ? '0:00' : dur(p.ms)}</td><td class="dim">${esc(p.refTitle)}</td><td class="num">${mmss(p.refSec)}</td>
          <td class="num ${p.bad ? 'bad-t' : 'dim'}">${p.diff == null ? '—' : `${p.diff > 0 ? '+' : ''}${p.diff} s`}</td></tr>`).join('')}
        ${t.extra.map((p) => `<tr><td>${esc(p.title)}</td><td class="num">${dur(p.ms)}</td><td class="warn-t" colspan="3">non presente nell'album di riferimento</td></tr>`).join('')}
        ${t.missing.map((p) => `<tr><td class="warn-t" colspan="2">mancante</td><td class="dim">${p.disc > 1 ? `${p.disc}-` : ''}${p.no}. ${esc(p.title)}</td><td class="num">${mmss(p.sec)}</td><td></td></tr>`).join('')}
        </tbody></table>`;
    } else h += '<p class="dim">Senza album di riferimento non posso confrontare i brani.</p>';
    return h;
  }
  const bindAlbums = () => {
    tab.onclick = (e) => {
      const ign = e.target.closest('[data-ign]');
      if (ign) return busy(ign, async () => { await post('/api/ignore', { artistId: id, refAlbumId: ign.dataset.ign, on: true }); await reload(); });
      const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT') return;
      const box = b.closest('.album'); const al = r.albums.find((x) => x.id === Number(box.dataset.album));
      if (b.dataset.act === 'toggle') {
        const d = $('.detail', box);
        if (d.hidden) { d.innerHTML = albumDetail(al); d.hidden = false; } else d.hidden = true;
      } else if (b.dataset.act === 'usecover') busy(b, async () => { await post(`/api/album/${al.id}/cover`, { url: al.ref.cover }); toast('Copertina aggiornata'); await reload(); });
      else if (b.dataset.act === 'upcover') pickFile('image/*', (f) => busy(b, async () => { await api(`/api/album/${al.id}/cover`, { method: 'PUT', body: f }); toast('Copertina aggiornata'); await reload(); }));
      else if (b.dataset.act === 'confirm') busy(b, async () => { await post(`/api/album/${al.id}/state`, { confirmed: !al.state.confirmed }); await reload(); });
    };
    tab.onchange = (e) => {
      const sel = e.target.closest('select[data-act=link]'); if (!sel || sel.value === '') return;
      const al = r.albums.find((x) => x.id === Number(sel.closest('.album').dataset.album));
      busy(sel, async () => { await post(`/api/album/${al.id}/state`, { ref: Number(sel.value) }); await reload(); });
    };
  };
  const setTab = (k) => {
    document.querySelectorAll('.tabs .chip').forEach((c) => c.classList.toggle('on', c.dataset.t === k));
    if (k === 'cmp') showCmp(); else showMiss();
  };
  document.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) setTab(b.dataset.t); };
  bindAlbums(); setTab('cmp');
}
const TYPES = { album: 'album', ep: 'EP', single: 'singolo', compile: 'raccolta' };
const typeLabel = (t) => TYPES[t] || t;

// ---------- Mancanti ----------
let missTypes = ['album', 'ep'];
async function pageMissing() {
  const d = await api(`/api/missing?types=${missTypes.join(',')}`);
  const total = d.rows.reduce((n, r) => n + r.missing.length, 0);
  main.innerHTML = `
    <h1>Album mancanti</h1>
    <p class="sub">Per ogni artista, gli album della discografia ufficiale che non trovo nel tuo archivio. ${d.artistsChecked} artisti su ${d.artistsTotal} già controllati${d.artistsChecked < d.artistsTotal ? ' (completa il controllo da Sincronizzazione)' : ''}.</p>
    <div class="bar"><div class="chips" id="tchips">${Object.entries(TYPES).map(([k, l]) => `<button class="chip ${missTypes.includes(k) ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
      <button class="btn" id="copy">${ic('copy')} Copia elenco</button><span class="dim">${plural(total, 'album', 'album')} in ${plural(d.rows.length, 'artista', 'artisti')}</span></div>
    <div class="list">${d.rows.map((r) => `
      <div class="album"><a class="row" href="#/artist/${r.artistId}"><div class="grow"><div class="name">${esc(r.artist)}</div><div class="meta">hai ${plural(r.albums, 'album', 'album')} · mancano ${r.missing.length}</div></div>${ic('chevron')}</a>
        <div class="detail">${r.missing.map((m) => `<span class="badge" style="margin:2px">${esc(m.title)}${m.date ? ` (${esc(m.date.slice(0, 4))})` : ''}</span>`).join('')}</div></div>`).join('') || '<div class="empty-state">Niente da mostrare (o discografie non ancora scaricate).</div>'}</div>`;
  $('#tchips').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k; missTypes = missTypes.includes(k) ? missTypes.filter((x) => x !== k) : [...missTypes, k]; if (!missTypes.length) missTypes = ['album']; router(); };
  $('#copy').onclick = async () => {
    const text = d.rows.map((r) => `${r.artist}\n${r.missing.map((m) => `  - ${m.title}${m.date ? ` (${m.date.slice(0, 4)})` : ''}`).join('\n')}`).join('\n\n');
    try { await navigator.clipboard.writeText(text); toast('Elenco copiato'); } catch { toast('Copia non riuscita', true); }
  };
}

// ---------- Brani a 00:00 ----------
async function pageZero() {
  const rows = await api('/api/zero');
  const byAlbum = new Map();
  for (const r of rows) { const k = r.albumId; if (!byAlbum.has(k)) byAlbum.set(k, { ...r, list: [] }); byAlbum.get(k).list.push(r); }
  const tiny = rows.filter((r) => r.size < 100 * 1024).length;
  main.innerHTML = `
    <h1>Brani a 00:00</h1>
    <p class="sub">Brani la cui durata non è leggibile. Di solito sono file vuoti o tagliati durante la copia o il rip: vanno ricopiati dal CD.</p>
    <div class="stats"><div class="stat"><b>${rows.length}</b><span>brani a 00:00</span></div><div class="stat"><b>${tiny}</b><span>sotto i 100 KB (quasi certamente vuoti)</span></div><div class="stat"><b>${byAlbum.size}</b><span>album coinvolti</span></div></div>
    <div class="bar"><input type="search" id="zq" placeholder="Filtra per artista, album o brano…"><button class="btn" id="zcopy">${ic('copy')} Copia percorsi</button></div>
    <div class="list" id="zl"></div>`;
  const draw = () => {
    const q = $('#zq').value.trim().toLowerCase();
    const groups = [...byAlbum.values()].filter((g) => !q || `${g.artist} ${g.album} ${g.list.map((x) => x.title).join(' ')}`.toLowerCase().includes(q));
    $('#zl').innerHTML = groups.map((g) => `<div class="album"><a class="row" href="#/artist/${g.artistId}"><div class="grow"><div class="name">${esc(g.artist)} — ${esc(g.album)}</div><div class="meta">${plural(g.list.length, 'brano', 'brani')} a 00:00</div></div>${ic('chevron')}</a>
      <div class="detail">${g.list.map((x) => `<div><span class="dim">${esc(x.relPath)}</span> <span class="badge ${x.size < 100 * 1024 ? 'bad' : ''}">${(x.size / 1024).toFixed(0)} KB</span></div>`).join('')}</div></div>`).join('') || '<div class="empty-state">Nessun brano a 00:00.</div>';
  };
  draw();
  $('#zq').oninput = draw;
  $('#zcopy').onclick = async () => { try { await navigator.clipboard.writeText(rows.map((r) => r.relPath).join('\n')); toast('Percorsi copiati'); } catch { toast('Copia non riuscita', true); } };
}

// ---------- Durate diverse ----------
async function pageDurations() {
  const d = await api(`/api/durations?thr=${thr}`);
  const n = d.rows.reduce((a, r) => a + r.tracks.length, 0);
  main.innerHTML = `
    <h1>Durate diverse dalla discografia</h1>
    <p class="sub">Brani la cui durata differisce da quella dell'album ufficiale. Tanto più corto del riferimento, tanto più probabile che il file sia tagliato; molto più lungo può voler dire un'altra edizione o un brano con traccia nascosta.</p>
    <div class="bar"><label class="dim">Soglia: <input type="number" id="thr" min="1" max="120" value="${thr}" style="width:70px"> secondi</label><span class="dim">${plural(n, 'brano', 'brani')} in ${plural(d.rows.length, 'album', 'album')}</span></div>
    <div class="list">${d.rows.map((r) => `<div class="album"><a class="row" href="#/artist/${r.artistId}"><div class="grow"><div class="name">${esc(r.artist)} — ${esc(r.album)}</div><div class="meta">confrontato con: ${esc(r.refTitle)}</div></div>${ic('chevron')}</a>
      <div class="detail"><table><tbody>${r.tracks.map((t) => `<tr><td>${esc(t.title)}</td><td class="num">${dur(t.ms)}</td><td class="num dim">atteso ${mmss(t.refSec)}</td><td class="num ${t.diff < 0 ? 'bad-t' : 'warn-t'}">${t.diff > 0 ? '+' : ''}${t.diff} s</td></tr>`).join('')}</tbody></table></div></div>`).join('') || '<div class="empty-state">Nessuna differenza oltre la soglia (o discografie non ancora scaricate).</div>'}</div>`;
  $('#thr').onchange = (e) => { thr = Math.max(1, Number(e.target.value) || 8); router(); };
}

// ---------- Copertine ----------
let covFilter = 'diff';
async function pageCovers() {
  const d = await api('/api/covers');
  const kind = (r) => (r.dist == null ? 'unk' : r.dist > 16 ? 'diff' : r.dist > 8 ? 'sim' : 'same');
  const counts = { diff: 0, sim: 0, same: 0, unk: 0 };
  d.rows.forEach((r) => { counts[kind(r)] += 1; });
  main.innerHTML = `
    <h1>Confronto copertine</h1>
    <p class="sub">A sinistra la copertina che usa la tua app, a destra quella dell'album ufficiale. Il confronto automatico è una stima: edizioni diverse possono avere copertine diverse pur essendo entrambe corrette.</p>
    ${d.sharp ? '' : '<div class="note">Il modulo "sharp" non è installato: il confronto automatico non è disponibile (esegui npm install in server/).</div>'}
    <div class="bar"><div class="chips" id="cchips">${[['diff', 'Probabilmente diverse'], ['sim', 'Simili'], ['same', 'Uguali'], ['unk', 'Non confrontate']].map(([k, l]) => `<button class="chip ${covFilter === k ? 'on' : ''}" data-k="${k}">${l} (${counts[k]})</button>`).join('')}</div></div>
    <div class="cmp" id="cg"></div>`;
  const draw = () => {
    const rows = d.rows.filter((r) => kind(r) === covFilter).sort((a, b) => (b.dist ?? -1) - (a.dist ?? -1)).slice(0, 120);
    $('#cg').innerHTML = rows.map((r) => `<div class="cmpc" data-album="${r.albumId}">
      <div class="two">${r.cover ? `<img loading="lazy" src="${esc(r.cover)}" alt="">` : '<div class="cv empty">manca</div>'}${r.refThumb ? `<img loading="lazy" src="${esc(r.refThumb)}" alt="">` : '<div class="cv empty">—</div>'}</div>
      <div><a href="#/artist/${r.artistId}"><b>${esc(r.album)}</b></a><div class="meta dim">${esc(r.artist)}${r.dist != null ? ` · distanza ${r.dist}` : ''}</div></div>
      <div class="acts" style="display:flex;gap:6px;flex-wrap:wrap">${r.refCover ? '<button class="btn small" data-act="use">Usa quella di Deezer</button>' : ''}<button class="btn small" data-act="keep">Tieni la mia</button></div></div>`).join('') || '<div class="empty-state">Nessuna copertina in questa categoria.</div>';
  };
  draw();
  $('#cchips').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { covFilter = b.dataset.k; pageCovers(); } };
  $('#cg').onclick = (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const card = b.closest('.cmpc'); const r = d.rows.find((x) => x.albumId === Number(card.dataset.album));
    busy(b, async () => {
      if (b.dataset.act === 'use') { await post(`/api/album/${r.albumId}/cover`, { url: r.refCover }); toast('Copertina aggiornata'); }
      else { await post(`/api/album/${r.albumId}/state`, { confirmed: true }); toast('Segnata come controllata'); }
      card.remove();
    });
  };
}

// ---------- Sincronizzazione ----------
let pollTimer;
async function pageSync() {
  const ov = await api('/api/overview');
  main.innerHTML = `
    <h1>Sincronizzazione</h1>
    <p class="sub">Scarica da Deezer la discografia di ogni tuo artista (e, se vuoi, confronta le copertine). Per circa 600 artisti servono 20–40 minuti; puoi fermarla e riprendere: ciò che è già scaricato resta salvato.</p>
    <div class="stats">
      <div class="stat"><b>${ov.artists}</b><span>artisti</span></div><div class="stat"><b>${ov.cacheEntries}</b><span>risposte già salvate</span></div>
      <div class="stat"><b>${ov.noPhoto}</b><span>artisti senza foto</span></div><div class="stat"><b>${ov.noCover}</b><span>album senza copertina</span></div></div>
    <div class="card" id="job"></div>
    <p class="dim" style="margin-top:14px">Database: ${esc(ov.db)}<br>Prima di ogni modifica (foto o copertine) viene creata una copia di sicurezza in <code>data/</code>.</p>`;
  const draw = async () => {
    const j = await api('/api/sync');
    const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
    $('#job').innerHTML = j.running ? `
      <b>${esc(j.phase)}</b> — ${j.done} / ${j.total} (${pct}%)<div class="progress"><i style="width:${pct}%"></i></div>
      <div class="dim">Ora: ${esc(j.current)}</div><div class="bar"><button class="btn" id="stop">Ferma</button></div>`
      : `${j.error ? `<div class="note">${esc(j.error)}</div>` : ''}
      <div class="bar" style="margin-top:0"><button class="btn primary" id="go">Scarica discografie</button><button class="btn" id="gocov" ${ov.sharp ? '' : 'disabled'}>Scarica discografie e confronta le copertine</button></div>
      <div class="dim">${j.done ? `Ultima esecuzione: ${j.done} artisti elaborati.` : 'Mai eseguita in questa sessione.'}</div>`;
    if ($('#go')) { $('#go').onclick = () => start(false); $('#gocov').onclick = () => start(true); }
    if ($('#stop')) $('#stop').onclick = async () => { await post('/api/sync/stop'); };
    clearTimeout(pollTimer);
    if (j.running && location.hash === '#/sync') pollTimer = setTimeout(draw, 1500);
  };
  const start = async (covers) => { try { await post('/api/sync', { covers }); draw(); } catch (e) { toast(e.message, true); } };
  draw();
}

router();
