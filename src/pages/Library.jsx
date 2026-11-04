import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpDown, Heart, LayoutGrid, List, Plus, Search as SearchIcon, X, Pin } from 'lucide-react';
import { api, coverOf, photoOf, errorMessage } from '../lib/api';
import { usePlaylists } from '../lib/playlists';
import { useMobileUi } from '../context/MobileUiContext';
import MobileHeader from '../components/layout/MobileHeader';
import PlaylistCover from '../components/ui/PlaylistCover';
import '../styles/discover.css';

const PAGE = 48;
const TABS = [{ id: 'playlists', label: 'Playlist' }, { id: 'albums', label: 'Album' }, { id: 'artists', label: 'Artisti' }];
const SORTS = [{ id: 'recent', label: 'Recenti' }, { id: 'title', label: 'Titolo' }];
const viewKey = 'musica_library_view';
const readView = () => { try { return localStorage.getItem(viewKey) === 'grid' ? 'grid' : 'list'; } catch { return 'list'; } };

// una voce della libreria, in elenco o in griglia
const Item = ({ to, art, title, sub, round, pinned, view }) => (
  <Link to={to} className={`lib-entry ${view === 'grid' ? 'is-grid' : ''}`}>
    <span className={`lib-art${round ? ' is-round' : ''}`}>{art}</span>
    <span className="lib-text">
      <strong>{title}</strong>
      <small>{pinned && <Pin size={13} className="lib-pin" />}{sub}</small>
    </span>
  </Link>
);

const Library = () => {
  const ui = useMobileUi();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : null; // null = tutto
  const genre = params.get('genre') || '';
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState(readView);
  const [showFilter, setShowFilter] = useState(false);
  const [filter, setFilter] = useState('');
  const [debounced, setDebounced] = useState('');
  const { playlists } = usePlaylists();
  const [albums, setAlbums] = useState({ items: [], total: 0 });
  const [artists, setArtists] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { const t = setTimeout(() => setDebounced(filter.trim()), 250); return () => clearTimeout(t); }, [filter]);

  const wantAlbums = tab === null || tab === 'albums';
  const wantArtists = tab === 'artists';

  const loadAlbums = useCallback(async (offset, replace) => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/api/library/albums', { params: { sort: sort === 'title' ? 'title' : 'recent', limit: PAGE, offset, ...(debounced ? { q: debounced } : {}), ...(genre ? { genre } : {}) } });
      setAlbums((p) => ({ total: data.total, items: replace ? data.items : [...p.items, ...data.items] }));
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [sort, debounced, genre]);

  const loadArtists = useCallback(async (offset, replace) => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/api/library/artists', { params: { sort: sort === 'title' ? 'title' : 'recent', limit: PAGE, offset, ...(debounced ? { q: debounced } : {}) } });
      setArtists((p) => ({ total: data.total, items: replace ? data.items : [...p.items, ...data.items] }));
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [sort, debounced]);

  useEffect(() => { if (wantAlbums) loadAlbums(0, true); }, [wantAlbums, loadAlbums]);
  useEffect(() => { if (wantArtists) loadArtists(0, true); }, [wantArtists, loadArtists]);

  const setTab = (id) => {
    const next = new URLSearchParams(params);
    if (id && id !== tab) next.set('tab', id); else next.delete('tab');
    setParams(next, { replace: true });
  };
  const clearGenre = () => { const next = new URLSearchParams(params); next.delete('genre'); setParams(next, { replace: true }); };
  const toggleView = () => { const v = view === 'list' ? 'grid' : 'list'; setView(v); try { localStorage.setItem(viewKey, v); } catch { /* niente */ } };
  const nextSort = () => setSort((s) => SORTS[(SORTS.findIndex((x) => x.id === s) + 1) % SORTS.length].id);

  const pls = useMemo(() => {
    let list = [...(playlists || [])];
    if (debounced) list = list.filter((p) => p.name.toLowerCase().includes(debounced.toLowerCase()));
    if (sort === 'title') list.sort((a, b) => a.name.localeCompare(b.name, 'it'));
    else list.reverse();
    return list;
  }, [playlists, debounced, sort]);

  const showPinned = (tab === null || tab === 'playlists') && !debounced;
  const showPlaylists = tab === null || tab === 'playlists';

  return (
    <div className="lib-page">
      <MobileHeader>
        <button type="button" aria-label="Cerca nella libreria" onClick={() => { setShowFilter((v) => !v); if (showFilter) setFilter(''); }}><SearchIcon size={26} /></button>
        <button type="button" aria-label="Crea" onClick={() => ui?.openCreate()}><Plus size={30} /></button>
      </MobileHeader>

      <div className="lib-sticky">
        <div className="lib-chips" role="tablist" aria-label="Sezione">
          {tab && <button type="button" className="chip-x" aria-label="Mostra tutto" onClick={() => setTab(null)}><X size={18} /></button>}
          {TABS.filter((t) => !tab || t.id === tab).map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`lib-chip${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
          {genre && <button type="button" className="lib-chip active" onClick={clearGenre}>{genre} <X size={14} /></button>}
        </div>
        {showFilter && (
          <label className="lib-filter">
            <SearchIcon size={18} />
            <input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Cerca nella libreria" />
            {filter && <button type="button" aria-label="Cancella" onClick={() => setFilter('')}><X size={16} /></button>}
          </label>
        )}
      </div>

      <div className="lib-sortrow">
        <button type="button" className="lib-sort" onClick={nextSort}><ArrowUpDown size={18} /> {SORTS.find((s) => s.id === sort).label}</button>
        <button type="button" className="lib-viewbtn" onClick={toggleView} aria-label={view === 'list' ? 'Mostra a griglia' : 'Mostra a elenco'}>{view === 'list' ? <LayoutGrid size={22} /> : <List size={22} />}</button>
      </div>

      <div className={view === 'grid' ? 'lib-grid' : 'lib-entries'}>
        {showPinned && (
          <>
            <Item view={view} pinned to="/liked" title="Brani che ti piacciono" sub="Playlist" art={<span className="pl-cover pl-cover-liked pl-cover-empty lib-fill"><Heart size="42%" fill="currentColor" /></span>} />
            <Item view={view} pinned to="/offline" title="Scaricati" sub="Sul dispositivo" art={<span className="pl-cover pl-cover-empty lib-fill"><ArrowDownToLine size="42%" /></span>} />
          </>
        )}
        {showPlaylists && pls.map((pl) => (
          <Item key={`p${pl.id}`} view={view} to={`/playlist/${pl.id}`} title={pl.name} sub={`Playlist • ${pl.trackCount} brani`} art={<PlaylistCover covers={pl.covers} className="lib-fill" />} />
        ))}
        {wantAlbums && albums.items.map((a) => (
          <Item key={`a${a.id}`} view={view} to={`/album/${a.id}`} title={a.title} sub={`Album • ${a.artist}`} art={<img src={coverOf(a)} alt="" loading="lazy" className="lib-fill" />} />
        ))}
        {wantArtists && artists.items.map((a) => (
          <Item key={`r${a.id}`} view={view} round to={`/artist/${a.id}`} title={a.name} sub={`Artista • ${a.albumCount} album`} art={<img src={photoOf(a)} alt="" loading="lazy" className="lib-fill" />} />
        ))}
      </div>

      {error && <p className="form-error">{error}</p>}
      {wantAlbums && albums.items.length < albums.total && (
        <button type="button" className="pill-btn lib-more" disabled={loading} onClick={() => loadAlbums(albums.items.length, false)}>{loading ? 'Caricamento...' : `Mostra altri (${albums.total - albums.items.length})`}</button>
      )}
      {wantArtists && artists.items.length < artists.total && (
        <button type="button" className="pill-btn lib-more" disabled={loading} onClick={() => loadArtists(artists.items.length, false)}>{loading ? 'Caricamento...' : `Mostra altri (${artists.total - artists.items.length})`}</button>
      )}
      {tab === 'playlists' && playlists && pls.length === 0 && debounced && <p className="muted-text">Nessuna playlist trovata.</p>}
    </div>
  );
};

export default Library;
