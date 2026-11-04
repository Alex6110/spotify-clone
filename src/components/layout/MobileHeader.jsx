import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMobileUi } from '../../context/MobileUiContext';
import { APP_NAME } from '../../lib/config';

const TITLES = { '/search': 'Cerca', '/library': 'La tua libreria' };
const BIG = new Set(['/search', '/library']);

/**
 * Intestazione mobile: iniziale dell'utente (apre il menu) + titolo + azioni.
 * Con `sticky` resta fissa in alto e il contenuto le scorre sotto; sul desktop non appare.
 */
const MobileHeader = ({ title, sticky = true, children }) => {
  const ui = useMobileUi();
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!ui) return null;
  const text = title ?? TITLES[pathname] ?? APP_NAME;
  return (
    <header className={`m-header${sticky ? ' is-sticky' : ''}${BIG.has(pathname) ? ' is-big' : ''}`}>
      <button type="button" className="user-avatar" onClick={ui.openMenu} aria-label="Apri il menu">
        {(user?.name || '?').charAt(0).toUpperCase()}
      </button>
      <span className="m-header-title">{text}</span>
      {children && <div className="m-header-actions">{children}</div>}
    </header>
  );
};

export default MobileHeader;
