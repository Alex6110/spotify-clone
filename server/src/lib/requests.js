// Richieste di aggiunta artista: le fanno gli utenti dalla pagina di un artista non ancora in libreria.
// Restano in data/artist-requests.json; l'elenco si legge con "npm run richieste".
const fs = require('fs');
const path = require('path');
const config = require('../config');

const FILE = path.join(config.dataDir, 'artist-requests.json');

function readAll() {
  try {
    const list = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function writeAll(list) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, FILE);
}

function add(entry) {
  const list = readAll();
  const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(), status: 'nuova', ...entry };
  list.push(item);
  writeAll(list);
  return item;
}

module.exports = { readAll, add, FILE };
