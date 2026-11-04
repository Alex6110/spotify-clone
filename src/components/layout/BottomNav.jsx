import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, Library, Plus } from 'lucide-react';
import { useMobileUi } from '../../context/MobileUiContext';

const BottomNav = () => {
  const ui = useMobileUi();
  const { pathname } = useLocation();
  const open = !!ui?.createOpen;
  const cls = ({ isActive }) => (isActive ? 'nav-item active' : 'nav-item');
  return (
    <nav className="bottom-nav">
      <NavLink to="/" className={cls}><Home size={24} /><span>Home</span></NavLink>
      <NavLink to="/search" className={cls}><Search size={24} /><span>Cerca</span></NavLink>
      <NavLink to="/library" className={cls}><Library size={24} /><span>La tua libreria</span></NavLink>
      <button
        type="button"
        className={`nav-item nav-create${open ? ' is-open' : ''}${!open && pathname === '/create' ? ' active' : ''}`}
        onClick={() => ui?.toggleCreate()}
        aria-expanded={open}
        aria-label={open ? 'Chiudi il menu' : 'Crea'}
      >
        <span className="nav-create-icon"><Plus size={open ? 30 : 26} /></span>
        <span className="nav-create-label">Crea</span>
      </button>
    </nav>
  );
};

export default BottomNav;
