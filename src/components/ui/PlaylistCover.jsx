import React from 'react';
import { ListMusic } from 'lucide-react';
import { coverOf } from '../../lib/api';

/** Mosaico 2x2 con le copertine dei primi brani; con una sola copertina la mostra intera. */
const PlaylistCover = ({ covers = [], className = '' }) => {
  const list = covers.filter(Boolean);
  if (list.length === 0) {
    return <div className={`pl-cover pl-cover-empty ${className}`}><ListMusic size="40%" /></div>;
  }
  if (list.length < 4) {
    return <div className={`pl-cover ${className}`}><img src={coverOf({ cover: list[0] })} alt="" loading="lazy" /></div>;
  }
  return (
    <div className={`pl-cover pl-cover-grid ${className}`}>
      {list.slice(0, 4).map((c) => <img key={c} src={coverOf({ cover: c })} alt="" loading="lazy" />)}
    </div>
  );
};

export default PlaylistCover;
