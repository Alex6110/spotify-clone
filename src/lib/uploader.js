import { api, apiBase, readAuth } from './api';

export const AUDIO_EXT = ['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav'];
export const isAudioName = (name) => AUDIO_EXT.some((e) => name.toLowerCase().endsWith(e));
export const ACCEPT = AUDIO_EXT.join(',') + ',audio/*';

/** FileList (selezione dal telefono o dal computer) -> [{ file, dir }] con la cartella di provenienza, se c'è. */
export function fromFileList(list) {
  return Array.from(list).map((file) => {
    const rel = file.webkitRelativePath || '';
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    return { file, dir };
  });
}

/** Trascinamento sulla pagina: legge anche le cartelle, a qualsiasi profondità. */
export async function fromDrop(dataTransfer) {
  const items = Array.from(dataTransfer.items || []);
  const entries = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return fromFileList(dataTransfer.files || []);

  const out = [];
  const readAll = (reader) => new Promise((resolve, reject) => {
    const all = [];
    const next = () => reader.readEntries((batch) => { if (batch.length) { all.push(...batch); next(); } else resolve(all); }, reject);
    next();
  });
  const walk = async (entry, dir) => {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      out.push({ file, dir });
    } else if (entry.isDirectory) {
      const children = await readAll(entry.createReader());
      for (const c of children) await walk(c, dir ? `${dir}/${entry.name}` : entry.name);
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}

/** Carica un file con XHR (fetch non permette di vedere l'avanzamento dell'invio). */
export function uploadFile({ file, dir }, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ name: file.name });
    if (dir) params.set('dir', dir);
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${apiBase}/api/upload?${params}`);
    const token = readAuth()?.token;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* risposta non JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(Object.assign(new Error(body?.error || `Errore ${xhr.status}`), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error('Server non raggiungibile'));
    xhr.onabort = () => reject(Object.assign(new Error('Annullato'), { name: 'AbortError' }));
    if (signal) {
      if (signal.aborted) { reject(Object.assign(new Error('Annullato'), { name: 'AbortError' })); return; }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}

export const requestScan = () => api.post('/api/upload/scan').then((r) => r.data);
export const getScan = () => api.get('/api/upload/scan').then((r) => r.data);
