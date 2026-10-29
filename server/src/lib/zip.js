// Scrittore ZIP in streaming, senza compressione ("store") e senza dipendenze.
// I file audio sono già compressi, quindi comprimerli ancora farebbe solo perdere tempo.
// Dimensione totale nota in anticipo (zipSize), così il browser mostra l'avanzamento del download.
// Limite: formato ZIP classico, niente ZIP64 -> al massimo ~4 GB in totale (MAX_ZIP_BYTES).
const fs = require('fs');
const zlib = require('zlib');

const MAX_ZIP_BYTES = 0xFFFFFFFF - 1024 * 1024;

let CRC_TABLE = null;
function crc32(buf, prev = 0) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf, prev);
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = (prev ^ 0xFFFFFFFF) >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(ms) {
  const d = new Date(ms);
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const FLAGS = 0x0808; // bit 3: CRC e dimensioni dopo i dati; bit 11: nomi in UTF-8

function localHeader(nameBuf, dt) {
  const h = Buffer.alloc(30 + nameBuf.length);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(FLAGS, 6);
  h.writeUInt16LE(0, 8); // store
  h.writeUInt16LE(dt.time, 10);
  h.writeUInt16LE(dt.date, 12);
  // crc e dimensioni a 0: arrivano nel data descriptor
  h.writeUInt16LE(nameBuf.length, 26);
  nameBuf.copy(h, 30);
  return h;
}

function descriptor(crc, size) {
  const d = Buffer.alloc(16);
  d.writeUInt32LE(0x08074b50, 0);
  d.writeUInt32LE(crc >>> 0, 4);
  d.writeUInt32LE(size, 8);
  d.writeUInt32LE(size, 12);
  return d;
}

function centralEntry(nameBuf, dt, crc, size, offset) {
  const c = Buffer.alloc(46 + nameBuf.length);
  c.writeUInt32LE(0x02014b50, 0);
  c.writeUInt16LE(20, 4);
  c.writeUInt16LE(20, 6);
  c.writeUInt16LE(FLAGS, 8);
  c.writeUInt16LE(0, 10);
  c.writeUInt16LE(dt.time, 12);
  c.writeUInt16LE(dt.date, 14);
  c.writeUInt32LE(crc >>> 0, 16);
  c.writeUInt32LE(size, 20);
  c.writeUInt32LE(size, 24);
  c.writeUInt16LE(nameBuf.length, 28);
  c.writeUInt32LE(offset, 42);
  nameBuf.copy(c, 46);
  return c;
}

/** Dimensione finale dell'archivio per un elenco di { name, size }. */
function zipSize(entries) {
  let total = 22;
  for (const e of entries) {
    const n = Buffer.byteLength(e.name, 'utf8');
    total += 30 + n + e.size + 16 + 46 + n;
  }
  return total;
}

/**
 * Generatore asincrono di Buffer: Readable.from(zipStream(entries)).pipe(res).
 * entries: [{ name, absPath, size, mtimeMs }]. Se un file cambia di dimensione durante la lettura, lancia un errore.
 */
async function* zipStream(entries) {
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const dt = dosDateTime(e.mtimeMs || Date.now());
    const head = localHeader(nameBuf, dt);
    yield head;
    const start = offset;
    offset += head.length;
    let crc = 0;
    let size = 0;
    for await (const chunk of fs.createReadStream(e.absPath)) {
      crc = crc32(chunk, crc);
      size += chunk.length;
      offset += chunk.length;
      yield chunk;
    }
    if (size !== e.size) throw new Error(`Il file è cambiato durante il download: ${e.name}`);
    const desc = descriptor(crc, size);
    yield desc;
    offset += desc.length;
    central.push(centralEntry(nameBuf, dt, crc, size, start));
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) { yield c; cdSize += c.length; }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(cdStart, 16);
  yield end;
}

module.exports = { zipStream, zipSize, crc32, MAX_ZIP_BYTES };
