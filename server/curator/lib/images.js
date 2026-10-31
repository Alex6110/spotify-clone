const fsp = require('fs/promises');
let sharp = null;
try { sharp = require('sharp'); } catch { /* senza sharp: niente confronto automatico delle copertine */ }

const hasSharp = () => !!sharp;

/** Salva un'immagine come JPEG quadrato 640x640 (come fa il resto dell'app). */
async function saveJpeg(buf, outPath) {
  if (!sharp) { await fsp.writeFile(outPath, buf); return; }
  await sharp(buf).rotate().resize(640, 640, { fit: 'cover' }).jpeg({ quality: 82, progressive: true }).toFile(outPath);
}

/** "Impronta" dell'immagine (dHash 64 bit, in esadecimale): due copertine uguali hanno impronte quasi identiche. */
async function dhash(input) {
  if (!sharp) return null;
  try {
    const px = await sharp(input).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
    let bits = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x] > px[y * 9 + x + 1] ? '1' : '0';
    return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
  } catch { return null; }
}

module.exports = { hasSharp, saveJpeg, dhash };
