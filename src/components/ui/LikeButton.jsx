import React from 'react';
import { Heart } from 'lucide-react';
import { useLiked, toggleLike } from '../../lib/likes';

const LikeButton = ({ track, size = 18, className = '' }) => {
  const liked = useLiked(track);
  if (!track) return null;
  return (
    <button
      type="button"
      className={`like-btn ${liked ? 'is-liked' : ''} ${className}`}
      aria-label={liked ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
      aria-pressed={liked}
      onClick={(e) => { e.stopPropagation(); toggleLike(track, liked); }}
    >
      <Heart size={size} fill={liked ? 'currentColor' : 'none'} />
    </button>
  );
};

export default LikeButton;
