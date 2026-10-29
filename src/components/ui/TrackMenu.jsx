import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Ellipsis, ListPlus, SkipForward, Plus, ListMusic, Disc3, User, Trash2, ChevronLeft, Check, Download, ArrowDownToLine, HardDriveDownload } from 'lucide-react';
import { PlayerStateContext } from '../../context/PlayerContext';
import { useToast } from '../../context/ToastContext';
import { coverOf, errorMessage, streamUrl } from '../../lib/api';
import { addTracksToPlaylist, createPlaylist, usePlaylists } from '../../lib/playlists';
import PlaylistCover from './PlaylistCover';
import { isOfflineSupported, removeTrack, saveTrack, requestPersistence, useOfflineIds } from '../../lib/offline';

const TrackMenuContext = createContext({ openMenu: () => {} });

/** Pulsante "..." da mettere in ogni riga brano. `onRemove` (opzionale) aggiunge la voce "Rimuovi da questa playlist". */
export const TrackMenuButton = ({ track, onRemove, removeLabel, size = 18, className = '' }) => {
  const { openMenu } = useContext(TrackMenuContext);
  if (!track) return null;
  return (
    <button
      type="button"
      className={`icon-btn track-menu-btn ${className}`}
      aria-label={`Altre azioni per ${track.title}`}
      aria-haspopup="menu"
      onClick={(e) => { e.stopPropagation(); openMenu(track, e.currentTarget.getBoundingClientRect(), { onRemove, removeLabel }); }}
    >
      <Ellipsis size={size} />
    </button>
  );
};

const MENU_W = 264;

export const TrackMenuProvider = ({ children }) => {
  const [state, setState] = useState(null); // { track, rect, onRemove }
  const openMenu = useCallback((track, rect, opts = {}) => setState({ track, rect, onRemove: opts.onRemove, removeLabel: opts.removeLabel }), []);
  const close = useCallback(() => setState(null), []);
  const value = useMemo(() => ({ openMenu }), [openMenu]);

  return (
    <TrackMenuContext.Provider value={value}>
      {children}
      {state && createPortal(<MenuLayer {...state} onClose={close} />, document.body)}
    </TrackMenuContext.Provider>
  );
};

const MenuLayer = ({ track, rect, onRemove, removeLabel, onClose }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const { addToQueue, playNext } = useContext(PlayerStateContext);
  const { playlists } = usePlaylists();
  const [view, setView] = useState('main'); // main | playlists
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const offlineIds = useOfflineIds();
  const isSaved = offlineIds.has(track.id);
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);
  const isSheet = window.innerWidth <= 768;

  // Posiziona il popover sotto il pulsante (o sopra, se sotto non c'è spazio) senza uscire dallo schermo
  useLayoutEffect(() => {
    if (isSheet || !popRef.current) return;
    const h = popRef.current.offsetHeight;
    const left = Math.max(8, Math.min(rect.right - MENU_W, window.innerWidth - MENU_W - 8));
    let top = rect.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 6);
    setPos({ left, top });
  }, [isSheet, rect, view, playlists]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const queueMessage = {
    started: 'In riproduzione', current: 'È il brano in ascolto', duplicate: 'Già in coda',
    moved: 'Spostato dopo il brano corrente', added: 'Aggiunto alla coda',
  };
  const doQueue = (mode) => {
    const result = mode === 'next' ? playNext(track) : addToQueue(track);
    toast(result === 'added' && mode === 'next' ? 'Lo ascolterai subito dopo' : queueMessage[result] || 'Fatto');
    onClose();
  };

  const withBusy = async (fn, okMessage) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); toast(okMessage); onClose(); } catch (e) { toast(errorMessage(e), 'error'); setBusy(false); }
  };

  const toPlaylist = (pl) => withBusy(() => addTracksToPlaylist(pl.id, [track.id]), `Aggiunto a "${pl.name}"`);
  const toNewPlaylist = (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    withBusy(() => createPlaylist(name, [track.id]), `Playlist "${name}" creata`);
  };

  const toggleOffline = () => withBusy(async () => {
    if (isSaved) await removeTrack(track.id);
    else { await requestPersistence(); await saveTrack(track); }
  }, isSaved ? 'Rimosso dal dispositivo' : 'Disponibile offline');

  const go = (path) => { onClose(); navigate(path); };

  const body = view === 'main' ? (
    <>
      <div className="menu-head">
        <img src={coverOf(track)} alt="" />
        <div><strong>{track.title}</strong><span>{track.artist}</span></div>
      </div>
      <button type="button" className="menu-item" role="menuitem" onClick={() => doQueue('next')}><SkipForward size={18} /> Riproduci dopo</button>
      <button type="button" className="menu-item" role="menuitem" onClick={() => doQueue('end')}><ListPlus size={18} /> Aggiungi alla coda</button>
      <button type="button" className="menu-item" role="menuitem" onClick={() => setView('playlists')}><ListMusic size={18} /> Aggiungi a una playlist</button>
      {isOfflineSupported() && (
        <button type="button" className="menu-item" role="menuitem" disabled={busy} onClick={toggleOffline}>
          {isSaved ? <ArrowDownToLine size={18} /> : <Download size={18} />} {isSaved ? 'Rimuovi dai download' : 'Scarica sul dispositivo'}
        </button>
      )}
      <a className="menu-item" role="menuitem" href={streamUrl(track, { download: true })} download onClick={onClose}><HardDriveDownload size={18} /> Scarica il file</a>
      {onRemove && (
        <button type="button" className="menu-item is-danger" role="menuitem" onClick={() => { onClose(); onRemove(); }}><Trash2 size={18} /> {removeLabel || 'Rimuovi da questa playlist'}</button>
      )}
      <div className="menu-sep" />
      {track.albumId && <button type="button" className="menu-item" role="menuitem" onClick={() => go(`/album/${track.albumId}`)}><Disc3 size={18} /> Vai all'album</button>}
      {track.artistId && <button type="button" className="menu-item" role="menuitem" onClick={() => go(`/artist/${track.artistId}`)}><User size={18} /> Vai all'artista</button>}
    </>
  ) : (
    <>
      <button type="button" className="menu-item menu-back" onClick={() => setView('main')}><ChevronLeft size={18} /> Aggiungi a una playlist</button>
      <form className="menu-new" onSubmit={toNewPlaylist}>
        <Plus size={18} />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nuova playlist"
          maxLength={80}
          aria-label="Nome della nuova playlist"
        />
        <button type="submit" className="menu-new-ok" disabled={!newName.trim() || busy} aria-label="Crea playlist"><Check size={18} /></button>
      </form>
      <div className="menu-scroll">
        {playlists === null && <p className="menu-empty">Caricamento...</p>}
        {playlists?.length === 0 && <p className="menu-empty">Non hai ancora playlist: creane una qui sopra.</p>}
        {playlists?.map((pl) => (
          <button key={pl.id} type="button" className="menu-item" role="menuitem" disabled={busy} onClick={() => toPlaylist(pl)}>
            <PlaylistCover covers={pl.covers} className="menu-pl-cover" />
            <span className="menu-item-text"><span>{pl.name}</span><small>{pl.trackCount} brani</small></span>
          </button>
        ))}
      </div>
    </>
  );

  return (
    <>
      <div className={`menu-backdrop ${isSheet ? 'is-sheet' : ''}`} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        ref={popRef}
        role="menu"
        className={`track-menu ${isSheet ? 'is-sheet' : ''}`}
        style={isSheet ? undefined : { left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: MENU_W }}
      >
        {isSheet && <div className="sheet-grip" />}
        {body}
      </div>
    </>
  );
};
