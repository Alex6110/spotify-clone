// Prepara in anticipo le miniature di copertine e foto artista: npm run thumbs
// Non è obbligatorio (le miniature si creano da sole alla prima richiesta), ma rende veloce anche la prima apertura.
const config = require('../src/config');
const { warm } = require('../src/lib/thumbs');

(async () => {
  const t0 = Date.now();
  const a = await warm('covers', config.coversDir, [128, 320]);
  console.log(`Copertine: ${a} miniature create`);
  const b = await warm('artist-photos', config.artistPhotosDir, [128, 192, 320]);
  console.log(`Foto artista: ${b} miniature create`);
  console.log(`Fatto in ${Math.round((Date.now() - t0) / 1000)} secondi.`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
