import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../lib/api';
import { createPlaylist } from '../lib/playlists';
import PlaylistCover from '../components/ui/PlaylistCover';

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
    <div className="create-page">
      <PlaylistCover className="create-cover" />
      <form onSubmit={submit} className="create-form">
        <h3>Nuova playlist</h3>
        <input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Dai un nome alla playlist" aria-label="Nome della playlist" />
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="pill-btn primary" disabled={!name.trim() || busy}>{busy ? 'Creazione...' : 'Crea playlist'}</button>
      </form>
    </div>
  );
};

export default CreatePlaylist;
