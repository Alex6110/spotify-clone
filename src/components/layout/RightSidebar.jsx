import React, { useContext, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, Play, Pause } from 'lucide-react';
import { PlayerStateContext } from '../../context/PlayerContext';
import { coverOf } from '../../lib/api';
import LikeButton from '../ui/LikeButton';
import './RightSidebar.css';

const DesktopQueueItem = ({ song, playSong }) => {
  const dragControls = useDragControls();
  const [isDragging, setIsDragging] = useState(false);

  return (
    <Reorder.Item
      value={song}
      id={song.id}
      dragListener={false}
      dragControls={dragControls}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      className="desktop-queue-item"
      style={{
        backgroundColor: isDragging ? 'var(--panel-3)' : undefined,
        boxShadow: isDragging ? '0 8px 16px rgba(0,0,0,0.4)' : 'none',
        zIndex: isDragging ? 50 : 1,
      }}
    >
      <img src={coverOf(song)} alt="" className="queue-row-cover" />
      <div className="queue-row-text" onClick={() => playSong(song)}>
        <p className="queue-row-title">{song.title}</p>
        <p className="queue-row-artist">{song.artist}</p>
      </div>
      <div className="queue-drag-handle-desktop" onPointerDown={(e) => dragControls.start(e)} aria-label="Trascina per riordinare">
        <GripVertical size={18} />
      </div>
    </Reorder.Item>
  );
};

export const RightSidebar = ({ rightWidth }) => {
  const { currentSong, queue, reorderQueue, isPlaying, playSong, togglePlay } = useContext(PlayerStateContext);
  const scrollRef = useRef(null);
  const coverRef = useRef(null);
  const [isCoverVisible, setIsCoverVisible] = useState(true);

  const upcomingSongs = useMemo(() => {
    if (!queue || !currentSong) return queue || [];
    const i = queue.findIndex((s) => s.id === currentSong.id);
    return i !== -1 ? queue.slice(i + 1) : queue;
  }, [queue, currentSong]);

  const [localQueue, setLocalQueue] = useState(upcomingSongs);
  useEffect(() => { setLocalQueue(upcomingSongs); }, [upcomingSongs]);

  useEffect(() => {
    if (!coverRef.current || !scrollRef.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => setIsCoverVisible(entry.isIntersecting), { root: scrollRef.current, threshold: 0.1 });
    observer.observe(coverRef.current);
    return () => observer.disconnect();
  }, [currentSong]);

  const handleReorder = useCallback((newOrder) => {
    setLocalQueue(newOrder);
    const i = queue.findIndex((s) => s.id === currentSong.id);
    reorderQueue([...queue.slice(0, i + 1), ...newOrder]);
  }, [queue, currentSong, reorderQueue]);

  if (!currentSong) {
    return (
      <aside className="desktop-sidebar-right" style={{ width: `${rightWidth}px` }}>
        <p className="rs-empty">Nessun brano in riproduzione</p>
      </aside>
    );
  }

  return (
    <aside className="desktop-sidebar-right" style={{ width: `${rightWidth}px` }}>
      <div className="rs-scroll" ref={scrollRef}>
        <h3 className="rs-heading">In riproduzione</h3>

        <div ref={coverRef}>
          <img src={coverOf(currentSong)} alt={currentSong.album || currentSong.title} className="sidebar-big-cover" />
        </div>

        <div className={`sidebar-sticky-now-playing ${isCoverVisible ? '' : 'scrolled'}`}>
          <div className="rs-now-text">
            <h2 className="rs-song">{currentSong.title}</h2>
            <p className="rs-artist">{currentSong.artist}</p>
          </div>
          <LikeButton track={currentSong} size={20} />
          <button type="button" className="desktop-play-toggle-circular" onClick={togglePlay} aria-label={isPlaying ? 'Pausa' : 'Riproduci'}>
            {isPlaying ? <Pause /> : <Play />}
          </button>
        </div>

        <h4 className="rs-section-title">Prossimi in coda</h4>
        {localQueue.length > 0 ? (
          <Reorder.Group axis="y" values={localQueue} onReorder={handleReorder} className="queue-list">
            {localQueue.map((song) => (
              <DesktopQueueItem key={song.id} song={song} playSong={playSong} />
            ))}
          </Reorder.Group>
        ) : (
          <p className="rs-empty" style={{ padding: 0 }}>Nessun brano in coda</p>
        )}
      </div>
    </aside>
  );
};

export default RightSidebar;
