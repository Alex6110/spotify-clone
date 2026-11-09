import React, { useEffect, useRef, useState } from 'react';
import { Copy, Gauge } from 'lucide-react';
import { isStandalone } from '../lib/pwa';
import { api, apiBase, streamUrl, coverOf } from '../lib/api';
import '../styles/Home.css';

// Pagina tecnica: misura lo schermo come lo vede l'app. Serve a capire problemi di layout su iPhone
// (app spostata in alto, vuoto in fondo...) mandando uno screenshot o il testo copiato.
// Disegna bordi e fasce colorate a schermo intero: dallo screenshot si vede quale altezza viene davvero disegnata.
const FillProbe = ({ onClose }) => {
  const box = { position: 'fixed', left: 0, right: 0, zIndex: 9999, boxSizing: 'border-box' };
  const tag = (bg, text, pos) => (
    <div style={{ position: 'absolute', left: 0, right: 0, height: 34, background: bg, color: '#000', font: '700 13px/34px system-ui', textAlign: 'center', ...pos }}>{text}</div>
  );
  return (
    <div onClick={onClose}>
      <div style={{ ...box, top: 0, bottom: 0, border: '3px solid #ff3b30' }}>
        {tag('#ff3b30', 'ROSSO: inizio (top 0)', { top: 0 })}
        {tag('#ff3b30', 'ROSSO: fine di "inset 0" / 100dvh', { bottom: 0 })}
      </div>
      <div style={{ ...box, top: 0, height: '100vh', border: '3px solid #34c759', pointerEvents: 'none' }}>
        {tag('#34c759', 'VERDE: fine di 100vh', { bottom: 40 })}
      </div>
      <div style={{ ...box, top: 0, height: '100lvh', border: '3px dashed #0a84ff', pointerEvents: 'none' }}>
        {tag('#0a84ff', 'BLU: fine di 100lvh', { bottom: 80 })}
      </div>
      <div style={{ ...box, top: 'env(safe-area-inset-top, 0px)', bottom: 'env(safe-area-inset-bottom, 0px)', border: '3px solid #ffd60a', pointerEvents: 'none' }}>
        {tag('#ffd60a', 'GIALLO: area sicura', { top: 40 })}
      </div>
      <div style={{ ...box, top: '50%', background: '#000', color: '#fff', font: '600 15px system-ui', padding: 12, textAlign: 'center' }}>
        Scatta uno screenshot e mandalo. Tocca per chiudere.
      </div>
    </div>
  );
};

const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const now = () => performance.now();

// Misura da dove arriva la lentezza: rete verso il server, copertine, disco del server, partenza di un brano.
const SpeedTest = () => {
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const say = (l) => setLines((p) => [...p, l]);

  const run = async () => {
    setBusy(true); setLines([]);
    const verdict = [];
    try {
      // 1) rete: tempo di risposta di una richiesta minuscola
      const rtts = [];
      for (let i = 0; i < 6; i += 1) {
        const t0 = now();
        await fetch(`${apiBase}/api/health?n=${Math.random()}`, { cache: 'no-store' });
        rtts.push(now() - t0);
      }
      const rtt = Math.round(median(rtts));
      say(`Rete → server: ${rtt} ms a richiesta (minimo ${Math.round(Math.min(...rtts))} ms)`);
      if (rtt > 150) verdict.push('La rete verso il Mac è lenta già per una richiesta minuscola: ogni copertina e ogni brano paga questo ritardo. Controlla che Tailscale sia in connessione diretta e non tramite relay.');

      // 2) copertine: 12 miniature insieme, come in Home
      const albums = (await api.get('/api/library/albums', { params: { limit: 12, sort: 'recent' } })).data.items.filter((a) => a.cover);
      if (albums.length) {
        const t0 = now();
        const sizes = await Promise.all(albums.map(async (a) => {
          const r = await fetch(`${coverOf(a, 128)}&n=${Math.random()}`, { cache: 'no-store' });
          return (await r.arrayBuffer()).byteLength;
        }));
        const ms = Math.round(now() - t0);
        say(`${albums.length} miniature insieme: ${ms} ms (in media ${Math.round(sizes.reduce((x, y) => x + y, 0) / sizes.length / 1024)} KB l'una)`);
        const t1 = now();
        const big = await (await fetch(`${coverOf(albums[0])}${coverOf(albums[0]).includes('?') ? '&' : '?'}n=${Math.random()}`, { cache: 'no-store' })).arrayBuffer();
        say(`Una copertina originale: ${Math.round(now() - t1)} ms (${Math.round(big.byteLength / 1024)} KB)`);
        if (ms > 1500) verdict.push('Le copertine impiegano troppo anche se sono piccole: è la rete (o il server occupato), non il peso dei file.');
      }

      // 3) disco del server
      try {
        const d = (await api.get('/api/stream/diag')).data;
        say(`Disco del server: ${d.files.map((f) => `${f.ms} ms`).join(', ') || 'nessun file letto'} (lettura dei primi 512 KB di brani a caso)`);
        if (d.maxMs > 400) verdict.push('Il disco del Mac risponde lentamente alla prima lettura (probabile sospensione dell\'SSD o risparmio energetico).');
      } catch { say('Disco del server: misura non disponibile (aggiorna e riavvia il server)'); }

      // 4) partenza di un brano
      const tracks = (await api.get('/api/library/recent')).data.items;
      const track = tracks[0] || (albums[0] && (await api.get(`/api/library/albums/${albums[0].id}`)).data.tracks[0]);
      if (track) {
        const fetchStart = async () => {
          const t0 = now();
          const r = await fetch(`${streamUrl(track)}&n=${Math.random()}`, { headers: { Range: 'bytes=0-524287' }, cache: 'no-store' });
          const first = now() - t0;
          const buf = await r.arrayBuffer();
          const total = now() - t0;
          return { first: Math.round(first), total: Math.round(total), kbs: Math.round((buf.byteLength / 1024) / (total / 1000)) };
        };
        const a = await fetchStart();
        const b = await fetchStart();
        say(`Brano "${track.title}" (${track.format || '?'}): primi dati dopo ${a.first} ms, 512 KB in ${a.total} ms (${a.kbs} KB/s)`);
        say(`Stesso brano, seconda volta: primi dati ${b.first} ms, ${b.total} ms (${b.kbs} KB/s)`);
        if (a.first - b.first > 300) verdict.push('La prima lettura di un brano è molto più lenta della seconda: pesa il disco o il server, non la banda.');
        if (b.kbs < 800) verdict.push(`Velocità di trasferimento bassa (${b.kbs} KB/s): un FLAC da 30 MB richiederebbe più di mezzo minuto per arrivare intero.`);
      }
      say(verdict.length ? `\nCOSA EMERGE:\n- ${verdict.join('\n- ')}` : '\nNessun collo di bottiglia evidente da questo telefono.');
    } catch (e) {
      say(`Errore durante il test: ${e?.message || e}`);
    }
    setBusy(false);
  };

  const copy = () => { try { navigator.clipboard?.writeText(lines.join('\n')); } catch { /* non disponibile */ } };
  return (
    <div style={{ marginTop: 28 }}>
      <h3>Test velocità</h3>
      <p className="muted-text">Misura dove si perde tempo: rete, copertine, disco del Mac, partenza di un brano. Lancialo sia sul Wi-Fi di casa sia con la rete mobile.</p>
      <div className="diag-actions">
        <button type="button" className="pill-btn primary" onClick={run} disabled={busy}><Gauge size={16} /> {busy ? 'Misuro…' : 'Avvia il test'}</button>
        {lines.length > 0 && <button type="button" className="pill-btn" onClick={copy}><Copy size={16} /> Copia il risultato</button>}
      </div>
      {lines.length > 0 && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5, marginTop: 14 }}>{lines.join('\n')}</pre>}
    </div>
  );
};

const Diagnostics = () => {
  const probes = useRef(null);
  const [rows, setRows] = useState([]);
  const [probe, setProbe] = useState(false);

  useEffect(() => {
    const measure = () => {
      const el = probes.current;
      const h = (cls) => Math.round(el.querySelector(cls).getBoundingClientRect().height * 10) / 10;
      const shell = document.querySelector('.mobile-shell, .desktop-shell')?.getBoundingClientRect();
      const vv = window.visualViewport;
      setRows([
        ['Finestra (innerWidth x innerHeight)', `${window.innerWidth} x ${window.innerHeight}`],
        ['Schermo (screen)', `${window.screen.width} x ${window.screen.height}`],
        ['visualViewport', vv ? `${Math.round(vv.width)} x ${Math.round(vv.height)} (offset ${Math.round(vv.offsetTop)})` : 'n/d'],
        ['100vh', h('.p-vh')], ['100dvh', h('.p-dvh')], ['100svh', h('.p-svh')], ['fixed inset 0', h('.p-fixed')],
        ['Margine alto (safe-area)', h('.p-top')], ['Margine basso (safe-area)', h('.p-bottom')],
        ['Guscio app (top, altezza)', shell ? `${Math.round(shell.top)}, ${Math.round(shell.height)}` : 'n/d'],
        ['Installata (standalone)', isStandalone() ? 'sì' : 'no'],
        ['HTTPS', window.isSecureContext ? 'sì' : 'no'],
        ['Service worker attivo', navigator.serviceWorker?.controller ? 'sì' : 'no'],
        ['Pixel ratio', window.devicePixelRatio],
        ['Browser', navigator.userAgent],
      ]);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  const copy = () => { try { navigator.clipboard?.writeText(text); } catch { /* non disponibile */ } };

  return (
    <div className="home-page" style={{ maxWidth: 640 }}>
      <h3>Diagnostica schermo</h3>
      <p className="muted-text">Se qualcosa appare spostato o tagliato, manda uno screenshot di questa pagina.</p>
      <table className="diag-table"><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{String(v)}</td></tr>)}</tbody></table>
      <div className="diag-actions">
        <button type="button" className="pill-btn" onClick={copy}><Copy size={16} /> Copia i dati</button>
        <button type="button" className="pill-btn primary" onClick={() => setProbe(true)}>Prova riempimento schermo</button>
      </div>
      <SpeedTest />
      {probe && <FillProbe onClose={() => setProbe(false)} />}
      <div ref={probes} className="diag-probes" aria-hidden="true">
        <div className="p-vh" style={{ height: '100vh' }} />
        <div className="p-dvh" style={{ height: '100dvh' }} />
        <div className="p-svh" style={{ height: '100svh' }} />
        <div className="p-fixed" style={{ position: 'fixed', inset: 0, visibility: 'hidden', pointerEvents: 'none' }} />
        <div className="p-top" style={{ height: 'env(safe-area-inset-top, 0px)' }} />
        <div className="p-bottom" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>
  );
};

export default Diagnostics;
