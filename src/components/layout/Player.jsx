import React, { useContext, useEffect, useState, useRef } from 'react';
import { PlayerContext } from '../../context/PlayerContext';
import { 
  Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, 
  Shuffle, Volume2, VolumeX, ListMusic
} from 'lucide-react';
import { coverOf, PLACEHOLDER_COVER } from '../../lib/api';
import LikeButton from '../ui/LikeButton';
import { FastAverageColor } from 'fast-average-color';
import '../../styles/player-bar.css';
import FullPlayer from '../player/FullPlayer';
import { AnimatePresence } from 'framer-motion';

const formatTime = (time) => {
  if (isNaN(time) || time === null) return "0:00";
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

const Player = ({ isMobile }) => {

  const { 
    currentSong, isPlaying, currentTime, duration, seekTo,
    nextSong, prevSong, volume, changeVolume,
    isShuffle, toggleShuffle, repeatMode, setRepeatMode,
    isRightSidebarOpen, setIsRightSidebarOpen, togglePlay
  } = useContext(PlayerContext);
  const lastVolumeRef = useRef(0.7);

  const [isExpanded, setIsExpanded] = useState(false);
  const [bgColor, setBgColor] = useState('#282828');
  const [imgError, setImgError] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    setImgError(false);
  }, [currentSong]);

  useEffect(() => {
  if (isMobile && currentSong?.cover && imgRef.current && !imgError) {
    const fac = new FastAverageColor();
    fac.getColorAsync(imgRef.current)
      .then(color => {
        // Sostituiamo l'alpha channel del colore dinamico con 0.70 per l'effetto vetro
        const translucentColor = color.rgba.replace(/[^,]+(?=\))/, '0.70');
        setBgColor(translucentColor);
      })
      .catch(() => setBgColor('rgba(40, 40, 40, 0.70)'));
  } else {
    setBgColor('#282828');
  }
}, [currentSong, isMobile, imgError]);

  if (!currentSong) return null;

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  
  const coverToUse = imgError ? PLACEHOLDER_COVER : coverOf(currentSong);

  const handleTogglePlay = () => togglePlay();
  const toggleMute = () => {
    if (Number(volume) > 0) { lastVolumeRef.current = Number(volume); changeVolume(0); }
    else changeVolume(lastVolumeRef.current || 0.7);
  };

  // --- RENDER MOBILE ---
  if (isMobile) {
    return (
      <>
        {/* MINI PLAYER (Banner) */}
        <div 
          className={`player-bar is-mobile ${isExpanded ? 'hidden' : ''}`} 
          style={{ backgroundColor: bgColor }}
          onClick={() => setIsExpanded(true)}
        >
          <div className="mobile-player-content">
            <img 
              ref={imgRef}
              src={coverToUse} 
              alt="cover" 
              className="mobile-album-art"
              crossOrigin="anonymous"
              onError={() => setImgError(true)}
            />
            <div className="player-song-info">
              <p className="player-song-title">{currentSong.title}</p>
              <p className="player-song-artist">{currentSong.artist || 'Artista sconosciuto'}</p>
            </div>
            <div className="mobile-player-controls">
              <button className="play-btn-mobile" onClick={(e) => { e.stopPropagation(); handleTogglePlay(); }}>
                {isPlaying ? <Pause size={24} fill="white" /> : <Play size={24} fill="white" />}
              </button>
            </div>
          </div>
          <div className="mobile-progress-min">
            <div className="mobile-progress-fill" style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>

        {/* FULL PLAYER con supporto animazione uscita */}
        <AnimatePresence>
          {isExpanded && (
            <FullPlayer
              onClose={() => setIsExpanded(false)}
              cover={coverToUse}
              bgColor={bgColor}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  // --- RENDER DESKTOP ---
  return (
    <div className="player-bar">
      <div className="player-left">
        <img 
          src={coverToUse} 
          alt="cover" 
          className="desktop-album-art" 
          onError={() => setImgError(true)} 
        />
        <div className="player-song-info">
          <p className="player-song-title">{currentSong.title}</p>
          <p className="player-song-artist">{currentSong.artist || 'Artista sconosciuto'}</p>
        </div>
        <LikeButton track={currentSong} size={16} className="player-like" />
      </div>

      <div className="player-center">
        <div className="player-controls">
          <Shuffle size={16} className={`control-icon ${isShuffle ? 'active' : ''}`} onClick={toggleShuffle} />
          <SkipBack size={20} fill="currentColor" className="control-icon" onClick={prevSong} />
          <button className="play-pause-btn" onClick={handleTogglePlay}>
            {isPlaying ? <Pause size={19} fill="black" /> : <Play size={19} fill="black" style={{ marginLeft: '0' }} />}
          </button>
          <SkipForward size={20} fill="currentColor" className="control-icon" onClick={nextSong} />
          <div onClick={() => setRepeatMode((repeatMode + 1) % 3)} style={{display: 'flex'}}>
            {repeatMode === 2 ? <Repeat1 size={16} className="control-icon active" /> : <Repeat size={16} className={`control-icon ${repeatMode === 1 ? 'active' : ''}`} />}
          </div>
        </div>
        
        <div className="playback-bar">
          <span className="time">{formatTime(currentTime)}</span>
          <div className="progress-container" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekTo(((e.clientX - rect.left) / rect.width) * duration);
          }}>
            <div className="progress-bar" style={{ width: `${progressPercent}%` }}></div>
          </div>
          <span className="time">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="player-right">
        <ListMusic size={18} className={`control-icon ${isRightSidebarOpen ? 'active' : ''}`} onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)} style={{ cursor: 'pointer' }} />
        <button type="button" className="icon-btn" onClick={toggleMute} aria-label={Number(volume) > 0 ? 'Disattiva audio' : 'Attiva audio'}>
          {Number(volume) > 0 ? <Volume2 size={18} className="control-icon" /> : <VolumeX size={18} className="control-icon" />}
        </button>
        {/* STRUTTURA CUSTOM PER IL VOLUME */}
        <div className="volume-container">
          {/* La parte grafica fatta con div (sicura al 100% su tutti i browser) */}
          <div className="volume-track">
            <div className="volume-fill" style={{ width: `${(Number(volume) || 0) * 100}%` }}></div>
            <div className="volume-thumb" style={{ left: `${(Number(volume) || 0) * 100}%` }}></div>
          </div>
          
          {/* L'input nativo: invisibile, serve solo per cliccare e trascinare */}
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={volume} 
            className="volume-slider-invisible" 
            onChange={(e) => changeVolume(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

export default Player;