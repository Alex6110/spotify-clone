import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Library, Search as SearchIcon, Heart, Plus } from 'lucide-react';
import { api, coverOf, PLACEHOLDER_COVER } from '../../lib/api';
import { usePlaylists } from '../../lib/playlists';
import PlaylistCover from '../ui/PlaylistCover';

// Pannello sinistro del desktop: navigazione + elenco degli album della libreria
const LibraryPanel = () => {
  const [albums, setAlbums] = useState([]);
  const location = useLocation();
  const { playlists } = usePlaylists();

  useEffect(() => {
    api.get('/api/library/albums', { params: { sort: 'recent', limit: 100 } })
      .then(({ data }) => setAlbums(data.items))
      .catch(() => { /* il pannello resta vuoto se il server non risponde */ });
  }, []);

  return (
    <div className="lib-panel">
      <nav className="left-nav" aria-label="Navigazione">
        <NavLink to="/" end className="left-nav-item"><Home size={20} /> Home</NavLink>
        <NavLink to="/search" className="left-nav-item"><SearchIcon size={20} /> Cerca</NavLink>
      </nav>
      <div className="lib-head">
        <span>La tua libreria</span>
        <span className="lib-head-actions">
          <NavLink to="/create" aria-label="Crea una playlist"><Plus size={18} /></NavLink>
          <NavLink to="/library" aria-label="Apri la libreria completa"><Library size={18} /></NavLink>
        </span>
      </div>
      <div className="lib-list">
        <NavLink to="/liked" className="lib-item">
          <span className="lib-liked-cover"><Heart size={20} fill="currentColor" /></span>
          <span className="lib-item-text">
            <span className="lib-item-title">Brani che ti piacciono</span>
            <span className="lib-item-sub">Playlist</span>
          </span>
        </NavLink>
        {playlists?.map((pl) => (
          <NavLink key={`p${pl.id}`} to={`/playlist/${pl.id}`} className="lib-item">
            <PlaylistCover covers={pl.covers} className="lib-pl-cover" />
            <span className="lib-item-text">
              <span className="lib-item-title">{pl.name}</span>
              <span className="lib-item-sub">Playlist · {pl.trackCount} brani</span>
            </span>
          </NavLink>
        ))}
        {albums.map((a) => (
          <NavLink key={a.id} to={`/album/${a.id}`} className={`lib-item ${location.pathname === `/album/${a.id}` ? 'active' : ''}`}>
            <img
              src={coverOf(a)}
              alt=""
              loading="lazy"
              onError={(e) => { if (!e.currentTarget.src.endsWith(PLACEHOLDER_COVER)) e.currentTarget.src = PLACEHOLDER_COVER; }}
            />
            <span className="lib-item-text">
              <span className="lib-item-title">{a.title}</span>
              <span className="lib-item-sub">Album · {a.artist}</span>
            </span>
          </NavLink>
        ))}
      </div>
    </div>
  );
};

export default LibraryPanel;
