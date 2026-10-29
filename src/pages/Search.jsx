import React, { useContext, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { PlayerContext } from '../context/PlayerContext';
import { api, coverOf, errorMessage, formatDuration } from '../lib/api';
import ArtistAvatar from '../components/ui/ArtistAvatar';
import LikeButton from '../components/ui/LikeButton';
import { TrackMenuButton } from '../components/ui/TrackMenu';
import '../styles/Home.css';

const Search = () => {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const { playSong, currentSong } = useContext(PlayerContext);

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return undefined; }
    let cancelled = false;
    const t = setTimeout(() => {
      api.get('/api/library/search', { params: { q } })
        .then(({ data }) => { if (!cancelled) { setResults(data); setError(''); } })
        .catch((e) => { if (!cancelled) setError(errorMessage(e)); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const empty = results && !results.artists.length && !results.albums.length && !results.tracks.length;

  return (
    <div className="home-page">
      <label className="search-field">
        <SearchIcon size={18} />
        <input
          type="search"
          autoFocus
          placeholder="Cosa vuoi ascoltare?"
          value={q}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
        />
      </label>

      {error && <p className="form-error">{error}</p>}
      {!results && !error && <p className="muted-text">Cerca brani, album e artisti della tua libreria.</p>}
      {empty && <p className="muted-text">Nessun risultato per "{q}".</p>}

      {results?.artists.length > 0 && (
        <section>
          <h3>Artisti</h3>
          <div className="horizontal-scroll">
            {results.artists.map((a) => (
              <Link to={`/artist/${a.id}`} key={a.id} className="artist-chip">
                <ArtistAvatar artist={a} size={96} />
                <span>{a.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results?.tracks.length > 0 && (
        <section>
          <h3>Brani</h3>
          <div className="track-list">
            {results.tracks.map((t) => (
              <div key={t.id} className={`track-row ${currentSong?.id === t.id ? 'active-song' : ''}`} onClick={() => playSong(t, results.tracks)}>
                <img src={coverOf(t)} alt="" loading="lazy" />
                <div className="track-row-text">
                  <span className="song-name">{t.title}</span>
                  <span className="song-sub">{t.artist} · {t.album}</span>
                </div>
                <LikeButton track={t} size={16} />
                <span className="song-duration">{formatDuration(t.durationMs)}</span>
                <TrackMenuButton track={t} size={18} />
              </div>
            ))}
          </div>
        </section>
      )}

      {results?.albums.length > 0 && (
        <section>
          <h3>Album</h3>
          <div className="horizontal-scroll">
            {results.albums.map((a) => (
              <Link to={`/album/${a.id}`} key={a.id} className="album-card">
                <img src={coverOf(a)} alt="" className="album-cover" loading="lazy" />
                <p>{a.title}</p>
                <span>{a.artist}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Search;
