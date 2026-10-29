import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload as UploadIcon, FolderUp, Music2, Check, TriangleAlert, Copy, LoaderCircle, X } from 'lucide-react';
import { errorMessage } from '../lib/api';
import { isIos } from '../lib/pwa';
import { ACCEPT, fromDrop, fromFileList, getScan, isAudioName, requestScan, uploadFile } from '../lib/uploader';
import '../styles/Home.css';

const PARALLEL = 2;
let nextId = 1;

const Upload = () => {
  const [items, setItems] = useState([]);
  const [ignored, setIgnored] = useState(0);
  const [scan, setScan] = useState({ phase: 'idle', summary: null, error: '' }); // idle | running | done | error
  const [dragging, setDragging] = useState(false);
  const started = useRef(new Set());
  const controllers = useRef(new Map());
  const scanning = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scanned = useRef(0); // quanti caricamenti riusciti sono già coperti da una scansione
  const fileInput = useRef(null);
  const folderInput = useRef(null);

  const patch = useCallback((id, p) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it))), []);

  const add = useCallback((picked) => {
    const audio = picked.filter((x) => isAudioName(x.file.name));
    setIgnored((n) => n + picked.length - audio.length);
    if (!audio.length) return;
    setItems((prev) => [...prev, ...audio.map((x) => ({ id: nextId++, file: x.file, dir: x.dir, status: 'queued', progress: 0 }))]);
  }, []);

  // Coda: al massimo PARALLEL caricamenti insieme
  useEffect(() => {
    const active = items.filter((i) => i.status === 'uploading').length;
    const free = PARALLEL - active;
    if (free <= 0) return;
    items.filter((i) => i.status === 'queued' && !started.current.has(i.id)).slice(0, free).forEach((it) => {
      started.current.add(it.id);
      const controller = new AbortController();
      controllers.current.set(it.id, controller);
      patch(it.id, { status: 'uploading' });
      uploadFile(it, { signal: controller.signal, onProgress: (p) => patch(it.id, { progress: p }) })
        .then((res) => patch(it.id, { status: res.status === 'duplicate' ? 'duplicate' : 'done', progress: 1, result: res }))
        .catch((e) => patch(it.id, { status: e.name === 'AbortError' ? 'cancelled' : 'error', error: e.message }))
        .finally(() => controllers.current.delete(it.id));
    });
  }, [items, patch]);

  const busy = items.some((i) => i.status === 'queued' || i.status === 'uploading');
  const okCount = items.filter((i) => i.status === 'done').length;

  // Finita la coda: aggiorna il catalogo e aspetta che la scansione termini
  useEffect(() => {
    if (busy || okCount === 0 || okCount === scanned.current || scanning.current) return;
    scanned.current = okCount;
    scanning.current = true;
    setScan({ phase: 'running', summary: null, error: '' });
    (async () => {
      try {
        let state = await requestScan();
        while (mounted.current && (state.running || state.pending)) {
          await new Promise((r) => setTimeout(r, 1500));
          state = await getScan();
        }
        if (!mounted.current) return;
        if (state.ok === false) setScan({ phase: 'error', summary: null, error: state.error || 'Scansione non riuscita' });
        else setScan({ phase: 'done', summary: state.summary, error: '' });
      } catch (e) {
        if (mounted.current) setScan({ phase: 'error', summary: null, error: errorMessage(e) });
      } finally {
        scanning.current = false;
      }
    })();
  }, [busy, okCount, scan.phase]);

  // Avvisa se chiudi la pagina con caricamenti in corso
  useEffect(() => {
    if (!busy) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const cancelAll = () => {
    setItems((prev) => prev.map((i) => (i.status === 'queued' ? { ...i, status: 'cancelled' } : i)));
    controllers.current.forEach((c) => c.abort());
  };
  const retry = (id) => { started.current.delete(id); patch(id, { status: 'queued', progress: 0, error: '' }); };
  const clearFinished = () => setItems((prev) => prev.filter((i) => i.status === 'queued' || i.status === 'uploading'));

  const onPick = (e) => { add(fromFileList(e.target.files)); e.target.value = ''; };
  const onDrop = async (e) => { e.preventDefault(); setDragging(false); add(await fromDrop(e.dataTransfer)); };

  // Riepilogo per album dei brani archiviati
  const groups = useMemo(() => {
    const map = new Map();
    items.filter((i) => i.status === 'done').forEach((i) => {
      const r = i.result;
      const key = `${r.artist}\u0000${r.album}`;
      if (!map.has(key)) map.set(key, { artist: r.artist, album: r.album, count: 0, artistIsNew: r.artistIsNew, albumIsNew: r.albumIsNew });
      map.get(key).count += 1;
    });
    return [...map.values()];
  }, [items]);

  const iconFor = (i) => {
    if (i.status === 'done') return <Check size={18} className="up-ok" />;
    if (i.status === 'duplicate') return <Copy size={18} />;
    if (i.status === 'error' || i.status === 'cancelled') return <TriangleAlert size={18} className="up-err" />;
    if (i.status === 'uploading') return <LoaderCircle size={18} className="spin" />;
    return <Music2 size={18} />;
  };
  const subFor = (i) => {
    if (i.status === 'done') return `${i.result.artist} · ${i.result.album}${i.result.artistIsNew ? ' · nuovo artista' : ''}`;
    if (i.status === 'duplicate') return `Già presente: ${i.result.artist} · ${i.result.album}`;
    if (i.status === 'error') return i.error;
    if (i.status === 'cancelled') return 'Annullato';
    if (i.status === 'uploading') return `${Math.round(i.progress * 100)}%`;
    return 'In attesa';
  };

  return (
    <div className="home-page upload-page">
      <h3>Carica musica</h3>
      <p className="muted-text">I brani vengono archiviati da soli nella cartella dell'artista e dell'album giusti, letti dai tag. Se l'artista non esiste ancora, viene creato.</p>

      <div
        className={`upload-drop ${dragging ? 'is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <UploadIcon size={30} />
        <strong>{isIos() ? 'Aggiungi brani alla libreria' : 'Trascina qui file o cartelle'}</strong>
        <span>mp3, flac, m4a, aac, ogg, opus, wav</span>
        <div className="upload-buttons">
          <button type="button" className="pill-btn primary" onClick={() => fileInput.current?.click()}><Music2 size={16} /> Scegli file</button>
          {!isIos() && <button type="button" className="pill-btn" onClick={() => folderInput.current?.click()}><FolderUp size={16} /> Scegli cartella</button>}
        </div>
        <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden onChange={onPick} />
        <input ref={folderInput} type="file" multiple hidden onChange={onPick} webkitdirectory="" directory="" />
      </div>

      {ignored > 0 && <p className="muted-text">{ignored} file ignorati perché non sono audio.</p>}

      {items.length > 0 && (
        <>
          <div className="upload-toolbar">
            <span className="muted-text">{items.filter((i) => ['done', 'duplicate'].includes(i.status)).length} di {items.length} completati</span>
            {busy
              ? <button type="button" className="pill-btn" onClick={cancelAll}><X size={16} /> Annulla</button>
              : <button type="button" className="pill-btn" onClick={clearFinished}>Pulisci elenco</button>}
          </div>
          <ul className="upload-list">
            {items.map((i) => (
              <li key={i.id} className={`upload-item is-${i.status}`}>
                <span className="upload-icon">{iconFor(i)}</span>
                <span className="upload-text">
                  <span className="song-name">{i.file.name}</span>
                  <span className="song-sub">{subFor(i)}</span>
                </span>
                {(i.status === 'error' || i.status === 'cancelled') && <button type="button" className="pill-btn" onClick={() => retry(i.id)}>Riprova</button>}
                {i.status === 'uploading' && <span className="upload-bar"><span style={{ width: `${Math.round(i.progress * 100)}%` }} /></span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {scan.phase === 'running' && <p className="app-note"><LoaderCircle size={16} className="spin" /> Aggiorno la libreria...</p>}
      {scan.phase === 'error' && <p className="form-error">{scan.error}</p>}
      {scan.phase === 'done' && groups.length > 0 && (
        <section className="upload-summary">
          <h3>Aggiunti alla libreria</h3>
          {groups.map((g) => (
            <p key={`${g.artist}-${g.album}`}>
              <strong>{g.artist}</strong> · {g.album} <span className="muted-text">({g.count} {g.count === 1 ? 'brano' : 'brani'}{g.artistIsNew ? ', nuovo artista' : g.albumIsNew ? ', nuovo album' : ''})</span>
            </p>
          ))}
          <Link to="/library" className="pill-btn">Vai alla libreria</Link>
        </section>
      )}
    </div>
  );
};

export default Upload;
