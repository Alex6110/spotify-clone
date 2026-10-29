import React, { useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Play, Pause, Pencil, Trash2, Check, X, HardDriveDownload } from 'lucide-react';
import { PlayerContext } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { api, downloadUrl, errorMessage, formatDuration, isPlayable } from '../lib/api';
import { deletePlaylist, removeFromPlaylist, renamePlaylist } from '../lib/playlists';
import PlaylistCover from '../components/ui/PlaylistCover';
import DownloadButton from '../components/ui/DownloadButton';
import TrackList from '../components/ui/TrackList';
import '../styles/AlbumDetail.css';

const PlaylistDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { playSong, currentSong, isPlaying } = useContext(PlayerContext);
  const [playlist, setPlaylist] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setPlaylist(null); setError(''); setEditing(false); setConfirmDelete(false);
    api.get(`/api/playlists/${id}`).then(({ data }) => setPlaylist(data)).catch((e) => setError(errorMessage(e, 'Playlist non trovata')));
  }, [id]);

  if (error) return <p className="form-error">{error}</p>;
  if (!playlist) return <p className="muted-text">Caricamento...</p>;

  const tracks = playlist.tracks;
  const totalMs = tracks.reduce((sum, t) => sum + (t.durationMs || 0), 0);
  const covers = [...new Set(tracks.map((t) => t.cover).filter(Boolean))].slice(0, 4);
  const playing = tracks.some((t) => t.id === currentSong?.id) && isPlaying;

  const play = () => {
    const first = tracks.find((t) => t.id === currentSong?.id) || tracks.find(isPlayable);
    if (first) playSong(first, tracks);
  };

  const saveName = async (e) => {
    e.preventDefault();
    const next = name.trim();
    if (!next) return;
    try {
      await renamePlaylist(playlist.id, next);
      setPlaylist((p) => ({ ...p, name: next }));
      setEditing(false);
    } catch (err) { toast(errorMessage(err), 'error'); }
  };

  const remove = async (track) => {
    try {
      await removeFromPlaylist(playlist.id, track.position);
      setPlaylist((p) => ({ ...p, tracks: p.tracks.filter((t) => t.position !== track.position) }));
      toast('Rimosso dalla playlist');
    } catch (err) { toast(errorMessage(err), 'error'); }
  };

  const doDelete = async () => {
    try { await deletePlaylist(playlist.id); toast('Playlist eliminata'); navigate('/library', { replace: true }); }
    catch (err) { toast(errorMessage(err), 'error'); }
  };

  return (
    <div className="album-detail-page">
      <div className="album-header">
        <PlaylistCover covers={covers} className="album-detail-cover" />
        <div className="album-info">
          <p>Playlist</p>
          {editing ? (
            <form className="inline-edit" onSubmit={saveName}>
              <input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Nome della playlist" />
              <button type="submit" className="icon-btn" aria-label="Salva"><Check size={20} /></button>
              <button type="button" className="icon-btn" aria-label="Annulla" onClick={() => setEditing(false)}><X size={20} /></button>
            </form>
          ) : (
            <h1>{playlist.name}</h1>
          )}
          <p className="album-meta">{tracks.length} brani{totalMs ? `, ${formatDuration(totalMs)}` : ''}</p>
        </div>
      </div>

      <div className="album-actions">
        <button type="button" className="album-play-btn" onClick={play} disabled={!tracks.length} aria-label={playing ? 'Pausa' : 'Riproduci playlist'}>
          {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
        </button>
        <DownloadButton tracks={tracks} />
        {tracks.length > 0 && <a className="icon-btn round-btn" href={downloadUrl('playlist', playlist.id)} download aria-label="Scarica la playlist come file ZIP" title="Scarica la playlist (ZIP)"><HardDriveDownload size={18} /></a>}
        <button type="button" className="icon-btn round-btn" aria-label="Rinomina" onClick={() => { setName(playlist.name); setEditing(true); }}><Pencil size={18} /></button>
        {confirmDelete ? (
          <span className="confirm-inline">
            Eliminare?
            <button type="button" className="pill-btn danger" onClick={doDelete}>Elimina</button>
            <button type="button" className="pill-btn" onClick={() => setConfirmDelete(false)}>Annulla</button>
          </span>
        ) : (
          <button type="button" className="icon-btn round-btn" aria-label="Elimina playlist" onClick={() => setConfirmDelete(true)}><Trash2 size={18} /></button>
        )}
      </div>

      {tracks.length === 0
        ? <p className="muted-text">Playlist vuota. Dal menu "..." di un brano scegli "Aggiungi a una playlist".</p>
        : <TrackList tracks={tracks} onRemove={remove} />}
    </div>
  );
};

export default PlaylistDetail;
