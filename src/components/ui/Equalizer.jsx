import React from 'react';

// Indicatore "sta suonando": tre barre animate (sostituisce l'emoji dell'altoparlante)
const Equalizer = ({ playing = true }) => (
  <span className={`eq ${playing ? 'is-playing' : ''}`} aria-label="In riproduzione" role="img">
    <i /><i /><i />
  </span>
);

export default Equalizer;
