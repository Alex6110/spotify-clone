import React, { useContext, useEffect, useState } from 'react';
import { Clock, Play } from 'lucide-react';
import { PlayerContext } from '../context/PlayerContext';
import { api, errorMessage, isPlayable } from '../lib/api';
import TrackList from '../components/ui/TrackList';
import '../styles/AlbumDetail.css';

// Brani ascoltati di recente (dal più recente), senza doppioni.
const Recents = () => {
  const { playSong } = useContext(PlayerContext);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/library/recent').then((res) => setItems(res.data.items)).catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <p className="form-error">{error}</p>;
  if (!items) return <p className="muted-text">Caricamento...</p>;

  return (
    <div className="album-detail-page">
      <div className="album-header">
        <div className="pl-cover pl-cover-empty album-detail-cover"><Clock size="40%" /></div>
        <div className="album-info">
          <p>Cronologia</p>
          <h1>Recenti</h1>
          <p className="album-meta">{items.length} brani</p>
        </div>
      </div>
      <div className="album-actions">
        <button type="button" className="album-play-btn" disabled={!items.length} onClick={() => { const first = items.find(isPlayable); if (first) playSong(first, items); }} aria-label="Riproduci">
          <Play size={24} fill="currentColor" />
        </button>
      </div>
      {items.length === 0 ? <p className="muted-text">Quello che ascolti comparirà qui.</p> : <TrackList tracks={items} />}
    </div>
  );
};

export default Recents;
