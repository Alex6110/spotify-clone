import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, Heart, Plus, Upload } from 'lucide-react';
import { api, coverOf, errorMessage } from '../lib/api';
import { usePlaylists } from '../lib/playlists';
import PlaylistCover from '../components/ui/PlaylistCover';
import '../styles/Home.css';

const PAGE = 48;
const SORTS = [
  { id: 'recent', label: 'Recenti' },
  { id: 'title', label: 'Titolo' },
  { id: 'artist', label: 'Artista' },
];

const TABS = [{ id: 'albums', label: 'Album' }, { id: 'playlists', label: 'Playlist' }];

const Library = () => {
  const [tab, setTab] = useState('albums');
  const { playlists } = usePlaylists();
  const [sort, setSort] = useState('recent');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (offset, replace) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/api/library/albums', { params: { sort, limit: PAGE, offset } });
      setTotal(data.total);
      setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [sort]);

  useEffect(() => { load(0, true); }, [load]);

  return (
    <div className="home-page">
      <div className="page-head">
        <h3>La tua libreria</h3>
        <Link to="/upload" className="pill-btn"><Upload size={16} /> Carica musica</Link>
      </div>
      <div className="chip-row" role="tablist" aria-label="Sezione">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`chip ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'playlists' && (
        <div className="album-grid">
          <Link to="/liked" className="album-card">
            <div className="pl-cover pl-cover-empty pl-cover-liked album-cover"><Heart size="40%" fill="currentColor" /></div>
            <p>Brani che ti piacciono</p><span>Playlist</span>
          </Link>
          <Link to="/offline" className="album-card">
            <div className="pl-cover pl-cover-empty album-cover"><ArrowDownToLine size="40%" /></div>
            <p>Scaricati</p><span>Sul dispositivo</span>
          </Link>
          <Link to="/create" className="album-card">
            <div className="pl-cover pl-cover-empty album-cover"><Plus size="40%" /></div>
            <p>Nuova playlist</p><span>Crea</span>
          </Link>
          {playlists?.map((pl) => (
            <Link to={`/playlist/${pl.id}`} key={pl.id} className="album-card">
              <PlaylistCover covers={pl.covers} className="album-cover" />
              <p>{pl.name}</p><span>{pl.trackCount} brani</span>
            </Link>
          ))}
        </div>
      )}

      {tab === 'albums' && <>
      <div className="chip-row" role="tablist" aria-label="Ordinamento">
        {SORTS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={sort === s.id} className={`chip ${sort === s.id ? 'active' : ''}`} onClick={() => setSort(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="album-grid">
        {items.map((a) => (
          <Link to={`/album/${a.id}`} key={a.id} className="album-card">
            <img src={coverOf(a)} alt="" className="album-cover" loading="lazy" />
            <p>{a.title}</p>
            <span>{a.artist}</span>
          </Link>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      {items.length < total && (
        <button type="button" className="pill-btn" disabled={loading} onClick={() => load(items.length, false)}>
          {loading ? 'Caricamento...' : `Mostra altri (${total - items.length})`}
        </button>
      )}
      </>}
    </div>
  );
};

export default Library;
