import React, { useContext } from 'react';
import { PlayerContext } from '../../context/PlayerContext';
import { coverOf, formatDuration, isPlayable } from '../../lib/api';
import LikeButton from './LikeButton';
import { TrackMenuButton } from './TrackMenu';
import Equalizer from './Equalizer';

/** Elenco di brani con copertina (playlist, preferiti). `onRemove(track, index)` abilita la voce di rimozione nel menu. */
const TrackList = ({ tracks, onRemove, removeLabel }) => {
  const { playSong, currentSong, isPlaying } = useContext(PlayerContext);
  return (
    <div className="track-list">
      {tracks.map((t, i) => {
        const isCurrent = currentSong?.id === t.id;
        return (
          <div key={`${t.id}-${t.position ?? i}`} className={`track-row ${isCurrent ? 'active-song' : ''} ${isPlayable(t) ? '' : 'is-broken'}`} onClick={() => playSong(t, tracks)}>
            <div className="track-row-cover">
              <img src={coverOf(t)} alt="" loading="lazy" />
              {isCurrent && <span className="track-row-eq"><Equalizer playing={isPlaying} /></span>}
            </div>
            <div className="track-row-text">
              <span className="song-name">{t.title}</span>
              <span className="song-sub">{isPlayable(t) ? `${t.artist} · ${t.album}` : 'File danneggiato o incompleto'}</span>
            </div>
            <LikeButton track={t} size={16} />
            <span className="song-duration">{formatDuration(t.durationMs)}</span>
            <TrackMenuButton track={t} onRemove={onRemove ? () => onRemove(t, i) : undefined} removeLabel={removeLabel} size={18} />
          </div>
        );
      })}
    </div>
  );
};

export default TrackList;
