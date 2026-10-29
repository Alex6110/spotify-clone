import React from 'react';
import { photoOf, PLACEHOLDER_COVER } from '../../lib/api';

const ArtistAvatar = ({ artist, size = 96 }) => (
  <img
    className="artist-avatar"
    src={photoOf(artist)}
    alt=""
    width={size}
    height={size}
    loading="lazy"
    onError={(e) => { if (!e.currentTarget.src.endsWith(PLACEHOLDER_COVER)) e.currentTarget.src = PLACEHOLDER_COVER; }}
  />
);

export default ArtistAvatar;
