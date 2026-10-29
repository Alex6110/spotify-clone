import React, { useContext, useEffect, useState } from 'react';
import { Heart, Play } from 'lucide-react';
import { PlayerContext } from '../context/PlayerContext';
import { api, errorMessage, isPlayable } from '../lib/api';
import TrackList from '../components/ui/TrackList';
import '../styles/AlbumDetail.css';

const LikedSongs = () => {
  const { playSong } = useContext(PlayerContext);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/library/likes', { params: { limit: 200 } }).then((res) => setData(res.data)).catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="muted-text">Caricamento...</p>;

  return (
    <div className="album-detail-page">
      <div className="album-header">
        <div className="pl-cover pl-cover-empty pl-cover-liked album-detail-cover"><Heart size="40%" fill="currentColor" /></div>
        <div className="album-info">
          <p>Playlist</p>
          <h1>Brani che ti piacciono</h1>
          <p className="album-meta">{data.total} brani</p>
        </div>
      </div>
      <div className="album-actions">
        <button type="button" className="album-play-btn" disabled={!data.items.length} onClick={() => { const first = data.items.find(isPlayable); if (first) playSong(first, data.items); }} aria-label="Riproduci">
          <Play size={24} fill="currentColor" />
        </button>
      </div>
      {data.items.length === 0
        ? <p className="muted-text">Tocca il cuore su un brano per ritrovarlo qui.</p>
        : <TrackList tracks={data.items} />}
    </div>
  );
};

export default LikedSongs;
