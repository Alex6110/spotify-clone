import React, { useState, useEffect, useCallback, useContext } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Home, Search as SearchIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PlayerContext } from '../../context/PlayerContext';
import Player from './Player';
import Sidebar from './Sidebar';
import { RightSidebar } from './RightSidebar';
import LibraryPanel from './LibraryPanel';

const DesktopLayout = ({ children }) => {
  const { isRightSidebarOpen, currentSong } = useContext(PlayerContext);
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(320);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const searchValue = location.pathname === '/search' ? params.get('q') || '' : '';

  const startResizingLeft = () => setIsResizingLeft(true);
  const startResizingRight = () => setIsResizingRight(true);
  const stopResizing = useCallback(() => {
    setIsResizingLeft(false);
    setIsResizingRight(false);
  }, []);

  const resize = useCallback((e) => {
    if (isResizingLeft) {
      const newWidth = e.clientX;
      if (newWidth > 220 && newWidth < 480) setLeftWidth(newWidth);
    }
    if (isResizingRight) {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 260 && newWidth < 480) setRightWidth(newWidth);
    }
  }, [isResizingLeft, isResizingRight]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  return (
    <div className="desktop-shell">
      <Sidebar isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      
      <header className="desktop-topbar">
        <div className="topbar-left">
          <button type="button" className="user-avatar" style={{ marginRight: '20px' }} onClick={() => setIsSettingsOpen(true)} aria-label="Apri impostazioni">
            {(user?.name || '?').charAt(0).toUpperCase()}
          </button>
        </div>

        <div className="topbar-center">
          <NavLink to="/" end className="topbar-icon-link" aria-label="Home"><Home size={20} /></NavLink>
          <div className="search-wrap">
            <SearchIcon size={16} />
            <input
              type="search"
              placeholder="Cosa vuoi ascoltare?"
              className="search-input"
              value={searchValue}
              onChange={(e) => navigate(e.target.value ? `/search?q=${encodeURIComponent(e.target.value)}` : '/search', { replace: location.pathname === '/search' })}
            />
          </div>
        </div>
        <div className="topbar-right"><div style={{ width: '40px' }}></div></div>
      </header>

      <div className="desktop-main-area">
        <aside className="desktop-sidebar-left" style={{ width: `${leftWidth}px` }}>
          <LibraryPanel />
        </aside>

        <div className="resizer" onMouseDown={startResizingLeft} />

        <main className="desktop-center-view">
          <div className="main-content">
            {children}
          </div>
        </main>

        {isRightSidebarOpen && (
          <>
            <div className="resizer" onMouseDown={startResizingRight} />
            
            <RightSidebar rightWidth={rightWidth} currentSong={currentSong} /> 
          </>
        )}
      </div>

      <footer className="desktop-player-fixed">
        <Player isMobile={false} />
      </footer>
    </div>
  );
};

export default DesktopLayout;