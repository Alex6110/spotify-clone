import React from 'react';

// Se qualcosa si rompe durante il disegno della pagina, invece dello schermo nero si vede cosa è successo.
export async function resetApp() {
  try { (await navigator.serviceWorker?.getRegistrations())?.forEach((r) => r.unregister()); } catch { /* niente */ }
  try { await Promise.all((await caches.keys()).filter((n) => n !== 'musica-audio').map((n) => caches.delete(n))); } catch { /* niente */ }
  window.location.reload();
}

export const ErrorScreen = ({ message }) => (
  <div style={{ position: 'fixed', inset: 0, overflow: 'auto', padding: 'calc(env(safe-area-inset-top, 0px) + 56px) 20px 32px', background: '#0a0a0b', color: '#fff', font: '15px/1.45 -apple-system, system-ui, sans-serif' }}>
    <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Qualcosa non è andato a buon fine</h2>
    <p style={{ color: '#b3b3b3', margin: '0 0 14px' }}>Se continua, fai uno screenshot di questa schermata e mandalo.</p>
    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#1c1c1f', padding: 12, borderRadius: 8, fontSize: 12, color: '#ff9b9b' }}>{message}</pre>
    <button type="button" onClick={resetApp} style={{ marginTop: 18, padding: '12px 22px', borderRadius: 500, background: '#fff', color: '#111', fontWeight: 700, fontSize: 16 }}>Svuota la cache e riavvia</button>
  </div>
);

export default class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorScreen message={`${error?.message || error}\n\n${(error?.stack || '').split('\n').slice(0, 6).join('\n')}`} />;
  }
}
