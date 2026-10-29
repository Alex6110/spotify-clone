import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const EVENT = 'playlists:changed';
export const notifyPlaylistsChanged = () => window.dispatchEvent(new Event(EVENT));

export async function createPlaylist(name, trackIds = []) {
  const { data } = await api.post('/api/playlists', { name, trackIds });
  notifyPlaylistsChanged();
  return data;
}

export async function addTracksToPlaylist(playlistId, trackIds) {
  await api.post(`/api/playlists/${playlistId}/tracks`, { trackIds });
  notifyPlaylistsChanged();
}

export async function removeFromPlaylist(playlistId, position) {
  await api.delete(`/api/playlists/${playlistId}/tracks/${position}`);
  notifyPlaylistsChanged();
}

export async function renamePlaylist(playlistId, name) {
  const { data } = await api.patch(`/api/playlists/${playlistId}`, { name });
  notifyPlaylistsChanged();
  return data;
}

export async function deletePlaylist(playlistId) {
  await api.delete(`/api/playlists/${playlistId}`);
  notifyPlaylistsChanged();
}

/** Elenco delle playlist dell'utente, aggiornato da solo quando qualcosa cambia (creazione, aggiunte, rimozioni). */
export function usePlaylists() {
  const [items, setItems] = useState(null);
  const load = useCallback(() => {
    api.get('/api/playlists').then(({ data }) => setItems(data.items)).catch(() => setItems((prev) => prev ?? []));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(EVENT, load);
    return () => window.removeEventListener(EVENT, load);
  }, [load]);
  return { playlists: items, reload: load };
}
