// Esegui con: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../src/lib/text');

test('normKey ignora maiuscole, accenti e punteggiatura ma non cancella gli altri alfabeti', () => {
  assert.equal(t.normKey('10,000 Maniacs'), '10 000 maniacs');
  assert.equal(t.normKey('Mötley Crüe'), 'motley crue');
  assert.equal(t.normKey('AC/DC'), 'ac dc');
  assert.equal(t.normKey('Simon & Garfunkel'), 'simon and garfunkel');
  assert.equal(t.normKey('宇多田ヒカル'), '宇多田ヒカル'.normalize('NFKD').toLowerCase());
  assert.notEqual(t.normKey('宇多田ヒカル'), t.normKey('椎名林檎'));
  assert.equal(t.normKey(''), '');
  assert.equal(t.normKey(null), '');
});

test('parseTrackFile riconosce numero di traccia e disco', () => {
  assert.deepEqual(t.parseTrackFile('03 - Trouble Me (Live).mp3'), { discNo: null, trackNo: 3, title: 'Trouble Me (Live)' });
  assert.deepEqual(t.parseTrackFile('1-03 Titolo.flac'), { discNo: 1, trackNo: 3, title: 'Titolo' });
  assert.deepEqual(t.parseTrackFile('07. Something.mp3'), { discNo: null, trackNo: 7, title: 'Something' });
  assert.deepEqual(t.parseTrackFile('99 Luftballons.mp3'), { discNo: null, trackNo: null, title: '99 Luftballons' });
  assert.deepEqual(t.parseTrackFile('12 - 99 Luftballons.mp3'), { discNo: null, trackNo: 12, title: '99 Luftballons' });
  assert.deepEqual(t.parseTrackFile('Senza numero.mp3'), { discNo: null, trackNo: null, title: 'Senza numero' });
});

test('parseRelPath gestisce le strutture della libreria', () => {
  assert.deepEqual(t.parseRelPath("10,000 Maniacs/10,000 Maniacs - Candy Everybody Wants/03 - Trouble Me (Live).mp3"),
    { artist: '10,000 Maniacs', album: 'Candy Everybody Wants', discNo: null, albumMissing: false, fileName: '03 - Trouble Me (Live).mp3' });
  assert.equal(t.parseRelPath('Pink Floyd/The Wall/CD2/01 - x.mp3').discNo, 2);
  assert.equal(t.parseRelPath('Pink Floyd/The Wall/CD2/01 - x.mp3').album, 'The Wall');
  const single = t.parseRelPath('Queen - Queen II/01 - Procession.mp3');
  assert.equal(single.artist, 'Queen');
  assert.equal(single.album, 'Queen II');
  const root = t.parseRelPath('brano.mp3');
  assert.equal(root.artist, 'Artista sconosciuto');
});

test('safeJoin blocca path traversal', () => {
  assert.equal(t.safeJoin('/srv/music', '../etc/passwd'), null);
  assert.equal(t.safeJoin('/srv/music', 'a/../../x'), null);
  assert.equal(t.safeJoin('/srv/music', 'A/B/c.mp3'), '/srv/music/A/B/c.mp3');
  assert.equal(t.safeJoin('/srv/music', '/etc/passwd'), '/etc/passwd'.startsWith('/srv/music') ? '/etc/passwd' : null);
});

test('parseYear e isAudioFile', () => {
  assert.equal(t.parseYear('1989-05-02'), 1989);
  assert.equal(t.parseYear(''), null);
  assert.equal(t.parseYear('abcd'), null);
  assert.equal(t.isAudioFile('x.MP3'), true);
  assert.equal(t.isAudioFile('cover.jpg'), false);
});

test('legacySlug coincide con i nomi delle vecchie cover', () => {
  assert.equal(t.legacySlug('10,000 Maniacs', '10,000 Maniacs - Candy Everybody Wants'), '10-000-maniacs-10-000-maniacs-candy-everybody-wants');
  assert.equal(t.legacySlug('10,000 Maniacs'), '10-000-maniacs');
});

test('safeFileName toglie i caratteri vietati e i punti ai bordi', () => {
  const { safeFileName } = require('../src/lib/text');
  assert.equal(safeFileName('AC/DC'), 'AC_DC');
  assert.equal(safeFileName('  Che cosa? "Boh": <x>  '), 'Che cosa_ _Boh_ _x_');
  assert.equal(safeFileName('..nascosto.'), 'nascosto');
  assert.equal(safeFileName('../../etc/passwd'), '_.._etc_passwd');
  assert.equal(safeFileName(''), '');
  assert.ok(safeFileName('x'.repeat(300)).length <= 120);
});

test('trackFileName rispetta il formato letto dallo scanner', () => {
  const { trackFileName, parseTrackFile } = require('../src/lib/text');
  assert.equal(trackFileName({ title: 'Heroes', trackNo: 3, discNo: 1, ext: 'MP3' }), '03 - Heroes.mp3');
  assert.equal(trackFileName({ title: 'Heroes', trackNo: 3, discNo: 2, ext: '.flac' }), '2-03 Heroes.flac');
  assert.equal(trackFileName({ title: 'Senza numero', ext: 'm4a' }), 'Senza numero.m4a');
  for (const args of [{ title: 'Heroes', trackNo: 3, discNo: 2, ext: 'flac' }, { title: 'Heroes', trackNo: 12, discNo: 1, ext: 'mp3' }]) {
    const back = parseTrackFile(trackFileName(args));
    assert.equal(back.title, 'Heroes');
    assert.equal(back.trackNo, args.trackNo);
  }
});

test('planDestination usa le cartelle esistenti e ne crea di nuove', async () => {
  const { planDestination } = require('../src/lib/upload');
  const db = {
    findArtistByKey: async (key) => (key === 'ac dc' ? { id: 1, name: 'AC-DC' } : null),
    findAlbumFolder: async (artistId, albumKey) => (albumKey === 'back in black' ? 'AC-DC/Back In Black (1980)' : null),
  };
  const known = await planDestination({
    tags: { title: 'Hells Bells', artist: 'AC/DC', albumArtist: '', album: 'Back in Black', trackNo: 1, discNo: 1 },
    fileName: 'x.mp3', ext: 'mp3', db,
  });
  assert.deepEqual([known.dir, known.fileName, known.artistIsNew, known.albumIsNew], ['AC-DC/Back In Black (1980)', '01 - Hells Bells.mp3', false, false]);

  const fresh = await planDestination({
    tags: { title: 'Nuova', artist: 'Gruppo Nuovo', album: 'Gruppo Nuovo - Debutto', trackNo: 2, discNo: 2 },
    fileName: 'y.flac', ext: 'flac', db,
  });
  assert.deepEqual([fresh.dir, fresh.fileName, fresh.artistIsNew, fresh.albumIsNew], ['Gruppo Nuovo/Debutto', '2-02 Nuova.flac', true, true]);

  const bare = await planDestination({ tags: {}, hint: { artist: 'Edoardo Bennato', album: 'Burattino' }, fileName: '04 - Titolo.mp3', ext: 'mp3', db });
  assert.deepEqual([bare.dir, bare.fileName], ['Edoardo Bennato/Burattino', '04 - Titolo.mp3']);

  const nothing = await planDestination({ tags: {}, fileName: 'a.mp3', ext: 'mp3', db });
  assert.equal(nothing.dir, 'Artista sconosciuto/Album sconosciuto');
});

test('albumMissing: file sciolti nella cartella dell\'artista', () => {
  assert.equal(t.parseRelPath('Highsnob/01 - x.mp3').albumMissing, true);
  assert.equal(t.parseRelPath('Highsnob/Album/01 - x.mp3').albumMissing, false);
  assert.equal(t.parseRelPath('Queen - Queen II/01 - x.mp3').albumMissing, false);
});

test('sameArtistFamily riconosce le collaborazioni ma non nomi diversi', () => {
  assert.equal(t.sameArtistFamily('Zucchero Feat. Eric Clapton', 'Zucchero'), true);
  assert.equal(t.sameArtistFamily('Zucchero', 'Zucchero & John Lee Hooker'), true);
  assert.equal(t.sameArtistFamily('Santana Feat. Maná', 'Santana'), true);
  assert.equal(t.sameArtistFamily('Alice', 'Alice in Chains'), true); // limite noto: succede solo se stanno nello stesso album
  assert.equal(t.sameArtistFamily('Queen', 'Queensrÿche'), false);
  assert.equal(t.sameArtistFamily('Al', 'Alice Cooper'), false);
  assert.equal(t.sameArtistFamily('Pink Floyd', 'Roger Waters'), false);
});
