import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Search, Library, PlusSquare } from 'lucide-react';

const BottomNav = () => {
  return (
    <nav className="bottom-nav">
      <NavLink to="/" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
        <Home size={24} />
        <span>Home</span>
      </NavLink>
      <NavLink to="/search" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
        <Search size={24} />
        <span>Cerca</span>
      </NavLink>
      <NavLink to="/library" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
        <Library size={24} />
        <span>La tua libreria</span>
      </NavLink>
      <NavLink to="/create" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
        <PlusSquare size={24} />
        <span>Crea</span>
      </NavLink>
    </nav>
  );
};

export default BottomNav;