import React, { useRef, useState } from 'react';
import { Download, ArrowDownToLine, LoaderCircle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { isOfflineSupported, removeTracks, requestPersistence, saveTracks, useOfflineIds } from '../../lib/offline';

/** Pulsante "scarica per ascoltare offline" per un insieme di brani (album, playlist). */
const DownloadButton = ({ tracks }) => {
  const toast = useToast();
  const ids = useOfflineIds();
  const [progress, setProgress] = useState(null); // { done, total } mentre scarica
  const abortRef = useRef(null);

  if (!isOfflineSupported() || !tracks.length) return null;

  const saved = tracks.filter((t) => ids.has(t.id)).length;
  const all = saved === tracks.length;
  const busy = progress !== null;

  const start = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ done: 0, total: tracks.length });
    await requestPersistence();
    const { done, failed } = await saveTracks(tracks, {
      signal: controller.signal,
      onProgress: (d, total) => setProgress({ done: d, total }),
    });
    setProgress(null);
    abortRef.current = null;
    if (controller.signal.aborted) toast('Download interrotto');
    else if (failed) toast(`${done - failed} brani salvati, ${failed} non riusciti`, 'error');
    else toast('Disponibile offline');
  };

  const onClick = async () => {
    if (busy) { abortRef.current?.abort(); return; }
    if (all) { await removeTracks(tracks); toast('Rimosso dal dispositivo'); return; }
    start();
  };

  const label = busy ? 'Interrompi il download' : all ? 'Rimuovi dal dispositivo' : 'Scarica per ascoltare offline';
  return (
    <button type="button" className={`icon-btn round-btn dl-btn ${all ? 'is-on' : ''}`} onClick={onClick} aria-label={label} title={label}>
      {busy ? <LoaderCircle size={18} className="spin" /> : all ? <ArrowDownToLine size={18} /> : <Download size={18} />}
      {busy && <span className="dl-count">{progress.done}/{progress.total}</span>}
      {!busy && !all && saved > 0 && <span className="dl-count">{saved}/{tracks.length}</span>}
    </button>
  );
};

export default DownloadButton;
