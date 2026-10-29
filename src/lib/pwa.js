// Registrazione del service worker e piccoli aiuti per l'installazione come app.
// Solo in produzione (npm run build): in sviluppo il service worker farebbe restare vecchie versioni in cache.

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // controlla gli aggiornamenti quando l'app torna in primo piano
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch((err) => console.warn('Service worker non registrato:', err?.message || err));
  });
}

/** Chiede al service worker di dimenticare le copie delle API (da chiamare al logout). */
export function clearCachedUserData() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'clear-user-data' });
  } catch { /* niente da fare */ }
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isSecure = () => window.isSecureContext;

// Chrome/Edge/Android: l'evento che permette di mostrare il pulsante "Installa"
let deferredPrompt = null;
const listeners = new Set();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  listeners.forEach((l) => l());
});
window.addEventListener('appinstalled', () => { deferredPrompt = null; listeners.forEach((l) => l()); });

export const canPromptInstall = () => !!deferredPrompt;
export const onInstallChange = (l) => { listeners.add(l); return () => listeners.delete(l); };
export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  listeners.forEach((l) => l());
  return outcome === 'accepted';
}
