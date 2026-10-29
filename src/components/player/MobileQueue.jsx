import React, { useContext, useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { motion, Reorder, useAnimation, AnimatePresence, useDragControls } from 'framer-motion';
import { PlayerStateContext } from '../../context/PlayerContext';
import { coverOf } from '../../lib/api';
import { Shuffle, Repeat, Repeat1, Timer, Play, Pause } from 'lucide-react';
import '../../styles/player-queue.css';

const DragIcon = () => (
  <svg 
    width="20" height="20" viewBox="0 0 24 24" fill="#b3b3b3" 
    style={{ pointerEvents: 'none' }} // <-- AGGIUNTA FONDAMENTALE
  >
    <path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/>
  </svg>
);

const springConfig = { type: "spring", damping: 28, stiffness: 210 };

const sheetVariants = {
  hidden: { y: "100%" },
  half: { y: "40%" }, 
  full: { y: "0%" }   
};

// ==========================================
// COMPONENTE SINGOLO BRANO (Con Long-Press Blindato)
// ==========================================
const QueueItem = ({ song, playSong, getCoverUrl, onDragStart, onDragEnd, onPointerDownStart }) => {
  const dragControls = useDragControls();
  const handleRef = useRef(null); 
  
  // 1. STATO LOCALE SICURO: Gestisce la grafica del drag senza bug di memoria
  const [isThisDragging, setIsThisDragging] = useState(false);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;

    const onPointerDown = (e) => {
      e.preventDefault(); 
      e.stopPropagation(); 
      if (onPointerDownStart) onPointerDownStart();
      dragControls.start(e);
      if (window.navigator.vibrate) window.navigator.vibrate(50);
    };

    handle.addEventListener('pointerdown', onPointerDown, { passive: false });

    return () => {
      handle.removeEventListener('pointerdown', onPointerDown);
    };
  }, [dragControls, onPointerDownStart]);

  return (
    <Reorder.Item 
      value={song} 
      id={song.id} 
      className={`queue-item ${isThisDragging ? 'is-dragging' : ''}`}
      dragListener={false} 
      dragControls={dragControls} 
      
      // 2. Attiviamo lo stato locale all'inizio del drag
      onDragStart={(e, info) => {
        setIsThisDragging(true);
        if (onDragStart) onDragStart(e, info);
      }}
      
      // 3. Lo spegniamo tassativamente alla fine, ripulendo lo stile
      onDragEnd={(e, info) => {
        setIsThisDragging(false);
        if (onDragEnd) onDragEnd(e, info);
      }}
      
      // 4. Trasferiamo qui gli stili condizionali controllati direttamente da React
      style={{
        margin: 0,
        backgroundColor: isThisDragging ? "#282828" : "transparent",
        boxShadow: isThisDragging ? "0 10px 25px rgba(0,0,0,0.5)" : "none",
        borderRadius: isThisDragging ? "8px" : "0px",
        zIndex: isThisDragging ? 9999 : 1,
        WebkitTapHighlightColor: 'transparent',
        userSelect: 'none'
      }}
      
      // 5. ❌ RIMOSSO COMPLETAMENTE whileDrag per evitare conflitti di rendering
    >
      <div 
        className="queue-item-clickable-core" 
        onClick={() => playSong(song)}
        style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '12px', cursor: 'pointer' }}
      >
        <img src={getCoverUrl(song)} alt="" className="queue-mini-cover" />
        <div className="queue-info">
          <p className="queue-song-name">{song.title}</p>
          <p className="queue-artist-name">{song.artist}</p>
        </div>
      </div>

      <div
        ref={handleRef}
        className="queue-drag-handle"
        onContextMenu={(e) => e.preventDefault()}
        style={{ 
          touchAction: 'none',        
          WebkitTouchCallout: 'none', 
          userSelect: 'none',         
          cursor: 'grab',
          padding: '10px'             
        }}
      >
        <DragIcon />
      </div>
    </Reorder.Item>
  );
};

// ==========================================
// COMPONENTE UI SCHERMATO
// ==========================================
const QueueSheetUI = React.memo(({
  currentSong, upcomingSongs, isPlaying, isShuffle, repeatMode, activeTimer,
  playSong, toggleShuffle, setRepeatMode, startSleepTimer, handleReorder, onClose, getCoverUrl
}) => {
  const sheetDragControls = useDragControls();
  const sheetHandleRef = useRef(null);
  const scrollableRef = useRef(null);
  const [position, setPosition] = useState('half');
  const [isDragging, setIsDragging] = useState(false); 
  const isDraggingRef = useRef(false);
  const [isTimerOpen, setIsTimerOpen] = useState(false);
  const controls = useAnimation();
  const [localQueue, setLocalQueue] = useState(upcomingSongs);


  // Forza lo stato di drag in modo sincrono al pointerdown
  const handlePointerDownStart = useCallback(() => {
    isDraggingRef.current = true;
    setIsDragging(true);
  }, []);

  // BLOCCO TOTALE OVERSCROLL: Intercetta il touchmove nativo prima del browser
  useEffect(() => {
    const scrollable = scrollableRef.current;
    if (!scrollable) return;

    const preventScroll = (e) => {
      if (isDraggingRef.current) {
        if (e.cancelable) e.preventDefault(); // Blocca fisicamente lo scroll verso il basso
      }
    };

    scrollable.addEventListener('touchmove', preventScroll, { passive: false });
    return () => {
      scrollable.removeEventListener('touchmove', preventScroll);
    };
  }, []);


  // 👈 2. Listener NATIVO: Blocca il Player sottostante in modo assoluto
  useEffect(() => {
    const handle = sheetHandleRef.current;
    if (!handle) return;

    const onPointerDown = (e) => {
      e.preventDefault();  // Blocca comportamenti strani del browser
      e.stopPropagation(); // Impedisce al Player sotto di accorgersi del tocco

      // Passa il controllo esclusivo del tocco alla Coda
      sheetDragControls.start(e);
    };

    handle.addEventListener('pointerdown', onPointerDown, { passive: false });

    return () => {
      handle.removeEventListener('pointerdown', onPointerDown);
    };
  }, [sheetDragControls]);

  // RIGA 136 CIRCA: Modifica le dipendenze e il controllo del useEffect
  useEffect(() => {
    if (!isDragging) { // 👈 Aggiornato senza .current
      setLocalQueue(upcomingSongs);
    }
  }, [upcomingSongs, isDragging]); // 👈 Aggiunto isDragging nelle dipendenze

  useEffect(() => {
    controls.start(position);
  }, [position, controls]);

  const onLocalReorder = (newOrder) => {
    setLocalQueue(newOrder); 
    if (window.navigator.vibrate) window.navigator.vibrate(30);
  };

  return (
    <>
      <motion.div 
        className="queue-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={async (e) => {
          e.stopPropagation();
          await controls.start('hidden');
          onClose();
        }}
      />
      
      <motion.div 
        className="mobile-queue-sheet"
        drag={isDragging ? false : "y"}
        onPointerDown={(e) => e.stopPropagation()}
        // Riportato alla normalità: il foglio gestisce il suo drag in modo nativo
        dragListener={false} // 👈 FONDAMENTALE: Impedisce al foglio di rubare i tocchi alla lista brani
        dragControls={sheetDragControls} // 👈 Collega il controllo manuale
        dragConstraints={{ top: 0, bottom: 800 }} 
        dragElastic={0.1}
        variants={sheetVariants}
        initial="hidden"
        animate={controls} 
        exit="hidden"
        transition={springConfig}
        // Trova questo blocco dentro il motion.div della "mobile-queue-sheet"
        onDragEnd={async (e, info) => {
          const { offset, velocity } = info;
          const dragThreshold = 80;      
          const velocityThreshold = 400; 

          if (position === 'half') {
            if (offset.y < -dragThreshold || velocity.y < -velocityThreshold) {
              setPosition('full');
            } else if (offset.y > dragThreshold || velocity.y > velocityThreshold) {
              
              // 🔴 MODIFICA FONDAMENTALE QUI:
              // Accompagna il foglio fino in fondo prima di smontarlo.
              // In questo modo il dito si stacca dallo schermo e l'evento non "cade" sul player sotto!
              await controls.start('hidden'); 
              onClose(); 
              
            } else {
              controls.start('half');
            }
          } else if (position === 'full') {
            if (offset.y > dragThreshold || velocity.y > velocityThreshold) {
              setPosition('half');
            } else {
              controls.start('full');
            }
          }
        }}
      >
        <div 
          ref={sheetHandleRef}
          className="queue-handle-area"
          style={{ 
            touchAction: 'none', 
            padding: '15px 0', 
            width: '100%', 
            display: 'flex', 
            justifyContent: 'center',
            cursor: 'grab'
          }}
        >
          <div className="queue-handle" style={{ margin: 0 }}></div>
        </div>

        <div className="queue-header-mobile">
          <div className="queue-title-group">
              <h3 className="queue-title-main">Coda</h3>
              {currentSong && <p className="queue-subtitle">In riproduzione da: {currentSong.album?.title || "Album"}</p>}
          </div>
          <button className="queue-edit-btn">Modifica</button>
        </div>

        {currentSong && (
          <div className="fixed-now-playing-container">
              <section className="queue-section no-margin">
              <h4 className="queue-section-label">In riproduzione</h4>
              <div className="queue-item active-playing">
                  <img src={getCoverUrl(currentSong)} alt="" className="queue-mini-cover" />
                  <div className="queue-info">
                  <p className="queue-song-name active-green-text">{currentSong.title}</p>
                  <p className="queue-artist-name">{currentSong.artist}</p>
                  </div>
                  <button 
                      className="queue-play-toggle-circular" 
                      onClick={(e) => { e.stopPropagation(); playSong(currentSong); }}
                  >
                      {isPlaying ? <Pause size={20} fill="black" /> : <Play size={20} fill="black" style={{ marginLeft: '0' }} />}
                  </button>
              </div>
              </section>
              <div className="queue-separator-line"></div>
              <div className="queue-bottom-shadow"></div>
          </div>
        )}

        {/* SOLUZIONE: Trasformato in motion.div.
            layoutScroll: Indispensabile affinché Reorder calcoli l'offset corretto dopo lo scroll.
            onPointerDown: Ferma l'evento qui, in modo che NON arrivi al foglio genitore e non lo faccia muovere.
        */}
        
        <motion.div 
          className="queue-content-scrollable" 
          layoutScroll
          style={{ touchAction: isDragging ? 'none' : 'auto' }} 
        >

          <section className="queue-section">
              <h4 className="queue-section-label">Prossime tracce consigliate</h4>
              {localQueue.length > 0 ? (
              <Reorder.Group 
                axis="y" 
                values={localQueue} 
                onReorder={onLocalReorder} 
                className="reorder-group"
              >
                {localQueue.map((song) => ( 
                  <QueueItem 
                    key={song.id}
                    song={song}
                    playSong={playSong}
                    getCoverUrl={getCoverUrl}
                    onPointerDownStart={handlePointerDownStart}
                    onDragStart={() => {
                      isDraggingRef.current = true;
                      setIsDragging(true);
                      if (window.navigator.vibrate) window.navigator.vibrate(40); 
                    }}
                    onDragEnd={() => {
                      const hasChanged = localQueue.map(s => s.id).join(',') !== upcomingSongs.map(s => s.id).join(',');
                      
                      if (hasChanged) {
                        if (window.navigator.vibrate) window.navigator.vibrate(25); 
                        
                        setTimeout(() => {
                          isDraggingRef.current = false;
                          // INVERTITI: Spegniamo prima il flag e poi aggiorniamo il Context. 
                          // Questo permette a React di ricevere la nuova coda a mente fresca.
                          setIsDragging(false);
                          handleReorder(localQueue);  
                        }, 400);
                      } else {
                        setLocalQueue([...upcomingSongs]);
                        isDraggingRef.current = false;
                        setIsDragging(false);
                      }
                    }}
                  />
                ))}
              </Reorder.Group>
              ) : (
              <p className="queue-empty-msg">Nessun brano in coda</p>
              )}
          </section>
        </motion.div>
      </motion.div>

      {/* --- BOTTOM BAR --- */}
      <motion.div 
        className="queue-bottom-bar-new"
        animate={controls} 
        variants={{
          hidden: { y: "100%" }, 
          half: { y: "0%" },     
          full: { y: "0%" }      
        }}
        transition={springConfig}
      >
          <button className={`nav-rect-btn ${isShuffle ? 'active' : ''}`} onClick={toggleShuffle}>
              <div className="rect-icon-box"><Shuffle size={24} /></div>
              <span>Casuale</span>
          </button>
          
          <button className={`nav-rect-btn ${repeatMode > 0 ? 'active' : ''}`} onClick={() => setRepeatMode((prev) => (prev + 1) % 3)}>
              <div className="rect-icon-box">{repeatMode === 2 ? <Repeat1 size={24} /> : <Repeat size={24} />}</div>
              <span>{repeatMode === 2 ? '1 brano' : 'Ripeti'}</span>
          </button>

          <button className={`nav-rect-btn ${activeTimer ? 'active' : ''}`} onClick={() => setIsTimerOpen(true)}>
              <div className="rect-icon-box"><Timer size={24} /></div>
              <span>{activeTimer ? (activeTimer === 'track' ? 'A fine brano' : `${activeTimer} min`) : 'Timer'}</span>
          </button>
      </motion.div>

      {/* --- TIMER MODAL --- */}
      <AnimatePresence>
        {isTimerOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, zIndex: 3500, backgroundColor: 'rgba(0,0,0,0.5)' }} 
              onClick={() => setIsTimerOpen(false)} 
            />
            <motion.div 
              key="timer-sheet"
              initial={{ y: "100%" }} animate={{ y: "0%" }} exit={{ y: "100%" }} 
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                backgroundColor: '#121212', borderTopLeftRadius: '12px', borderTopRightRadius: '12px',
                padding: '10px 20px 30px 20px', zIndex: 3600, display: 'flex', flexDirection: 'column',
                boxShadow: '0 -10px 25px rgba(0,0,0,0.5)'
              }}
            >
              <motion.div 
                className="queue-handle" style={{ marginBottom: '20px', cursor: 'grab' }}
                drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.1}
                onDragEnd={(e, info) => { if (info.offset.y > 80 || info.velocity.y > 400) setIsTimerOpen(false); }}
              />
              <h3 style={{ textAlign: 'center', fontSize: '16px', fontWeight: 'bold', color: 'white', marginBottom: '20px' }}>Timer spegnimento</h3>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[
                  { label: 'Disattiva timer', value: null }, { label: '5 minuti', value: 5 },
                  { label: '10 minuti', value: 10 }, { label: '15 minuti', value: 15 },
                  { label: '30 minuti', value: 30 }, { label: '45 minuti', value: 45 },
                  { label: '1 ora', value: 60 }, { label: 'Fine della traccia', value: 'track' }
                ].map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => { startSleepTimer(option.value); setIsTimerOpen(false); }}
                    style={{
                      padding: '16px 0', textAlign: 'left', background: 'none', border: 'none',
                      borderBottom: idx < 7 ? '1px solid #282828' : 'none', 
                      color: activeTimer === option.value ? '#1ed760' : '#fff', fontSize: '16px', fontWeight: '500', cursor: 'pointer'
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}, (prevProps, nextProps) => {
  const sameSong = prevProps.currentSong?.id === nextProps.currentSong?.id;
  const sameState = prevProps.isPlaying === nextProps.isPlaying &&
                    prevProps.isShuffle === nextProps.isShuffle &&
                    prevProps.repeatMode === nextProps.repeatMode &&
                    prevProps.activeTimer === nextProps.activeTimer;
  const prevIds = prevProps.upcomingSongs.map(s => s.id).join(',');
  const nextIds = nextProps.upcomingSongs.map(s => s.id).join(',');
  return sameSong && sameState && prevIds === nextIds;
});

QueueSheetUI.displayName = 'QueueSheetUI';

// ==========================================
// COMPONENTE WRAPPER
// ==========================================
const MobileQueue = ({ onClose }) => {
  
  const { currentSong, queue, reorderQueue, isPlaying, playSong, isShuffle, toggleShuffle, repeatMode, setRepeatMode, activeTimer, startSleepTimer } = useContext(PlayerStateContext); 

  const safeQueue = queue || [];
  const currentSongId = currentSong?.id;

  const upcomingSongs = useMemo(() => {
    const currentIndex = currentSongId ? safeQueue.findIndex(s => s.id === currentSongId) : -1;
    return currentIndex !== -1 ? safeQueue.slice(currentIndex + 1) : safeQueue;
  }, [safeQueue, currentSongId]);

  const handleReorder = useCallback((newUpcomingOrder) => {
    const currentIndex = currentSongId ? safeQueue.findIndex(s => s.id === currentSongId) : -1;
    const historyAndCurrent = safeQueue.slice(0, currentIndex + 1);
    reorderQueue([...historyAndCurrent, ...newUpcomingOrder]); 
  }, [safeQueue, currentSongId, reorderQueue]);

  const getCoverUrl = useCallback((song) => coverOf(song), []);

  return (
    <QueueSheetUI
      currentSong={currentSong} upcomingSongs={upcomingSongs} isPlaying={isPlaying} isShuffle={isShuffle}
      repeatMode={repeatMode} activeTimer={activeTimer} playSong={playSong} toggleShuffle={toggleShuffle}
      setRepeatMode={setRepeatMode} startSleepTimer={startSleepTimer} handleReorder={handleReorder}
      onClose={onClose} getCoverUrl={getCoverUrl}
    />
  );
};

export default MobileQueue;