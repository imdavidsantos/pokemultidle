import React, { useEffect, useRef, useState } from 'react';
import './SettingsMenu.css';
import { MESSAGES } from '../../constants/messages';
import { GearIcon } from '../../assets/icons/GearIcon';

export default function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const ref = useRef(null);

  // Fecha ao clicar fora, apertar Esc ou clicar dentro de um jogo (webview)
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [open]);

  const checkUpdates = async () => {
    const api = window.pokemultidle?.checkForUpdates;
    if (!api) {
      setMessage(MESSAGES.unavailable);
      return;
    }
    setChecking(true);
    setMessage('');
    try {
      const result = await api();
      if (result.status === 'available') {
        setMessage(`Nova versão ${result.version} encontrada.`);
      } else if (result.status === 'error') {
        setMessage(`${MESSAGES.error} (${result.message})`);
      } else {
        setMessage(MESSAGES[result.status] ?? MESSAGES.error);
      }
    } catch (err) {
      console.error('updater:check falhou:', err);
      setMessage(`${MESSAGES.error} (${err.message})`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="settings" ref={ref}>
      <button
        className={`settings__btn ${open ? 'is-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Configurações"
        title="Configurações"
      >
        <GearIcon />
      </button>

      {open && (
        <div className="settings__menu" role="menu">
          <button className="settings__item" role="menuitem" onClick={checkUpdates} disabled={checking}>
            {checking ? 'Verificando…' : 'Verificar atualizações'}
          </button>
          {message && <div className="settings__msg" role="status">{message}</div>}
        </div>
      )}
    </div>
  );
}
