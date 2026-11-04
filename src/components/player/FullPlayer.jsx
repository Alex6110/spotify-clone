import React, { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { PlayerContext } from '../../context/PlayerContext';
import { motion, AnimatePresence, animate, useMotionValue } from 'framer-motion';
import { ChevronDown, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, ListMusic, Share2, MonitorSpeaker } from 'lucide-react';
import LikeButton from '../ui/LikeButton';
import { TrackMenuButton } from '../ui/TrackMenu';
import { useToast } from '../../context/ToastContext';
import { coverGradient } from '../../lib/coverColor';
import MobileQueue from './MobileQueue';
import '../../styles/player-full.css';

const DEFAULT_BG = { top: 'hsl(0 0% 24%)', mid: 'hsl(0 0% 14%)', bottom: 'hsl(0 0% 7%)' };

const FullPlayer = ({ onClose, cover }) => {
  const { currentSong, isPlaying, togglePlay, currentTime, duration, seekTo, nextSong, prevSong, isShuffle, toggleShuffle, repeatMode, setRepeatMode } = useContext(PlayerContext);
  const [showQueue, setShowQueue] = useState(false);
  const [scrub, setScrub] = useState(null);
  const [bg, setBg] = useState(DEFAULT_BG);
  const toast = useToast();
  const { pathname } = useLocation();

  // colore dominante della copertina (come Spotify): si aggiorna a ogni brano
  useEffect(() => {
    let alive = true;
    coverGradient(cover).then((g) => { if (alive) setBg(g || DEFAULT_BG); });
    return () => { alive = false; };
  }, [cover]);

  // se dal menu del brano si va a un album o a un artista, il player si chiude e si vede la nuova pagina
  const [startPath] = useState(pathname);
  useEffect(() => { if (pathname !== startPath) onClose(); }, [pathname, startPath, onClose]);

  // --- gesti: trascina in giù = chiudi, trascina di lato sulla copertina = brano precedente/successivo ---
  const y = useMotionValue(0);
  const coverX = useMotionValue(0);
  const g = useRef(null);
  const onTouchStart = (e) => {
    if (e.touches.length !== 1 || e.target.closest('button, a, .full-progress-container')) { g.current = null; return; }
    const t = e.touches[0];
    g.current = { x: t.clientX, y: t.clientY, axis: null, onCover: !!e.target.closest('.full-player-main') };
  };
  const onTouchMove = (e) => {
    const s = g.current;
    if (!s) return;
    const dx = e.touches[0].clientX - s.x;
    const dy = e.touches[0].clientY - s.y;
    if (!s.axis && Math.hypot(dx, dy) > 10) s.axis = Math.abs(dx) > Math.abs(dy) && s.onCover ? 'x' : 'y';
    if (s.axis === 'x') coverX.set(dx * 0.7);
    else if (s.axis === 'y') y.set(Math.max(0, dy) * 0.9);
  };
  const onTouchEnd = (e) => {
    const s = g.current;
    g.current = null;
    if (!s?.axis) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (s.axis === 'x') {
      animate(coverX, 0, { type: 'spring', stiffness: 400, damping: 32 });
      if (dx < -70) nextSong(); else if (dx > 70) prevSong();
    } else if (dy > 130) {
      onClose();
    } else {
      animate(y, 0, { type: 'spring', stiffness: 400, damping: 36 });
    }
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const shownTime = scrub !== null && duration ? scrub * duration : currentTime;
  const shownPercent = scrub !== null ? scrub * 100 : progressPercent;
  const formatTime = (time) => {
    const t = Math.max(0, Number.isFinite(time) ? time : 0);
    const min = Math.floor(t / 60);
    const sec = Math.floor(t % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  // barra di avanzamento: tocco o trascinamento
  const ratioOf = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  const seekDown = (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setScrub(ratioOf(e)); };
  const seekMove = (e) => { if (scrub !== null) setScrub(ratioOf(e)); };
  const seekUp = (e) => { if (scrub === null) return; if (duration) seekTo(ratioOf(e) * duration); setScrub(null); };

  const share = async () => {
    const text = `${currentSong.title} - ${currentSong.artist || ''}`.trim();
    try {
      if (navigator.share) await navigator.share({ title: currentSong.title, text });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text); toast('Titolo copiato'); }
    } catch { /* condivisione annullata */ }
  };

  return (
    <>
      {/* Portale su <body>: fuori da .mobile-fixed-bottom (che ha pointer-events:none e uno z-index basso) i tocchi arrivano al player */}
      {createPortal(
      <motion.div
        className="full-player-slot"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 160, mass: 1.2 }}
      >
      <motion.div
        className="full-player-overlay"
        style={{ y, background: `linear-gradient(180deg, ${bg.top} 0%, ${bg.mid} 55%, ${bg.bottom} 100%)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="edge-band" style={{ position: 'absolute', zIndex: 5, '--edge-band': bg.top }} aria-hidden="true" />
        <header className="full-player-header">
          <button type="button" className="fp-icon-btn" onClick={onClose} aria-label="Chiudi"><ChevronDown size={30} /></button>
          <span className="header-status">Brano in riproduzione</span>
          <TrackMenuButton track={currentSong} size={24} className="fp-icon-btn" />
        </header>

        <div className="full-player-main">
          <motion.img initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ x: coverX }} src={cover} alt="Copertina" className="full-cover-art" draggable={false} />
        </div>

        <div className="full-player-controls-wrapper">
          <div className="full-info-section">
            <div className="title-group">
              <h1>{currentSong.title}</h1>
              <p>{currentSong.artist || 'Artista sconosciuto'}</p>
            </div>
            <LikeButton track={currentSong} size={28} className="add-icon" />
          </div>

          <div className="full-progress-section">
            <div className="full-progress-container" onPointerDown={seekDown} onPointerMove={seekMove} onPointerUp={seekUp} onPointerCancel={() => setScrub(null)}>
              <div className="full-progress-bg">
                <div className="full-progress-fill" style={{ width: `${shownPercent}%` }} />
                <div className="progress-knob" style={{ left: `${shownPercent}%` }} />
              </div>
            </div>
            <div className="full-time-labels">
              <span>{formatTime(shownTime)}</span>
              <span>-{formatTime(duration - shownTime)}</span>
            </div>
          </div>

          <div className="full-controls-main">
            <button type="button" className="fp-ctl" onClick={toggleShuffle} aria-label="Casuale" aria-pressed={isShuffle}>
              <Shuffle size={24} className={isShuffle ? 'active-accent' : ''} />
            </button>
            <button type="button" className="fp-ctl" onClick={prevSong} aria-label="Precedente"><SkipBack size={38} fill="white" /></button>
            <button type="button" className="big-play-pause" onClick={togglePlay} aria-label={isPlaying ? 'Pausa' : 'Riproduci'}>
              {isPlaying ? <Pause size={34} /> : <Play size={34} />}
            </button>
            <button type="button" className="fp-ctl" onClick={nextSong} aria-label="Successivo"><SkipForward size={38} fill="white" /></button>
            <button type="button" className="fp-ctl" onClick={() => setRepeatMode((repeatMode + 1) % 3)} aria-label="Ripeti">
              {repeatMode === 2 ? <Repeat1 size={24} className="active-accent" /> : <Repeat size={24} className={repeatMode === 1 ? 'active-accent' : ''} />}
            </button>
          </div>

          <footer className="full-player-footer">
            <button type="button" className="fp-ctl" onClick={() => toast('Dispositivi: in arrivo')} aria-label="Dispositivi"><MonitorSpeaker size={22} /></button>
            <span className="footer-right-icons">
              <button type="button" className="fp-ctl" onClick={share} aria-label="Condividi"><Share2 size={22} /></button>
              <button type="button" className="fp-ctl" onClick={() => setShowQueue(true)} aria-label="Coda di riproduzione"><ListMusic size={22} /></button>
            </span>
          </footer>
        </div>
      </motion.div>
      </motion.div>,
      document.body,
      )}

      {/* La coda sta fuori dal player trascinabile (portale): trascinandola verso il basso non chiude anche il player */}
      {createPortal(
        <AnimatePresence>{showQueue && <MobileQueue onClose={() => setShowQueue(false)} />}</AnimatePresence>,
        document.body,
      )}
    </>
  );
};

export default FullPlayer;
