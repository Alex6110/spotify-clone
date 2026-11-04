// Elenca le richieste di nuovi artisti fatte dagli utenti: npm run richieste
const { readAll, FILE } = require('../src/lib/requests');

const list = readAll();
if (!list.length) {
  console.log('Nessuna richiesta.');
} else {
  const byArtist = new Map();
  for (const r of list) {
    const k = r.key || r.name;
    if (!byArtist.has(k)) byArtist.set(k, { name: r.name, users: new Set(), first: r.at, deezerId: r.deezerId });
    byArtist.get(k).users.add(r.userName || `utente ${r.userId}`);
  }
  console.log(`${byArtist.size} artisti richiesti (file: ${FILE})\n`);
  [...byArtist.values()]
    .sort((a, b) => b.users.size - a.users.size)
    .forEach((a) => console.log(`- ${a.name}  (${[...a.users].join(', ')}, dal ${a.first.slice(0, 10)})${a.deezerId ? `  https://www.deezer.com/artist/${a.deezerId}` : ''}`));
}
