import React, { useState } from 'react';
import Player from './Player';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { APP_NAME } from '../../lib/config';

const MobileLayout = ({ children }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="mobile-shell">
      <Sidebar isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <header className="app-header">
        <button type="button" className="user-avatar" onClick={() => setIsSettingsOpen(true)} aria-label="Apri impostazioni">
          {(user?.name || '?').charAt(0).toUpperCase()}
        </button>
        <span className="page-title">{APP_NAME}</span>
      </header>

      <main className="main-content">{children}</main>

      <div className="mobile-fixed-bottom">
        <Player isMobile={true} />
        <footer className="app-footer"><BottomNav /></footer>
      </div>
    </div>
  );
};

export default MobileLayout;
