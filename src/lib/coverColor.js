// Colore "principale" di una copertina, come fa Spotify per lo sfondo del player:
// non la media di tutti i pixel (che dà quasi sempre un marrone/grigio spento) ma il colore più presente tra quelli vivaci.
const cache = new Map();

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

/** Dai pixel di un'immagine ricava { h, s } del colore dominante (h in gradi, s da 0 a 1). Pura: si può provare senza browser. */
export function dominantFromPixels(data) {
  const BINS = 24;
  const bins = Array.from({ length: BINS }, () => ({ w: 0, s: 0 }));
  let total = 0, sumS = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const { h, s, l } = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    sumS += s; n += 1;
    if (l < 0.1 || l > 0.93 || s < 0.18) continue; // niente quasi-neri, quasi-bianchi o grigi
    const w = s * (1 - Math.abs(l - 0.5) * 1.2);
    const b = Math.floor((h / 360) * BINS) % BINS;
    bins[b].w += w; bins[b].s += s * w; total += w;
  }
  if (!n) return { h: 0, s: 0 };
  // pochi pixel vivaci: la copertina è in bianco e nero o molto spenta, quindi lo sfondo resta neutro
  if (total < n * 0.02) return { h: 0, s: 0 };
  let best = 0;
  for (let b = 1; b < BINS; b++) if (bins[b].w > bins[best].w) best = b;
  // media circolare con i due contenitori vicini, per non saltare tra due tonalità quasi uguali
  let wsum = 0, ssum = 0, x = 0, y = 0;
  for (const off of [-1, 0, 1]) {
    const b = (best + off + BINS) % BINS;
    const ang = ((b + 0.5) / BINS) * 2 * Math.PI;
    x += Math.cos(ang) * bins[b].w; y += Math.sin(ang) * bins[b].w;
    wsum += bins[b].w; ssum += bins[b].s;
  }
  const h = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { h, s: wsum ? ssum / wsum : 0 };
}

/** Sfondo del player: alto = colore pieno ma scurito (il testo bianco resta leggibile), basso = quasi nero dello stesso colore. */
export function gradientFor({ h, s }) {
  if (s < 0.05) return { top: 'hsl(0 0% 24%)', mid: 'hsl(0 0% 14%)', bottom: 'hsl(0 0% 7%)' };
  const sat = Math.min(0.7, Math.max(0.35, s));
  return {
    top: `hsl(${h.toFixed(0)} ${(sat * 100).toFixed(0)}% 33%)`,
    mid: `hsl(${h.toFixed(0)} ${(sat * 70).toFixed(0)}% 20%)`,
    bottom: `hsl(${h.toFixed(0)} ${(sat * 45).toFixed(0)}% 8%)`,
  };
}

/** Carica la copertina (stessa origine, quindi leggibile) e restituisce i colori del gradiente, oppure null. */
export function coverGradient(src) {
  if (!src) return Promise.resolve(null);
  if (cache.has(src)) return cache.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 48; c.height = 48;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 48, 48);
        resolve(gradientFor(dominantFromPixels(ctx.getImageData(0, 0, 48, 48).data)));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  cache.set(src, p);
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  return p;
}
