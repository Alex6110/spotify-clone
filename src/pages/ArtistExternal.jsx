import React, { useEffect, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Send } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import ArtistAvatar from '../components/ui/ArtistAvatar';
import '../styles/discover.css';

// Artista consigliato che non è (ancora) in libreria: foto da Deezer e possibilità di chiedere che venga aggiunto.
const ArtistExternal = () => {
  const { deezerId } = useParams();
  const [params] = useSearchParams();
  const toast = useToast();
  const [info, setInfo] = useState({ name: params.get('name') || '', photo: params.get('photo') || '', libraryId: null, requested: false });
  const [loaded, setLoaded] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get(`/api/discover/external/${deezerId}`)
      .then((r) => alive && setInfo((cur) => ({ ...cur, ...r.data, photo: r.data.photo || cur.photo })))
      .catch(() => { /* Deezer non risponde: restano nome e foto ricevuti dalla pagina precedente */ })
      .finally(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, [deezerId]);

  if (info.libraryId) return <Navigate to={`/artist/${info.libraryId}`} replace />;
  if (!info.name && loaded) return <p className="form-error">Artista non trovato</p>;

  const send = async () => {
    setBusy(true);
    try {
      await api.post('/api/discover/requests', { name: info.name, deezerId: Number(deezerId) });
      setInfo((i) => ({ ...i, requested: true }));
      setConfirm(false);
      toast('Richiesta inviata');
    } catch (e) { toast(errorMessage(e), 'error'); }
    setBusy(false);
  };

  return (
    <div className="home-page ext-artist">
      <header className="artist-header">
        <ArtistAvatar artist={{ photo: info.photo }} size={140} />
        <div>
          <p className="muted-text">Artista</p>
          <h1>{info.name || '...'}</h1>
          {info.fans != null && <p className="muted-text">{info.fans.toLocaleString('it-IT')} ascoltatori su Deezer</p>}
        </div>
      </header>

      <section className="shelf">
        <h2>Album</h2>
        <div className="ext-box">
          <p>Questo artista non è ancora nella tua libreria, quindi qui non ci sono album da ascoltare.</p>
          {info.requested ? (
            <p className="ext-done"><Check size={18} /> Richiesta inviata. Ti basta aspettare che venga aggiunto.</p>
          ) : confirm ? (
            <div className="ext-confirm">
              <p>Vuoi chiedere a chi gestisce il sito di aggiungere <strong>{info.name}</strong> alla libreria?</p>
              <div className="ext-actions">
                <button type="button" className="pill-btn" disabled={busy} onClick={() => setConfirm(false)}>Annulla</button>
                <button type="button" className="pill-btn primary" disabled={busy} onClick={send}>{busy ? 'Invio...' : 'Sì, richiedi'}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="pill-btn primary" disabled={!info.name} onClick={() => setConfirm(true)}><Send size={16} /> Richiedi l'aggiunta dell'artista</button>
          )}
        </div>
      </section>
    </div>
  );
};

export default ArtistExternal;
