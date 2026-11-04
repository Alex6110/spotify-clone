import React, { useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ListPlus, Play, Shuffle } from 'lucide-react';
import { PlayerContext } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { api, errorMessage, isPlayable } from '../lib/api';
import { createPlaylist } from '../lib/playlists';
import PlaylistCover from '../components/ui/PlaylistCover';
import TrackList from '../components/ui/TrackList';
import '../styles/AlbumDetail.css';

// Mix generato per te: ogni volta che lo apri è un po' diverso.
const Mix = () => {
  const { kind, key } = useParams();
  const { playSong } = useContext(PlayerContext);
  const toast = useToast();
  const [mix, setMix] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMix(null); setError('');
    const params = kind === 'artist' ? { kind, id: key } : { kind, name: key };
    api.get('/api/discover/mix', { params }).then((r) => setMix(r.data)).catch((e) => setError(errorMessage(e, 'Mix non disponibile')));
  }, [kind, key]);

  if (error) return <p className="form-error">{error}</p>;
  if (!mix) return <p className="muted-text">Sto preparando il mix...</p>;

  const tracks = mix.tracks;
  const covers = [...new Set(tracks.map((t) => t.cover).filter(Boolean))].slice(0, 4);
  const play = (list) => { const first = list.find(isPlayable); if (first) playSong(first, list); };
  const shuffled = () => [...tracks].sort(() => Math.random() - 0.5);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try { await createPlaylist(mix.title, tracks.map((t) => t.id)); toast('Playlist salvata nella libreria'); }
    catch (e) { toast(errorMessage(e), 'error'); }
    setSaving(false);
  };

  return (
    <div className="album-detail-page">
      <div className="album-header">
        <PlaylistCover covers={covers} className="album-detail-cover" />
        <div className="album-info">
          <p>Mix per te</p>
          <h1>{mix.title}</h1>
          <p className="album-meta">{mix.subtitle}</p>
          <p className="album-meta">{tracks.length} brani</p>
        </div>
      </div>
      <div className="album-actions">
        <button type="button" className="album-play-btn" disabled={!tracks.length} onClick={() => play(tracks)} aria-label="Riproduci"><Play size={24} fill="currentColor" /></button>
        <button type="button" className="round-btn" disabled={!tracks.length} onClick={() => play(shuffled())} aria-label="Riproduci in ordine casuale"><Shuffle size={22} /></button>
        <button type="button" className="round-btn" disabled={!tracks.length || saving} onClick={save} aria-label="Salva come playlist"><ListPlus size={24} /></button>
      </div>
      {tracks.length === 0 ? <p className="muted-text">Non ci sono ancora abbastanza brani per questo mix.</p> : <TrackList tracks={tracks} />}
    </div>
  );
};

export default Mix;
