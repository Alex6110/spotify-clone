import { createContext, useContext } from 'react';

// Stato dell'interfaccia mobile condiviso tra layout, intestazione e barra in basso: menu laterale e menu "Crea".
export const MobileUiContext = createContext(null);
export const useMobileUi = () => useContext(MobileUiContext);
