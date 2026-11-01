import React, { useContext, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, Clock, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { readHistory, addHistory, removeHistory, clearHistory } from '../lib/searchHistory';
import { PlayerContext } from '../context/PlayerContext';
import { api, coverOf, errorMessage, formatDuration, isPlayable } from '../lib/api';
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
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [history, setHistory] = useState(() => readHistory(userId));
  useEffect(() => { setHistory(readHistory(userId)); }, [userId]);
  const remember = (text) => setHistory(addHistory(userId, text));

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

  // la ricerca viene ricordata quando ti fermi a guardare i risultati (non a ogni lettera)
  useEffect(() => {
    if (!results || q.trim().length < 2) return undefined;
    if (!results.artists.length && !results.albums.length && !results.tracks.length) return undefined;
    const t = setTimeout(() => remember(q), 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

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
      {!results && !error && q.trim().length < 2 && history.length > 0 && (
        <section className="search-history">
          <div className="search-history-head">
            <h3>Ricerche recenti</h3>
            <button type="button" className="link-btn" onClick={() => setHistory(clearHistory(userId))}>Cancella tutto</button>
          </div>
          {history.map((h) => (
            <div key={h} className="search-history-row">
              <button type="button" className="search-history-item" onClick={() => setParams({ q: h }, { replace: true })}>
                <Clock size={16} /><span>{h}</span>
              </button>
              <button type="button" className="icon-btn" aria-label={`Rimuovi "${h}" dalla cronologia`} onClick={() => setHistory(removeHistory(userId, h))}><X size={16} /></button>
            </div>
          ))}
        </section>
      )}
      {!results && !error && history.length === 0 && <p className="muted-text">Cerca brani, album e artisti della tua libreria.</p>}
      {empty && <p className="muted-text">Nessun risultato per "{q}".</p>}

      {results?.artists.length > 0 && (
        <section>
          <h3>Artisti</h3>
          <div className="horizontal-scroll">
            {results.artists.map((a) => (
              <Link to={`/artist/${a.id}`} key={a.id} className="artist-chip" onClick={() => remember(q)}>
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
              <div key={t.id} className={`track-row ${currentSong?.id === t.id ? 'active-song' : ''} ${isPlayable(t) ? '' : 'is-broken'}`} onClick={() => { remember(q); playSong(t, results.tracks); }}>
                <img src={coverOf(t)} alt="" loading="lazy" />
                <div className="track-row-text">
                  <span className="song-name">{t.title}</span>
                  <span className="song-sub">{isPlayable(t) ? `${t.artist} · ${t.album}` : 'File danneggiato o incompleto'}</span>
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
              <Link to={`/album/${a.id}`} key={a.id} className="album-card" onClick={() => remember(q)}>
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
