import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { errorMessage } from '../lib/api';
import { createPlaylist } from '../lib/playlists';
import PlaylistCover from '../components/ui/PlaylistCover';
import '../styles/discover.css';

// Nuova playlist: si sceglie il nome, poi si apre la playlist vuota per aggiungere brani.
const CreatePlaylist = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const pl = await createPlaylist(name.trim());
      navigate(`/playlist/${pl.id}`, { replace: true });
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  return (
    <div className="newpl-page">
      <div className="newpl-bar">
        <button type="button" className="newpl-close" onClick={() => navigate(-1)} aria-label="Chiudi"><X size={26} /></button>
        <span>Nuova playlist</span>
        <span className="newpl-bar-space" />
      </div>

      <form onSubmit={submit} className="newpl-body">
        <PlaylistCover className="newpl-cover" />
        <h1>Come vuoi chiamare la playlist?</h1>
        <input
          autoFocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="La mia playlist"
          aria-label="Nome della playlist"
          enterKeyHint="done"
        />
        <p className="newpl-count">{name.length}/80</p>
        {error && <p className="form-error">{error}</p>}
        <div className="newpl-actions">
          <button type="button" className="newpl-cancel" onClick={() => navigate(-1)}>Annulla</button>
          <button type="submit" className="newpl-submit" disabled={!name.trim() || busy}>{busy ? 'Creazione...' : 'Crea'}</button>
        </div>
      </form>
    </div>
  );
};

export default CreatePlaylist;
