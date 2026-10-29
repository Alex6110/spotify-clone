import React, { useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { isStandalone } from '../lib/pwa';
import '../styles/Home.css';

// Pagina tecnica: misura lo schermo come lo vede l'app. Serve a capire problemi di layout su iPhone
// (app spostata in alto, vuoto in fondo...) mandando uno screenshot o il testo copiato.
const Diagnostics = () => {
  const probes = useRef(null);
  const [rows, setRows] = useState([]);

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
      <button type="button" className="pill-btn" onClick={copy}><Copy size={16} /> Copia i dati</button>
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
