import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Share, SquarePlus, Smartphone, ArrowDownToLine, TriangleAlert, Upload } from 'lucide-react';
import { canPromptInstall, isIos, isSecure, isStandalone, onInstallChange, promptInstall } from '../../lib/pwa';
import { formatBytes, isOfflineSupported, requestPersistence, storageInfo, useOfflineIds } from '../../lib/offline';

// Sezione "App e offline" delle impostazioni: installazione come app e spazio usato dai download.
const AppSection = ({ onNavigate }) => {
  const canInstall = useSyncExternalStore(onInstallChange, canPromptInstall);
  const ids = useOfflineIds();
  const [info, setInfo] = useState(null);

  useEffect(() => { if (isOfflineSupported()) storageInfo().then(setInfo); }, [ids]);

  const standalone = isStandalone();

  return (
    <section className="setting-section">
      <h4>App e offline</h4>

      {!isSecure() && (
        <p className="app-note is-warn"><TriangleAlert size={16} /> Questa pagina non è in HTTPS: l'installazione e i download offline non sono disponibili. Vedi la guida nel README (Tailscale).</p>
      )}

      {isSecure() && standalone && <p className="app-note"><Smartphone size={16} /> Stai usando Musica come app installata.</p>}

      {isSecure() && !standalone && canInstall && (
        <button type="button" className="pill-btn" onClick={promptInstall}><Smartphone size={16} /> Installa l'app</button>
      )}

      {isSecure() && !standalone && !canInstall && isIos() && (
        <ol className="install-steps">
          <li>Apri questa pagina in <strong>Safari</strong>.</li>
          <li>Tocca <Share size={15} className="inline-icon" /> <strong>Condividi</strong>.</li>
          <li>Scegli <SquarePlus size={15} className="inline-icon" /> <strong>Aggiungi alla schermata Home</strong>.</li>
        </ol>
      )}

      {isSecure() && !standalone && !canInstall && !isIos() && (
        <p className="app-note">Dal menu del browser scegli "Installa app" o "Aggiungi alla schermata Home".</p>
      )}

      <Link to="/upload" className="app-link" onClick={onNavigate}>
        <Upload size={18} />
        <span><strong>Carica musica</strong><small>Aggiungi brani o album alla libreria</small></span>
      </Link>

      {isOfflineSupported() && (
        <>
          <Link to="/offline" className="app-link" onClick={onNavigate}>
            <ArrowDownToLine size={18} />
            <span><strong>Scaricati</strong><small>{ids.size} brani{info?.usage != null ? ` · ${formatBytes(info.usage)} usati` : ''}</small></span>
          </Link>
          {info && !info.persisted && ids.size > 0 && (
            <button type="button" className="pill-btn" onClick={async () => { await requestPersistence(); setInfo(await storageInfo()); }}>Proteggi i download dalla pulizia automatica</button>
          )}
        </>
      )}
    </section>
  );
};

export default AppSection;
