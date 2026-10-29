import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { UserPlus, UserCheck } from 'lucide-react';
import { api, coverOf, errorMessage } from '../lib/api';
import ArtistAvatar from '../components/ui/ArtistAvatar';
import '../styles/Home.css';

const ArtistDetail = () => {
  const { id } = useParams();
  const [artist, setArtist] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setArtist(null);
    setError('');
    api.get(`/api/library/artists/${id}`).then((res) => setArtist(res.data)).catch((e) => setError(errorMessage(e, 'Artista non trovato')));
  }, [id]);

  const toggleFollow = async () => {
    const next = !artist.followed;
    setArtist((a) => ({ ...a, followed: next }));
    try {
      if (next) await api.put(`/api/library/follows/${id}`);
      else await api.delete(`/api/library/follows/${id}`);
    } catch {
      setArtist((a) => ({ ...a, followed: !next }));
    }
  };

  if (error) return <p className="form-error">{error}</p>;
  if (!artist) return <p className="muted-text">Caricamento...</p>;

  return (
    <div className="home-page">
      <header className="artist-header">
        <ArtistAvatar artist={{ ...artist, cover: artist.albums[0]?.cover }} size={140} />
        <div>
          <p className="muted-text">Artista</p>
          <h1>{artist.name}</h1>
          <button type="button" className="pill-btn" onClick={toggleFollow}>
            {artist.followed ? <UserCheck size={16} /> : <UserPlus size={16} />}
            {artist.followed ? 'Segui già' : 'Segui'}
          </button>
        </div>
      </header>
      <section className="shelf-section">
        <h3>Album</h3>
        <div className="album-grid">
          {artist.albums.map((a) => (
            <Link to={`/album/${a.id}`} key={a.id} className="album-card">
              <img src={coverOf(a)} alt="" className="album-cover" loading="lazy" />
              <p>{a.title}</p>
              <span>{a.year || ''}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ArtistDetail;
