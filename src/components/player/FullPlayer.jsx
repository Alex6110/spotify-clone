import React, { useContext, useState } from 'react';
import { PlayerContext } from '../../context/PlayerContext';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, ListMusic } from 'lucide-react';
import LikeButton from '../ui/LikeButton';
import MobileQueue from './MobileQueue';
import '../../styles/player-full.css';

const FullPlayer = ({ onClose, cover, bgColor }) => {
  const { currentSong, isPlaying, togglePlay, currentTime, duration, seekTo, nextSong, prevSong, isShuffle, toggleShuffle, repeatMode, setRepeatMode } = useContext(PlayerContext);
  const [showQueue, setShowQueue] = useState(false);

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  const formatTime = (time) => {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  // CORREZIONE TRASPARENZA: Rigeneriamo un colore 100% opaco per il gradiente full-screen
  const solidBgColor = bgColor.includes('rgba') 
    ? bgColor.replace(/[^,]+(?=\))/, '1') 
    : bgColor;

  return (
    <motion.div 
      className="full-player-overlay"
      // Animazioni di entrata e uscita
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 160, mass: 1.2 }}
    
      // --- AGGIUNTA GESTURE SWIPE ---
      drag="y" // Permette il trascinamento solo verticale
      dragConstraints={{ top: 0, bottom: 0 }} // Evita che rimanga spostato
      dragElastic={0.6} // Resistenza al trascinamento
      onDragEnd={(_, info) => {
          // Se la velocità dello swipe o la distanza sono sufficienti, chiude
          if (info.offset.y > 150 || info.velocity.y > 500) {
          onClose();
          }
      }}
    
      style={{ background: `linear-gradient(to bottom, ${solidBgColor} 0%, #121212 100%)` }}
    >
      {/* HEADER */}
      <header className="full-player-header">
        <ChevronDown size={32} onClick={onClose} style={{ cursor: 'pointer' }} />
        <span className="header-status">Brano in riproduzione</span>
        <span style={{ width: 28 }} />
      </header>

      {/* COVER ART */}
      {/* COVER ART (Questa area assorbirà lo spazio vuoto) */}
      <div className="full-player-main">
        <motion.img 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          src={cover} 
          alt="Cover" 
          className="full-cover-art" 
        />
      </div>

      {/* --- INIZIO NUOVO WRAPPER COMPATTO --- */}
      <div className="full-player-controls-wrapper">
        
        {/* INFO BRANO */}
        <div className="full-info-section">
          <div className="title-group">
            <h1>{currentSong.title}</h1>
            <p>{currentSong.artist || 'Artista sconosciuto'}</p>
          </div>
          <LikeButton track={currentSong} size={28} className="add-icon" />
        </div>

        {/* PROGRESS BAR */}
        <div className="full-progress-section">
          <div className="full-progress-container" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seekTo(((e.clientX - rect.left) / rect.width) * duration);
          }}>
            <div className="full-progress-bg">
              <div className="full-progress-fill" style={{ width: `${progressPercent}%` }}></div>
              <div className="progress-knob" style={{ left: `${progressPercent}%` }}></div>
            </div>
          </div>
          <div className="full-time-labels">
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(duration - currentTime)}</span>
          </div>
        </div>

        {/* CONTROLLI PRINCIPALI */}
        <div className="full-controls-main">
          <Shuffle 
              size={24} 
              className={isShuffle ? 'active-green' : ''} 
              onClick={toggleShuffle}
          />
        
          <SkipBack size={42} fill="white" onClick={prevSong} />

          <button className="big-play-pause" onClick={togglePlay}>
              {isPlaying ? 
              <Pause size={42} /> : 
              <Play size={42} style={{ marginLeft: '0' }} />
              }
          </button>

          <SkipForward size={42} fill="white" onClick={nextSong} />

          <div onClick={() => setRepeatMode((repeatMode + 1) % 3)} style={{ cursor: 'pointer' }}>
              {repeatMode === 2 ? (
                <Repeat1 size={24} className="active-green" />
              ) : (
                <Repeat size={24} className={repeatMode === 1 ? 'active-green' : ''} />
              )}
          </div>
        </div>
        
      </div>
      {/* --- FINE NUOVO WRAPPER COMPATTO --- */}

      {/* FOOTER ICONS */}
      <footer className="full-player-footer">
        <span />
        <div className="footer-right-icons">
          <ListMusic size={22} onClick={() => setShowQueue(true)} style={{ cursor: 'pointer' }} />
        </div>
      </footer>

      {/* CODA */}
      <AnimatePresence>
        {showQueue && <MobileQueue onClose={() => setShowQueue(false)} />}
      </AnimatePresence>
    </motion.div>
  );
};

export default FullPlayer;