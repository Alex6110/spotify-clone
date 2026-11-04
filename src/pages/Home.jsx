import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { api, coverOf, photoOf, PLACEHOLDER_COVER, errorMessage } from '../lib/api';
import ArtistAvatar from '../components/ui/ArtistAvatar';
import '../styles/discover.css';

const onImgError = (e) => { if (!e.currentTarget.src.endsWith(PLACEHOLDER_COVER)) e.currentTarget.src = PLACEHOLDER_COVER; };
const Img = ({ src, className }) => <img src={src} alt="" className={className} loading="lazy" onError={onImgError} />;

// colore stabile per ogni mix, ricavato dal nome
const hueOf = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

const Shelf = ({ title, children }) => (
  <section className="shelf">
    <h2>{title}</h2>
    <div className="shelf-row">{children}</div>
  </section>
);

const MixCard = ({ mix }) => {
  const to = mix.kind === 'artist' ? `/mix/artist/${mix.id}` : `/mix/genre/${encodeURIComponent(mix.name)}`;
  const label = mix.kind === 'artist' ? mix.artist : mix.name;
  const sub = mix.kind === 'artist' ? `${mix.artist} e altri` : `I migliori brani ${mix.name}`;
  return (
    <Link to={to} className="dcard mix-card">
      <div className="mix-art" style={{ '--mix-h': hueOf(mix.title) }}>
        <Img src={mix.kind === 'artist' ? photoOf(mix) : coverOf(mix)} />
        <span className="mix-label"><i />{mix.kind === 'artist' ? `${label} Mix` : mix.title}</span>
      </div>
      <p className="dcard-sub">Playlist</p>
      <p className="dcard-sub">{sub}</p>
    </Link>
  );
};

function Home() {
  const [data, setData] = useState(null);
  const [similar, setSimilar] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.get('/api/discover/home').then((res) => alive && setData(res.data)).catch((e) => alive && setError(errorMessage(e)));
    // gli artisti simili vengono da Deezer: arrivano dopo, senza far aspettare il resto della pagina
    api.get('/api/discover/similar').then((res) => alive && setSimilar(res.data.items || [])).catch(() => alive && setSimilar([]));
    return () => { alive = false; };
  }, []);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="muted-text">Caricamento...</p>;

  return (
    <div className="home-page">
      {data.quick.length > 0 && (
        <section className="quick-grid">
          {data.quick.map((q) => (
            q.type === 'liked' ? (
              <Link key="liked" to="/liked" className="quick-tile">
                <span className="quick-liked"><Heart size={22} fill="currentColor" /></span>
                <span className="quick-title">{q.title}</span>
              </Link>
            ) : (
              <Link key={q.id} to={`/album/${q.id}`} className="quick-tile">
                <Img src={coverOf(q)} className="quick-img" />
                <span className="quick-title">{q.title}</span>
              </Link>
            )
          ))}
        </section>
      )}

      {data.continue.length > 0 && (
        <Shelf title="Continua ad ascoltare">
          {data.continue.map((a) => (
            <Link key={a.id} to={`/album/${a.id}`} className="dcard">
              <Img src={coverOf(a)} className="dcard-img" />
              <p className="dcard-title">{a.title}</p>
              <p className="dcard-sub">Album • {a.artist}</p>
            </Link>
          ))}
        </Shelf>
      )}

      {data.mixes.length > 0 && (
        <Shelf title={data.hasHistory ? 'I tuoi mix' : 'Mix per iniziare'}>
          {data.mixes.map((m) => <MixCard key={`a${m.id}`} mix={m} />)}
        </Shelf>
      )}

      {similar && similar.length > 0 && (
        <Shelf title="Artisti che potrebbero piacerti">
          {similar.map((s) => (
            <Link
              key={s.deezerId}
              to={s.libraryId ? `/artist/${s.libraryId}` : `/artist/ext/${s.deezerId}?name=${encodeURIComponent(s.name)}&photo=${encodeURIComponent(s.photo || '')}`}
              className="dcard artist-card"
            >
              <ArtistAvatar artist={{ photo: s.photo }} size={140} />
              <p className="dcard-title">{s.name}</p>
              <p className="dcard-sub">{s.libraryId ? 'Artista' : 'Non ancora in libreria'}</p>
            </Link>
          ))}
        </Shelf>
      )}

      {data.genreMixes.length > 0 && (
        <Shelf title="Mix per genere">
          {data.genreMixes.map((m) => <MixCard key={m.name} mix={m} />)}
        </Shelf>
      )}

      {data.recentArtists.length > 0 && (
        <Shelf title="Riprodotti di recente">
          {data.recentArtists.map((a) => (
            <Link key={a.id} to={`/artist/${a.id}`} className="dcard artist-card">
              <ArtistAvatar artist={a} size={140} />
              <p className="dcard-title">{a.name}</p>
              <p className="dcard-sub">Artista</p>
            </Link>
          ))}
        </Shelf>
      )}

      <Shelf title="Aggiunti di recente">
        {data.newest.map((a) => (
          <Link key={a.id} to={`/album/${a.id}`} className="dcard">
            <Img src={coverOf(a)} className="dcard-img" />
            <p className="dcard-title">{a.title}</p>
            <p className="dcard-sub">{a.artist}</p>
          </Link>
        ))}
      </Shelf>
    </div>
  );
}

export default Home;
