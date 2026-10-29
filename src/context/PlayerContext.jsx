import React, { createContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { isPlayable, notify, api, apiBase, readAuth, streamUrl, coverOf } from '../lib/api';
import { useAuth } from './AuthContext';

export const PlayerContext = createContext();
export const PlayerStateContext = createContext();

const MAX_SYNCED_QUEUE = 500;

const readVolume = () => {
  try {
    const v = parseFloat(localStorage.getItem('player_volume'));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.7;
  } catch { return 0.7; }
};

/** Finestra di al massimo 500 ID attorno al brano corrente, da salvare sul server. */
const queueIds = (queue, currentId) => {
  const idx = Math.max(0, queue.findIndex((s) => s.id === currentId));
  const start = Math.max(0, idx - 20);
  return queue.slice(start, start + MAX_SYNCED_QUEUE).map((s) => s.id);
};

export const PlayerProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? null;

  const [currentSong, setCurrentSong] = useState(null);
  const [queue, setQueue] = useState([]);
  const [originalQueue, setOriginalQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState(0); // 0 spento, 1 tutta la coda, 2 brano singolo
  const [volume, setVolume] = useState(readVolume);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [activeTimer, setActiveTimer] = useState(null);
  const [isLocalAudioActive, setIsLocalAudioActive] = useState(true);
  const [remoteThemeUpdates, setRemoteThemeUpdates] = useState(null);

  const audioRef = useRef(null);
  if (audioRef.current === null) audioRef.current = new Audio();
  const socketRef = useRef(null);
  const timerRef = useRef(null);
  const listenRef = useRef({ id: null, ms: 0 });
  const lastTimeRef = useRef(0);

  // Copia dello stato sempre aggiornata: le funzioni stabili la leggono invece di catturare valori vecchi.
  const stateRef = useRef({});
  useEffect(() => {
    stateRef.current = { currentSong, queue, originalQueue, isPlaying, isLocalAudioActive, repeatMode, activeTimer, isShuffle, userId };
  }, [currentSong, queue, originalQueue, isPlaying, isLocalAudioActive, repeatMode, activeTimer, isShuffle, userId]);

  const emit = useCallback((action, payload) => {
    socketRef.current?.emit('send_playback_command', { action, payload });
  }, []);

  // ---------- Cronologia di ascolto ----------
  const flushListen = useCallback((completed) => {
    const { id, ms } = listenRef.current;
    listenRef.current = { id: null, ms: 0 };
    if (!id || !stateRef.current.isLocalAudioActive) return;
    if (completed || ms >= 30000) {
      api.post('/api/library/listens', { trackId: id, playedMs: Math.round(ms), completed: !!completed })
        .catch(() => { /* la cronologia non deve mai interrompere la musica */ });
    }
  }, []);

  // ---------- Avvio di un brano (sempre da capo) ----------
  const startTrack = useCallback((song, list) => {
    const audio = audioRef.current;
    flushListen(false);
    setIsLocalAudioActive(true);
    stateRef.current.isLocalAudioActive = true;
    audio.muted = false;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    audio.pause();
    setCurrentSong(song);
    audio.src = streamUrl(song);
    listenRef.current = { id: song.id, ms: 0 };
    lastTimeRef.current = 0;
    audio.play().then(() => setIsPlaying(true)).catch((err) => {
      if (err?.name !== 'AbortError') console.warn('Riproduzione non avviata:', err?.message || err);
      setIsPlaying(false);
    });
    emit('PLAY_SONG', { song, songList: list ?? stateRef.current.queue, isPlayingState: true });
  }, [emit, flushListen]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!stateRef.current.currentSong) return;
    setIsLocalAudioActive(true);
    audio.muted = false;
    const willPlay = audio.paused;
    if (willPlay) audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
    emit('TOGGLE_PLAY', { isPlaying: willPlay });
  }, [emit]);

  /** Click su un brano: se è già quello corrente fa play/pausa, altrimenti lo avvia (con eventuale nuova coda). */
  const playSong = useCallback((song, songListIn = []) => {
    const s = stateRef.current;
    if (!isPlayable(song)) { notify('Brano non riproducibile: il file è vuoto o incompleto', 'error'); return; }
    const songList = songListIn.filter(isPlayable); // i brani rovinati restano nella lista ma non entrano in coda
    if (songList.length > 0) {
      setQueue(songList);
      setOriginalQueue(songList);
      setIsShuffle(false);
      stateRef.current = { ...s, queue: songList };
    }
    if (s.currentSong?.id === song.id) {
      togglePlay();
      return;
    }
    startTrack(song, songList.length > 0 ? songList : undefined);
  }, [startTrack, togglePlay]);

  const nextSong = useCallback(() => {
    const { queue: q, currentSong: cur, repeatMode: rep } = stateRef.current;
    if (!cur || q.length === 0) return;
    const idx = q.findIndex((s) => s.id === cur.id);
    // primo brano riproducibile dopo quello corrente (con "ripeti tutto" si riparte dall'inizio)
    let n = -1;
    for (let i = idx + 1; i < q.length; i++) { if (isPlayable(q[i])) { n = i; break; } }
    if (n === -1 && rep === 1) n = q.findIndex(isPlayable);
    if (n === -1) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    startTrack(q[n]);
  }, [startTrack]);

  const seekTo = useCallback((time) => {
    setIsLocalAudioActive(true);
    audioRef.current.muted = false;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
    emit('SEEK', { time });
  }, [emit]);

  const prevSong = useCallback(() => {
    const { queue: q, currentSong: cur } = stateRef.current;
    if (!cur || q.length === 0) return;
    // Come in Spotify: dopo i primi secondi "indietro" riparte dall'inizio del brano
    if (audioRef.current.currentTime > 3) { seekTo(0); return; }
    const idx = q.findIndex((s) => s.id === cur.id);
    for (let step = 1; step <= q.length; step++) {
      const cand = q[(idx - step + q.length * 2) % q.length];
      if (isPlayable(cand)) { startTrack(cand); return; }
    }
  }, [seekTo, startTrack]);

  // ---------- Fine brano ----------
  useEffect(() => {
    const audio = audioRef.current;
    const onEnded = () => {
      const s = stateRef.current;
      if (!s.isLocalAudioActive) return; // un dispositivo "a specchio" non decide cosa suonare dopo
      flushListen(true);
      if (s.activeTimer === 'track') {
        audio.pause();
        setIsPlaying(false);
        setActiveTimer(null);
        return;
      }
      if (s.repeatMode === 2) {
        listenRef.current = { id: s.currentSong?.id ?? null, ms: 0 };
        lastTimeRef.current = 0;
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      nextSong();
    };
    const onError = () => {
      if (audio.src && audio.error) console.warn('Errore audio:', audio.error.code, audio.error.message);
      setIsPlaying(false);
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [nextSong, flushListen]);

  // ---------- Stato reale dell'elemento audio, tempo e durata ----------
  useEffect(() => {
    const audio = audioRef.current;
    const onTime = () => {
      if (audio.readyState === 0) return;
      const t = audio.currentTime;
      const delta = t - lastTimeRef.current;
      if (!audio.paused && delta > 0 && delta < 2) listenRef.current.ms += delta * 1000;
      lastTimeRef.current = t;
      setCurrentTime(t);
    };
    const onMeta = () => { if (audio.readyState !== 0) setDuration(audio.duration || 0); };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  useEffect(() => { audioRef.current.muted = !isLocalAudioActive; }, [isLocalAudioActive]);
  useEffect(() => { audioRef.current.volume = volume; }, [volume]);

  // Cambio utente o logout: il provider viene smontato, si ferma tutto.
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      clearTimeout(timerRef.current);
    };
  }, []);

  // ---------- Ripristino dello stato salvato sul server ----------
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    api.get('/api/playback').then(({ data }) => {
      if (cancelled || !data.track) return;
      const audio = audioRef.current;
      setQueue(data.queue);
      setOriginalQueue(data.queue);
      setCurrentSong(data.track);
      setCurrentTime(data.currentTime || 0);
      audio.src = streamUrl(data.track);
      listenRef.current = { id: null, ms: 0 }; // il ripristino non conta come ascolto
      audio.addEventListener('loadedmetadata', () => { audio.currentTime = data.currentTime || 0; }, { once: true });
    }).catch(() => { /* nessuno stato salvato */ });
    return () => { cancelled = true; };
  }, [userId]);

  // ---------- Salvataggio dello stato sul server ----------
  const buildState = useCallback(() => {
    const s = stateRef.current;
    if (!s.currentSong) return null;
    const q = s.originalQueue.length > 0 ? s.originalQueue : s.queue;
    return { trackId: s.currentSong.id, currentTime: audioRef.current.currentTime || 0, queue: queueIds(q, s.currentSong.id) };
  }, []);

  const saveState = useCallback(() => {
    const body = buildState();
    if (body) api.put('/api/playback', body).catch(() => {});
  }, [buildState]);

  // al cambio di brano o di coda (con piccola attesa per non salvare a raffica)
  useEffect(() => {
    if (!currentSong || !userId) return undefined;
    const t = setTimeout(saveState, 1500);
    return () => clearTimeout(t);
  }, [currentSong, queue, originalQueue, userId, saveState]);

  // ogni 10 secondi mentre suona
  useEffect(() => {
    if (!isPlaying || !userId) return undefined;
    const id = setInterval(saveState, 10000);
    return () => clearInterval(id);
  }, [isPlaying, userId, saveState]);

  // alla chiusura/background della pagina (keepalive permette di inviare anche mentre la pagina si chiude)
  useEffect(() => {
    if (!userId) return undefined;
    const flush = () => {
      const body = buildState();
      const auth = readAuth();
      if (!body || !auth?.token) return;
      fetch(`${apiBase}/api/playback`, {
        method: 'PUT',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify(body),
      }).catch(() => {});
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId, buildState]);

  // ---------- WebSocket: telecomando tra i dispositivi dello stesso utente ----------
  useEffect(() => {
    if (!userId || !isAuthenticated) return undefined;
    const audio = audioRef.current;
    // Il token viene riletto a ogni (ri)connessione, così resta valido dopo i rinnovi.
    const socket = io(apiBase || undefined, { auth: (cb) => cb({ token: readAuth()?.token || '' }) });
    socketRef.current = socket;

    const mirror = (fn) => { setIsLocalAudioActive(false); audio.muted = true; fn(); };
    const applyPlay = (shouldPlay) => {
      if (shouldPlay) audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      else { audio.pause(); setIsPlaying(false); }
    };

    socket.on('connect', () => socket.emit('request_playback_state'));

    // Un altro dispositivo appena collegato chiede lo stato: lo fornisce chi sta suonando
    socket.on('provide_playback_state', () => {
      const s = stateRef.current;
      if (s.isLocalAudioActive && s.isPlaying && s.currentSong) {
        socket.emit('send_playback_command', {
          action: 'SYNC_FULL_STATE',
          payload: { song: s.currentSong, queue: s.queue, time: audio.currentTime, isPlaying: true },
        });
      }
    });

    socket.on('receive_playback_command', ({ action, payload }) => {
      if (!payload) return;
      switch (action) {
        case 'SYNC_FULL_STATE':
          mirror(() => {
            setQueue(payload.queue); setOriginalQueue(payload.queue);
            setCurrentSong(payload.song); setCurrentTime(payload.time);
            audio.src = streamUrl(payload.song);
            audio.addEventListener('loadedmetadata', () => { audio.currentTime = payload.time; }, { once: true });
            listenRef.current = { id: null, ms: 0 };
            applyPlay(payload.isPlaying);
          });
          break;
        case 'PLAY_SONG':
          mirror(() => {
            if (payload.songList?.length) { setQueue(payload.songList); setOriginalQueue(payload.songList); }
            setCurrentSong(payload.song); setCurrentTime(0); setDuration(0);
            audio.src = streamUrl(payload.song);
            listenRef.current = { id: null, ms: 0 };
            applyPlay(payload.isPlayingState);
          });
          break;
        case 'TOGGLE_PLAY':
          mirror(() => applyPlay(payload.isPlaying));
          break;
        case 'SEEK':
          mirror(() => { audio.currentTime = payload.time; setCurrentTime(payload.time); });
          break;
        case 'QUEUE_UPDATE':
          setQueue(payload.queue); setOriginalQueue(payload.queue);
          break;
        case 'SHUFFLE_TOGGLE':
          setIsShuffle(payload.isShuffle); setQueue(payload.queue);
          break;
        default:
          break;
      }
    });

    socket.on('receive_ui_update', (settings) => setRemoteThemeUpdates(settings));

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [userId, isAuthenticated]);

  const broadcastUiUpdate = useCallback((settings) => {
    socketRef.current?.emit('send_ui_update', settings);
  }, []);

  // ---------- Casuale, coda, volume, timer ----------
  const toggleShuffle = useCallback(() => {
    const { currentSong: cur, queue: q, originalQueue: orig, isShuffle: was } = stateRef.current;
    const nowShuffle = !was;
    setIsShuffle(nowShuffle);
    if (!cur || q.length === 0) return;
    const idx = q.findIndex((s) => s.id === cur.id);
    if (idx === -1) return;

    const head = q.slice(0, idx + 1);
    let next = [];
    if (nowShuffle) {
      const upcoming = q.slice(idx + 1);
      for (let i = upcoming.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
      }
      next = [...head, ...upcoming];
    } else if (orig.length > 0) {
      const oi = orig.findIndex((s) => s.id === cur.id);
      if (oi !== -1) next = [...head, ...orig.slice(oi + 1)];
    }
    if (next.length > 0) {
      setQueue(next);
      emit('SHUFFLE_TOGGLE', { isShuffle: nowShuffle, queue: next });
    }
  }, [emit]);

  const reorderQueue = useCallback((newQueue) => {
    setQueue(newQueue);
    setOriginalQueue(newQueue);
    emit('QUEUE_UPDATE', { queue: newQueue });
  }, [emit]);

  /**
   * Aggiunge un brano alla coda. mode 'next' = subito dopo quello in ascolto, 'end' = in fondo.
   * Un brano già in coda non viene duplicato (la coda ragiona per id): 'next' lo sposta, 'end' lo lascia dov'è.
   * Ritorna 'started' | 'current' | 'duplicate' | 'moved' | 'added' così la UI può dare il messaggio giusto.
   */
  const enqueue = useCallback((song, mode = 'end') => {
    const s = stateRef.current;
    if (!s.currentSong) {
      setQueue([song]);
      setOriginalQueue([song]);
      stateRef.current = { ...s, queue: [song], originalQueue: [song] };
      startTrack(song, [song]);
      return 'started';
    }
    if (s.currentSong.id === song.id) return 'current';
    const inQueue = s.queue.some((x) => x.id === song.id);
    if (inQueue && mode === 'end') return 'duplicate';
    const place = (list) => {
      const without = list.filter((x) => x.id !== song.id);
      const idx = without.findIndex((x) => x.id === s.currentSong.id);
      if (mode === 'next' && idx !== -1) without.splice(idx + 1, 0, song);
      else without.push(song);
      return without;
    };
    const nextQueue = place(s.queue);
    const nextOriginal = place(s.originalQueue.length > 0 ? s.originalQueue : s.queue);
    setQueue(nextQueue);
    setOriginalQueue(nextOriginal);
    stateRef.current = { ...s, queue: nextQueue, originalQueue: nextOriginal };
    emit('QUEUE_UPDATE', { queue: nextQueue });
    return inQueue ? 'moved' : 'added';
  }, [emit, startTrack]);

  const addToQueue = useCallback((song) => enqueue(song, 'end'), [enqueue]);
  const playNext = useCallback((song) => enqueue(song, 'next'), [enqueue]);

  const changeVolume = useCallback((val) => {
    const v = Math.min(1, Math.max(0, parseFloat(val) || 0));
    setVolume(v);
    try { localStorage.setItem('player_volume', String(v)); } catch { /* niente da fare */ }
  }, []);

  const startSleepTimer = useCallback((minutes) => {
    clearTimeout(timerRef.current);
    if (minutes === null) { setActiveTimer(null); return; }
    setActiveTimer(minutes);
    if (minutes !== 'track') {
      timerRef.current = setTimeout(() => {
        audioRef.current.pause();
        setIsPlaying(false);
        setActiveTimer(null);
      }, minutes * 60 * 1000);
    }
  }, []);

  // ---------- Controlli di sistema (schermata di blocco, cuffie, tastiera multimediale) ----------
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;
    const cover = new URL(coverOf(currentSong), window.location.href).href;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.artist || '',
      album: currentSong.album || '',
      artwork: [{ src: cover, sizes: '640x640', type: 'image/jpeg' }],
    });
  }, [currentSong]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return undefined;
    const audio = audioRef.current;
    const ms = navigator.mediaSession;
    const set = (name, fn) => { try { ms.setActionHandler(name, fn); } catch { /* azione non supportata */ } };
    set('play', () => { if (audio.paused) togglePlay(); });
    set('pause', () => { if (!audio.paused) togglePlay(); });
    set('previoustrack', prevSong);
    set('nexttrack', nextSong);
    set('seekto', (d) => { if (typeof d.seekTime === 'number') seekTo(d.seekTime); });
    set('seekbackward', (d) => seekTo(Math.max(0, audio.currentTime - (d.seekOffset || 10))));
    set('seekforward', (d) => seekTo(Math.min(audio.duration || 0, audio.currentTime + (d.seekOffset || 10))));
    return () => ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward'].forEach((n) => set(n, null));
  }, [togglePlay, prevSong, nextSong, seekTo]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !duration || !Number.isFinite(duration)) return;
    try {
      navigator.mediaSession.setPositionState({ duration, position: Math.min(currentTime, duration), playbackRate: 1 });
    } catch { /* non supportato */ }
  }, [currentTime, duration]);

  // ---------- Valori esposti ----------
  const stateValue = useMemo(() => ({
    currentSong, isPlaying, playSong, togglePlay, setIsPlaying,
    duration, seekTo, nextSong, prevSong, volume, changeVolume,
    isShuffle, setIsShuffle, toggleShuffle, repeatMode, setRepeatMode,
    isRightSidebarOpen, setIsRightSidebarOpen,
    queue, setQueue, reorderQueue, addToQueue, playNext, activeTimer, startSleepTimer,
    isLocalAudioActive, broadcastUiUpdate, remoteThemeUpdates,
  }), [
    currentSong, isPlaying, playSong, togglePlay, duration, seekTo, nextSong, prevSong, volume, changeVolume,
    isShuffle, toggleShuffle, repeatMode, isRightSidebarOpen, queue, reorderQueue, addToQueue, playNext, activeTimer, startSleepTimer,
    isLocalAudioActive, broadcastUiUpdate, remoteThemeUpdates,
  ]);

  // currentTime cambia ogni ~250ms: sta in un contesto a parte così il resto dell'app non si ridisegna di continuo
  const fullValue = useMemo(() => ({ ...stateValue, currentTime }), [stateValue, currentTime]);

  return (
    <PlayerStateContext.Provider value={stateValue}>
      <PlayerContext.Provider value={fullValue}>
        {children}
      </PlayerContext.Provider>
    </PlayerStateContext.Provider>
  );
};
