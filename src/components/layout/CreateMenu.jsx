import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ListMusic, Upload } from 'lucide-react';

const ITEMS = [
  { to: '/create', icon: ListMusic, title: 'Playlist', text: 'Crea una playlist con i tuoi brani' },
  { to: '/upload', icon: Upload, title: 'Carica musica', text: 'Aggiungi file alla libreria' },
];

// Menu a comparsa del tasto "Crea" (in basso, sopra la barra di navigazione).
const CreateMenu = ({ open, onClose }) => {
  const navigate = useNavigate();
  const go = (to) => { onClose(); navigate(to); };
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bd" className="create-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose} />
          <motion.div
            key="menu" className="create-menu" role="menu"
            initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            {ITEMS.map(({ to, icon: Icon, title, text }) => (
              <button key={to} type="button" role="menuitem" className="create-item" onClick={() => go(to)}>
                <span className="create-ico"><Icon size={24} /></span>
                <span className="create-item-text"><strong>{title}</strong><small>{text}</small></span>
              </button>
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CreateMenu;
