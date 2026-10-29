import React, { useContext } from 'react';
import { X, LogOut, Check } from 'lucide-react';
import { ThemeContext, RADIUS_OPTIONS, ACCENT_PRESETS } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import AppSection from './AppSection';
import './Sidebar.css';

const Sidebar = ({ isOpen, onClose }) => {
  const { themePrefs, updateTheme } = useContext(ThemeContext);
  const { user, logout } = useAuth();

  const handleLogout = () => {
    onClose();
    logout(); // il cambio di utente smonta player e socket: niente reload della pagina
  };

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside className={`sidebar-menu ${isOpen ? 'open' : ''}`} aria-hidden={!isOpen} aria-label="Impostazioni">
        <div className="sidebar-header">
          <h2>Impostazioni</h2>
          <button type="button" onClick={onClose} className="close-btn" aria-label="Chiudi"><X size={22} /></button>
        </div>

        <div className="sidebar-content">
          <section className="setting-section">
            <h4>Account</h4>
            <p className="account-line"><strong>{user?.name}</strong><br /><span>{user?.email}</span></p>
          </section>

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

          <AppSection onNavigate={onClose} />

          <section className="logout-section">
            <button type="button" onClick={handleLogout} className="logout-btn"><LogOut size={16} /> Esci dall'account</button>
          </section>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
