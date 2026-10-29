import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, TriangleAlert } from 'lucide-react';

const ToastContext = createContext({ toast: () => {} });
export const useToast = () => useContext(ToastContext).toast;

export const ToastProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);

  const toast = useCallback((message, kind = 'ok') => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-2), { id, message, kind }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2800);
  }, []);

  // anche il codice fuori da React (es. il player) può mostrare un avviso con notify() di lib/api.js
  useEffect(() => {
    const onToast = (e) => toast(e.detail?.message || '', e.detail?.kind);
    window.addEventListener('app:toast', onToast);
    return () => window.removeEventListener('app:toast', onToast);
  }, [toast]);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-stack" role="status" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast ${t.kind === 'error' ? 'is-error' : ''}`}>
              {t.kind === 'error' ? <TriangleAlert size={16} /> : <Check size={16} />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
};
