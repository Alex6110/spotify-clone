import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import Player from './Player';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import CreateMenu from './CreateMenu';
import { MobileUiContext } from '../../context/MobileUiContext';

// Pagine che disegnano da sole la propria intestazione (e il suo comportamento allo scorrimento)
const OWN_HEADER = new Set(['/search', '/library', '/create']);

const MobileLayout = ({ children }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { setCreateOpen(false); }, [pathname]);

  const ui = useMemo(() => ({
    openMenu: () => setIsSettingsOpen(true),
    createOpen,
    openCreate: () => setCreateOpen(true),
    toggleCreate: () => setCreateOpen((v) => !v),
  }), [createOpen]);

  return (
    <MobileUiContext.Provider value={ui}>
      {/* fuori dal contenitore a schermo intero: iOS lo considera un elemento a sé in cima alla pagina */}
      {createPortal(<div className="edge-band" aria-hidden="true" />, document.body)}
      <div className="mobile-shell">
        {/* copre la zona della barra di stato: il contenuto che scorre non ci passa sotto */}
        <div className="top-cover" aria-hidden="true" />
        <Sidebar isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

        <main className="main-content">
          {!OWN_HEADER.has(pathname) && <MobileHeader />}
          {children}
        </main>

        <CreateMenu open={createOpen} onClose={() => setCreateOpen(false)} />

        <div className="mobile-fixed-bottom">
          <Player isMobile={true} />
          <footer className="app-footer"><BottomNav /></footer>
        </div>
      </div>
    </MobileUiContext.Provider>
  );
};

export default MobileLayout;
