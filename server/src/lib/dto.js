// Forma unica con cui brani e album escono dall'API (piatta, comoda per il player).
const trackSelect = {
  id: true, title: true, trackNo: true, discNo: true, durationMs: true, format: true,
  artistId: true, albumId: true,
  artist: { select: { name: true } },
  album: { select: { title: true, cover: true, year: true, artist: { select: { id: true, name: true } } } },
};

const trackDto = (t, liked) => ({
  id: t.id,
  title: t.title,
  trackNo: t.trackNo,
  discNo: t.discNo,
  durationMs: t.durationMs,
  format: t.format,
  artistId: t.artistId,
  artist: t.artist.name,
  albumId: t.albumId,
  album: t.album.title,
  albumArtist: t.album.artist.name,
  cover: t.album.cover,
  year: t.album.year,
  ...(liked === undefined ? {} : { liked }),
});

const albumSelect = {
  id: true, title: true, year: true, genre: true, cover: true,
  artist: { select: { id: true, name: true } },
};
const albumDto = (a) => ({
  id: a.id, title: a.title, year: a.year, genre: a.genre, cover: a.cover,
  artistId: a.artist.id, artist: a.artist.name,
});

module.exports = { trackSelect, trackDto, albumSelect, albumDto };
