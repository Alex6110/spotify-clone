import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, coverOf, PLACEHOLDER_COVER, errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import '../styles/Home.css';

const Cover = ({ album, className }) => (
  <img
    src={coverOf(album)}
    alt=""
    className={className}
    loading="lazy"
    onError={(e) => { if (!e.currentTarget.src.endsWith(PLACEHOLDER_COVER)) e.currentTarget.src = PLACEHOLDER_COVER; }}
  />
);

function Home() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/library/home').then((res) => setData(res.data)).catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="muted-text">Caricamento...</p>;

  const quick = (data.recentlyPlayed.length ? data.recentlyPlayed : data.newest).slice(0, 6);

  return (
    <div className="home-page">
      <section className="top-grid-section">
        <h3>Bentornato, {user?.name}</h3>
        <div className="main-grid">
          {quick.map((item) => (
            <Link to={`/album/${item.id}`} key={item.id} className="grid-item">
              <Cover album={item} className="item-img" />
              <span>{item.title}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="shelf-section">
        <h3>Aggiunti di recente</h3>
        <div className="horizontal-scroll">
          {data.newest.map((item) => (
            <Link to={`/album/${item.id}`} key={item.id} className="album-card">
              <Cover album={item} className="album-cover" />
              <p>{item.title}</p>
              <span>{item.artist}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export default Home;
