import React, { useContext, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Play, Pause, HardDriveDownload } from 'lucide-react';
import { PlayerContext } from '../context/PlayerContext';
import { api, coverOf, downloadUrl, errorMessage, formatDuration } from '../lib/api';
import LikeButton from '../components/ui/LikeButton';
import Equalizer from '../components/ui/Equalizer';
import DownloadButton from '../components/ui/DownloadButton';
import { TrackMenuButton } from '../components/ui/TrackMenu';
import '../styles/AlbumDetail.css';

function AlbumDetail() {
  const { id } = useParams();
  const [album, setAlbum] = useState(null);
  const [error, setError] = useState('');
  const { playSong, currentSong, isPlaying } = useContext(PlayerContext);

  useEffect(() => {
    setAlbum(null);
    setError('');
    api.get(`/api/library/albums/${id}`).then((res) => setAlbum(res.data)).catch((e) => setError(errorMessage(e, 'Album non trovato')));
  }, [id]);

  if (error) return <p className="form-error">{error}</p>;
  if (!album) return <p className="muted-text">Caricamento...</p>;

  const totalMs = album.tracks.reduce((sum, t) => sum + (t.durationMs || 0), 0);
  const albumPlaying = album.tracks.some((t) => t.id === currentSong?.id) && isPlaying;
  const playAlbum = () => {
    const first = album.tracks.find((t) => t.id === currentSong?.id) || album.tracks[0];
    if (first) playSong(first, album.tracks);
  };

  return (
    <div className="album-detail-page">
      <div className="album-header">
        <img src={coverOf(album)} alt={album.title} className="album-detail-cover" />
        <div className="album-info">
          <p>Album</p>
          <h1>{album.title}</h1>
          <p className="album-meta">
            <Link to={`/artist/${album.artistId}`} className="inline-link"><strong>{album.artist}</strong></Link>
            {album.year ? ` · ${album.year}` : ''} · {album.tracks.length} brani{totalMs ? `, ${formatDuration(totalMs)}` : ''}
          </p>
        </div>
      </div>

      <div className="album-actions">
        <button type="button" className="album-play-btn" onClick={playAlbum} aria-label={albumPlaying ? 'Pausa' : 'Riproduci album'}>
          {albumPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
        </button>
        <DownloadButton tracks={album.tracks} />
        <a className="icon-btn round-btn" href={downloadUrl('album', album.id)} download aria-label="Scarica l'album come file ZIP" title="Scarica l'album (ZIP)"><HardDriveDownload size={18} /></a>
      </div>

      <div className="songs-list">
        <div className="list-header">
          <span>#</span>
          <span>Titolo</span>
          <span />
          <span className="col-time">Durata</span>
          <span />
        </div>
        <hr />
        {album.tracks.map((song, index) => {
          const isCurrent = currentSong?.id === song.id;
          return (
            <div
              key={song.id}
              className={`song-row ${isCurrent ? 'active-song' : ''}`}
              onClick={() => playSong(song, album.tracks)}
            >
              <span className="song-number">{isCurrent ? <Equalizer playing={isPlaying} /> : (song.trackNo ?? index + 1)}</span>
              <div className="song-details">
                <span className="song-name">{song.title}</span>
                {song.artist !== album.artist && <span className="song-sub">{song.artist}</span>}
              </div>
              <LikeButton track={song} size={16} />
              <span className="song-duration">{formatDuration(song.durationMs)}</span>
              <TrackMenuButton track={song} size={18} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AlbumDetail;
