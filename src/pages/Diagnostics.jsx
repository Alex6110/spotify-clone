import React, { useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { isStandalone } from '../lib/pwa';
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
