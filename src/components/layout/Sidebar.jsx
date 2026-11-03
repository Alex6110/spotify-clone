import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Check, Clock, Upload, ArrowDownToLine, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { ThemeContext, RADIUS_OPTIONS, ACCENT_PRESETS } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { isOfflineSupported, useOfflineIds } from '../../lib/offline';
import AppSection from './AppSection';
import './Sidebar.css';

// Menu laterale in stile Spotify: scheda del profilo in alto, poi le voci; le impostazioni stanno in una sottopagina.
const Sidebar = ({ isOpen, onClose }) => {
  const { themePrefs, updateTheme } = useContext(ThemeContext);
  const { user, logout } = useAuth();
  const offlineIds = useOfflineIds();
  const [view, setView] = useState('menu'); // menu | settings

  useEffect(() => { if (!isOpen) { const t = setTimeout(() => setView('menu'), 350); return () => clearTimeout(t); } return undefined; }, [isOpen]);

  // chiusura con trascinamento verso sinistra (o toccando fuori dal menu)
  const [dragX, setDragX] = useState(null);
  const g = useRef(null);
  const onTouchStart = (e) => { const t = e.touches[0]; g.current = { x: t.clientX, y: t.clientY, axis: null }; };
  const onTouchMove = (e) => {
    const s = g.current;
    if (!s) return;
    const dx = e.touches[0].clientX - s.x;
    const dy = e.touches[0].clientY - s.y;
    if (!s.axis && Math.hypot(dx, dy) > 8) s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (s.axis === 'x') setDragX(Math.min(0, dx));
  };
  const onTouchEnd = (e) => {
    const s = g.current;
    g.current = null;
    if (s?.axis !== 'x') return;
    const dx = e.changedTouches[0].clientX - s.x;
    setDragX(null);
    if (dx < -70) onClose();
  };

  const handleLogout = () => {
    onClose();
    logout(); // il cambio di utente smonta player e socket: niente reload della pagina
  };
  const initial = (user?.name || '?').charAt(0).toUpperCase();

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} aria-hidden="true" />}
      <aside
        className={`sidebar-menu ${isOpen ? 'open' : ''}`}
        aria-hidden={!isOpen}
        aria-label="Menu"
        style={dragX !== null ? { transform: `translateX(${dragX}px)`, transition: 'none' } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => { g.current = null; setDragX(null); }}
      >
        {view === 'menu' ? (
          <>
            <div className="sidebar-top">
              <div className="profile-card">
                <span className="profile-avatar" aria-hidden="true">{initial}</span>
                <span className="profile-text"><strong>{user?.name}</strong><small>{user?.email}</small></span>
              </div>
            </div>

            <nav className="menu-list">
              <Link to="/recents" className="menu-item" onClick={onClose}><Clock size={24} /><span>Recenti</span></Link>
              <Link to="/upload" className="menu-item" onClick={onClose}><Upload size={24} /><span>Carica musica</span></Link>
              {isOfflineSupported() && (
                <Link to="/offline" className="menu-item" onClick={onClose}>
                  <ArrowDownToLine size={24} /><span>Scaricati<small>{offlineIds.size} brani</small></span>
                </Link>
              )}
              <button type="button" className="menu-item" onClick={() => setView('settings')}>
                <Settings size={24} /><span>Impostazioni e privacy</span><ChevronRight size={20} className="menu-chevron" />
              </button>
            </nav>

            <section className="logout-section">
              <button type="button" onClick={handleLogout} className="logout-btn"><LogOut size={16} /> Esci dall'account</button>
            </section>
          </>
        ) : (
          <>
            <div className="sidebar-header">
              <button type="button" onClick={() => setView('menu')} className="close-btn" aria-label="Indietro"><ChevronLeft size={24} /></button>
              <h2>Impostazioni e privacy</h2>
            </div>

            <div className="sidebar-content">
              <section className="setting-section">
                <h4>Colore principale</h4>
                <div className="color-picker">
                  {ACCENT_PRESETS.map((color) => {
                    const active = themePrefs.accent.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        type="button"
                        key={color}
                        className={`color-circle ${active ? 'active' : ''}`}
                        style={{ backgroundColor: color }}
                        aria-label={`Colore ${color}`}
                        aria-pressed={active}
                        onClick={() => updateTheme({ accent: color })}
                      >
                        {active && <Check size={18} color="#000" />}
                      </button>
                    );
                  })}
                  <label className="color-custom" title="Colore personalizzato">
                    <input type="color" value={themePrefs.accent} onChange={(e) => updateTheme({ accent: e.target.value })} aria-label="Colore personalizzato" />
                  </label>
                </div>
              </section>

              <section className="setting-section">
                <h4>Forma di copertine e contenitori</h4>
                <div className="shape-picker">
                  {Object.entries(RADIUS_OPTIONS).map(([key, opt]) => (
                    <button
                      type="button"
                      key={key}
                      className={themePrefs.radius === key ? 'active' : ''}
                      aria-pressed={themePrefs.radius === key}
                      onClick={() => updateTheme({ radius: key })}
                    >
                      <span className="shape-preview" style={{ borderRadius: opt.container }} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </section>

              <AppSection onNavigate={onClose} hideLinks />
            </div>
          </>
        )}
      </aside>
    </>
  );
};

export default Sidebar;
