import React, { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { PlayerContext } from '../../context/PlayerContext';
import { motion, AnimatePresence } from 'framer-motion';
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

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const formatTime = (time) => {
    const t = Math.max(0, Number.isFinite(time) ? time : 0);
    const min = Math.floor(t / 60);
    const sec = Math.floor(t % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const share = async () => {
    const text = `${currentSong.title} - ${currentSong.artist || ''}`.trim();
    try {
      if (navigator.share) await navigator.share({ title: currentSong.title, text });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text); toast('Titolo copiato'); }
    } catch { /* condivisione annullata */ }
  };

  return (
    <>
      <motion.div
        className="full-player-overlay"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 160, mass: 1.2 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.6}
        onDragEnd={(_, info) => { if (info.offset.y > 150 || info.velocity.y > 500) onClose(); }}
        style={{ background: `linear-gradient(180deg, ${bg.top} 0%, ${bg.mid} 55%, ${bg.bottom} 100%)` }}
      >
        <header className="full-player-header">
          <button type="button" className="fp-icon-btn" onClick={onClose} aria-label="Chiudi"><ChevronDown size={30} /></button>
          <span className="header-status">Brano in riproduzione</span>
          <TrackMenuButton track={currentSong} size={24} className="fp-icon-btn" />
        </header>

        <div className="full-player-main">
          <motion.img initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} src={cover} alt="Copertina" className="full-cover-art" draggable={false} />
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
            <div className="full-progress-container" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seekTo(((e.clientX - rect.left) / rect.width) * duration);
            }}>
              <div className="full-progress-bg">
                <div className="full-progress-fill" style={{ width: `${progressPercent}%` }} />
                <div className="progress-knob" style={{ left: `${progressPercent}%` }} />
              </div>
            </div>
            <div className="full-time-labels">
              <span>{formatTime(currentTime)}</span>
              <span>-{formatTime(duration - currentTime)}</span>
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

      {/* La coda sta fuori dal player trascinabile (portale): trascinandola verso il basso non chiude anche il player */}
      {createPortal(
        <AnimatePresence>{showQueue && <MobileQueue onClose={() => setShowQueue(false)} />}</AnimatePresence>,
        document.body,
      )}
    </>
  );
};

export default FullPlayer;
