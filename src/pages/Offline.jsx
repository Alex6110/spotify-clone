import React, { useContext, useEffect, useState } from 'react';
import { ArrowDownToLine, Play, Trash2 } from 'lucide-react';
import { PlayerContext } from '../context/PlayerContext';
import { useToast } from '../context/ToastContext';
import { formatBytes, isOfflineSupported, listOffline, removeAllOffline, removeTrack, storageInfo, useOfflineIds } from '../lib/offline';
import TrackList from '../components/ui/TrackList';
import '../styles/AlbumDetail.css';

const Offline = () => {
  const { playSong } = useContext(PlayerContext);
  const toast = useToast();
  const ids = useOfflineIds(); // cambia quando scarichi o rimuovi brani
  const [tracks, setTracks] = useState(null);
  const [info, setInfo] = useState(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!isOfflineSupported()) { setTracks([]); return; }
    listOffline().then(setTracks);
    storageInfo().then(setInfo);
  }, [ids]);

  if (!isOfflineSupported()) {
    return <p className="muted-text">Gli ascolti offline richiedono l'app aperta in HTTPS (o su localhost) e un browser recente.</p>;
  }
  if (!tracks) return <p className="muted-text">Caricamento...</p>;

  const size = tracks.reduce((sum, t) => sum + (t.size || 0), 0);

  return (
    <div className="album-detail-page">
      <div className="album-header">
        <div className="pl-cover pl-cover-empty pl-cover-liked album-detail-cover"><ArrowDownToLine size="40%" /></div>
        <div className="album-info">
          <p>Sul dispositivo</p>
          <h1>Scaricati</h1>
          <p className="album-meta">{tracks.length} brani · {formatBytes(size)}{info?.quota ? ` · spazio disponibile ${formatBytes(info.quota - (info.usage || 0))}` : ''}</p>
        </div>
      </div>

      <div className="album-actions">
        <button type="button" className="album-play-btn" disabled={!tracks.length} onClick={() => playSong(tracks[0], tracks)} aria-label="Riproduci">
          <Play size={24} fill="currentColor" />
        </button>
        {tracks.length > 0 && (confirm ? (
          <span className="confirm-inline">
            Rimuovere tutto?
            <button type="button" className="pill-btn danger" onClick={async () => { await removeAllOffline(); setConfirm(false); toast('Download rimossi'); }}>Rimuovi</button>
            <button type="button" className="pill-btn" onClick={() => setConfirm(false)}>Annulla</button>
          </span>
        ) : (
          <button type="button" className="icon-btn round-btn" aria-label="Rimuovi tutti i download" onClick={() => setConfirm(true)}><Trash2 size={18} /></button>
        ))}
      </div>

      {tracks.length === 0
        ? <p className="muted-text">Nessun brano scaricato. Usa la freccia di download su un album o una playlist, oppure "Scarica sul dispositivo" dal menu di un brano.</p>
        : <TrackList tracks={tracks} onRemove={(t) => removeTrack(t.id).then(() => toast('Rimosso dal dispositivo'))} removeLabel="Rimuovi dai download" />}
    </div>
  );
};

export default Offline;
