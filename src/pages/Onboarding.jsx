import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import ArtistAvatar from '../components/ui/ArtistAvatar';
import './Onboarding.css';

const MIN_ARTISTS = 3;

const Onboarding = () => {
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [genres, setGenres] = useState(null); // null = in caricamento
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [artists, setArtists] = useState([]);
  const [artistTotal, setArtistTotal] = useState(0);
  const [selectedArtists, setSelectedArtists] = useState([]);
  const [query, setQuery] = useState('');
  const [step, setStep] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Se la libreria non ha generi nei tag, il passo dei generi viene saltato.
  useEffect(() => {
    api.get('/api/library/genres').then(({ data }) => {
      const list = data.items.slice(0, 24);
      setGenres(list);
      setStep(list.length >= 4 ? 1 : 2);
    }).catch((e) => { setError(errorMessage(e)); setGenres([]); setStep(2); });
  }, []);

  useEffect(() => {
    if (step !== 2) return undefined;
    const t = setTimeout(() => {
      api.get('/api/library/artists', { params: { sort: 'albums', limit: 60, q: query || undefined } })
        .then(({ data }) => { setArtists(data.items); if (!query) setArtistTotal(data.total); })
        .catch((e) => setError(errorMessage(e)));
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [step, query]);

  const toggle = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const needed = Math.min(MIN_ARTISTS, artistTotal || MIN_ARTISTS);

  const finish = async () => {
    setError('');
    setBusy(true);
    try {
      const { data } = await api.put('/api/me/onboarding', { genres: selectedGenres, artistIds: selectedArtists });
      updateUser({ onboarded: data.onboarded, favGenres: data.favGenres });
      navigate('/', { replace: true });
    } catch (e) {
      setError(errorMessage(e, 'Salvataggio non riuscito'));
      setBusy(false);
    }
  };

  if (step === null) return <div className="onboarding-container"><p>Caricamento...</p></div>;

  return (
    <div className="onboarding-container">
      {step === 1 && (
        <div className="step-content">
          <h2>Quali generi ascolti di più?</h2>
          <p className="onboarding-hint">Scegline quanti vuoi.</p>
          <div className="genres-grid">
            {genres.map((g) => (
              <button
                type="button"
                key={g.name}
                className={`genre-card ${selectedGenres.includes(g.name) ? 'active' : ''}`}
                aria-pressed={selectedGenres.includes(g.name)}
                onClick={() => toggle(selectedGenres, setSelectedGenres, g.name)}
              >
                {g.name}
              </button>
            ))}
          </div>
          <button type="button" className="onboarding-next" onClick={() => setStep(2)}>Avanti</button>
        </div>
      )}

      {step === 2 && (
        <div className="step-content">
          <h2>Scegli almeno {needed} artisti che ami</h2>
          <input className="onboarding-search" type="search" placeholder="Cerca un artista" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="artists-grid">
            {artists.map((artist) => {
              const active = selectedArtists.includes(artist.id);
              return (
                <button
                  type="button"
                  key={artist.id}
                  className={`artist-circle-item ${active ? 'active' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggle(selectedArtists, setSelectedArtists, artist.id)}
                >
                  <div className="img-wrapper">
                    <ArtistAvatar artist={artist} />
                    {active && <span className="artist-check"><Check size={16} /></span>}
                  </div>
                  <span>{artist.name}</span>
                </button>
              );
            })}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="button" className="onboarding-next" disabled={busy || selectedArtists.length < needed} onClick={finish}>
            {busy ? 'Salvataggio...' : 'Inizia ad ascoltare'}
          </button>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
