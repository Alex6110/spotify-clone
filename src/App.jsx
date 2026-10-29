import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';

import './styles/global.css';
import './styles/ui.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { PlayerProvider } from './context/PlayerContext';

import MobileLayout from './components/layout/MobileLayout';
import DesktopLayout from './components/layout/DesktopLayout';
import { ToastProvider } from './context/ToastContext';
import { TrackMenuProvider } from './components/ui/TrackMenu';

import Home from './pages/Home';
import Register from './pages/Register';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import AlbumDetail from './pages/AlbumDetail';
import ArtistDetail from './pages/ArtistDetail';
import Library from './pages/Library';
import Search from './pages/Search';
import PlaylistDetail from './pages/PlaylistDetail';
import LikedSongs from './pages/LikedSongs';
import CreatePlaylist from './pages/CreatePlaylist';
import Offline from './pages/Offline';
import Upload from './pages/Upload';

function useWindowSize() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return width;
}

// Solo utenti autenticati; chi non ha completato l'onboarding viene mandato lì.
const ProtectedRoute = () => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

// Login e registrazione: se sei già dentro vai alla home.
const PublicOnlyRoute = () => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/" replace /> : <div className="auth-container"><Outlet /></div>;
};

const HomeOrOnboarding = () => {
  const { user } = useAuth();
  return user?.onboarded ? <Home /> : <Onboarding />;
};

const AppShell = () => {
  const isMobile = useWindowSize() <= 768;
  const Layout = isMobile ? MobileLayout : DesktopLayout;
  return <Layout><Outlet /></Layout>;
};

// Player e tema dipendono dall'utente: cambiando utente vengono ricreati da zero (niente reload della pagina).
const UserScope = ({ children }) => {
  const { user } = useAuth();
  return (
    <PlayerProvider key={user?.id ?? 'anonimo'}>
      <ThemeProvider><ToastProvider>{children}</ToastProvider></ThemeProvider>
    </PlayerProvider>
  );
};

function App() {
  return (
    <AuthProvider>
      <UserScope>
        <Router>
          <TrackMenuProvider>
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<HomeOrOnboarding />} />
                <Route path="/search" element={<Search />} />
                <Route path="/library" element={<Library />} />
                <Route path="/album/:id" element={<AlbumDetail />} />
                <Route path="/artist/:id" element={<ArtistDetail />} />
                <Route path="/create" element={<CreatePlaylist />} />
                <Route path="/playlist/:id" element={<PlaylistDetail />} />
                <Route path="/liked" element={<LikedSongs />} />
                <Route path="/offline" element={<Offline />} />
                <Route path="/upload" element={<Upload />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </TrackMenuProvider>
        </Router>
      </UserScope>
    </AuthProvider>
  );
}

export default App;
