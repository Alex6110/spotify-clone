import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { readHistory, addHistory, removeHistory, clearHistory, historyKey } from '../lib/searchHistory';
import { PlayerContext } from '../context/PlayerContext';
import { api, coverOf, photoOf, errorMessage, formatDuration, isPlayable } from '../lib/api';
import { useIsMobile } from '../lib/useIsMobile';
import MobileHeader from '../components/layout/MobileHeader';
import ArtistAvatar from '../components/ui/ArtistAvatar';
import LikeButton from '../components/ui/LikeButton';
import { TrackMenuButton } from '../components/ui/TrackMenu';
import '../styles/discover.css';

const hueOf = (s) => { let h = 11; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const TYPE_LABEL = { track: 'Brano', album: 'Album', artist: 'Artista' };

const Search = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const isMobile = useIsMobile();
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [explore, setExplore] = useState(null);
  const { playSong, currentSong } = useContext(PlayerContext);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [history, setHistory] = useState(() => readHistory(userId));
  useEffect(() => { setHistory(readHistory(userId)); }, [userId]);
  const remember = (entry) => setHistory(addHistory(userId, entry));

  // sul telefono: sfoglia (generi, album da riscoprire) finché non si tocca la barra; poi cronologia e risultati
  const searching = !isMobile || focused || q.length > 0;

  useEffect(() => {
    if (!isMobile) return undefined;
    let alive = true;
    api.get('/api/discover/explore').then((r) => alive && setExplore(r.data)).catch(() => {});
    return () => { alive = false; };
  }, [isMobile]);

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

  // il testo cercato viene ricordato quando ti fermi a guardare i risultati (non a ogni lettera)
  useEffect(() => {
    if (!results || q.trim().length < 2) return undefined;
    if (!results.artists.length && !results.albums.length && !results.tracks.length) return undefined;
    const t = setTimeout(() => remember({ type: 'query', title: q.trim() }), 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  const focusBar = () => {
    setFocused(true);
    document.querySelector('.main-content')?.scrollTo(0, 0);
  };
  const cancel = () => {
    setFocused(false);
    setParams({}, { replace: true });
    inputRef.current?.blur();
  };

  const empty = results && !results.artists.length && !results.albums.length && !results.tracks.length;
  const trackEntry = (t) => ({ type: 'track', id: t.id, title: t.title, sub: t.artist, cover: t.cover, track: t });
  const albumEntry = (a) => ({ type: 'album', id: a.id, title: a.title, sub: a.artist, cover: a.cover });
  const artistEntry = (a) => ({ type: 'artist', id: a.id, title: a.name, photo: a.photo, cover: a.cover });

  const openEntry = (h) => {
    if (h.type === 'query') setParams({ q: h.title }, { replace: true });
    else if (h.type === 'artist') navigate(`/artist/${h.id}`);
    else if (h.type === 'album') navigate(`/album/${h.id}`);
    else if (h.track) playSong(h.track, [h.track]);
  };

  return (
    <div className={`search-page${searching && isMobile ? ' is-searching' : ''}`}>
      {isMobile && !searching && <MobileHeader sticky={false} />}

      <div className="search-bar-wrap">
        <label className="search-bar">
          <SearchIcon size={22} />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            placeholder="Cosa vuoi ascoltare?"
            value={q}
            onFocus={focusBar}
            onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
          />
          {q && <button type="button" className="search-clear" aria-label="Cancella il testo" onMouseDown={(e) => e.preventDefault()} onClick={() => { setParams({}, { replace: true }); inputRef.current?.focus(); }}><X size={18} /></button>}
        </label>
        {isMobile && searching && <button type="button" className="search-cancel" onClick={cancel}>Annulla</button>}
      </div>

      {isMobile && !searching && (
        <div className="browse">
          <div className="browse-top">
            <Link to="/library?tab=artists" className="browse-tile" style={{ '--tile-h': 330 }}>Artisti</Link>
            <Link to="/library?tab=albums" className="browse-tile" style={{ '--tile-h': 200 }}>Album</Link>
            <Link to="/liked" className="browse-tile" style={{ '--tile-h': 265 }}>Preferiti</Link>
            <Link to="/offline" className="browse-tile" style={{ '--tile-h': 150 }}>Scaricati</Link>
          </div>

          {explore?.rediscover?.length > 0 && (
            <section className="shelf">
              <h2>Scopri qualcosa di nuovo</h2>
              <div className="shelf-row">
                {explore.rediscover.map((a) => (
                  <Link key={a.id} to={`/album/${a.id}`} className="dcard">
                    <img src={coverOf(a)} alt="" className="dcard-img" loading="lazy" />
                    <p className="dcard-title">{a.title}</p>
                    <p className="dcard-sub">{a.artist}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {explore?.genres?.length > 0 && (
            <section className="shelf">
              <h2>Sfoglia per genere</h2>
              <div className="genre-grid">
                {explore.genres.map((g) => (
                  <Link key={g.name} to={`/library?tab=albums&genre=${encodeURIComponent(g.name)}`} className="genre-tile" style={{ '--tile-h': hueOf(g.name) }}>
                    <span>{g.name}</span>
                    {g.cover && <img src={coverOf(g)} alt="" loading="lazy" />}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {searching && (
        <div className="search-body">
          {error && <p className="form-error">{error}</p>}

          {!results && !error && q.trim().length < 2 && history.length > 0 && (
            <section className="search-history">
              <h2>Ricerche recenti</h2>
              {history.map((h) => (
                <div key={historyKey(h)} className="hist-row">
                  <button type="button" className="hist-main" onClick={() => openEntry(h)}>
                    {h.type === 'query' ? (
                      <span className="hist-ico"><SearchIcon size={20} /></span>
                    ) : (
                      <img src={h.type === 'artist' ? photoOf(h) : coverOf(h)} alt="" className={h.type === 'artist' ? 'is-round' : ''} loading="lazy" />
                    )}
                    <span className="hist-text">
                      <strong>{h.title}</strong>
                      <small>{h.type === 'query' ? 'Ricerca' : `${TYPE_LABEL[h.type]}${h.sub ? ` • ${h.sub}` : ''}`}</small>
                    </span>
                  </button>
                  <button type="button" className="hist-x" aria-label={`Rimuovi "${h.title}" dalla cronologia`} onClick={() => setHistory(removeHistory(userId, h))}><X size={20} /></button>
                </div>
              ))}
              <button type="button" className="hist-clear" onClick={() => setHistory(clearHistory(userId))}>Cancella cronologia</button>
            </section>
          )}
          {!results && !error && q.trim().length < 2 && history.length === 0 && <p className="muted-text">Cerca brani, album e artisti della tua libreria.</p>}
          {empty && <p className="muted-text">Nessun risultato per "{q}".</p>}

          {results?.artists.length > 0 && (
            <section>
              <h3>Artisti</h3>
              <div className="horizontal-scroll">
                {results.artists.map((a) => (
                  <Link to={`/artist/${a.id}`} key={a.id} className="artist-chip" onClick={() => remember(artistEntry(a))}>
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
                  <div key={t.id} className={`track-row ${currentSong?.id === t.id ? 'active-song' : ''} ${isPlayable(t) ? '' : 'is-broken'}`} onClick={() => { remember(trackEntry(t)); playSong(t, results.tracks); }}>
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
                  <Link to={`/album/${a.id}`} key={a.id} className="album-card" onClick={() => remember(albumEntry(a))}>
                    <img src={coverOf(a)} alt="" className="album-cover" loading="lazy" />
                    <p>{a.title}</p>
                    <span>{a.artist}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default Search;
