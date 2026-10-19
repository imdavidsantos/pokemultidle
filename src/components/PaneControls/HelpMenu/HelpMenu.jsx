import React, { useEffect, useRef, useState } from 'react';
import { PokeHelpIcon } from '../../../assets/icons/PokeHelpIcon';
import useMediaQuery from '../../../hooks/useMediaQuery';
import { WIDE_QUERY } from '../../../config';
import './HelpMenu.css';

/**
 * actions: [{ id, label, icon, onClick }]
 * Janela larga: as opções abrem na própria barra de controle.
 * Janela estreita: abrem numa aba embaixo do botão.
 */
export default function HelpMenu({ actions }) {
  const wide = useMediaQuery(WIDE_QUERY);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);



  // A aba embaixo do botão fecha ao clicar fora, apertar Esc ou clicar no jogo
  useEffect(() => {
    if (!open || wide) return undefined;
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
  }, [open, wide]);

  const items = actions.map((a) => (
    <button
      key={a.id}
      className="help__action"
      role="menuitem"
      onClick={a.onClick}
      title={wide ? a.label : undefined}
      aria-label={a.label}
    >
      <span className="help__icon" aria-hidden="true">{a.icon}</span>
      {!wide && <span>{a.label}</span>}
    </button>
  ));

  return (
    <div className="help" ref={ref}>
      {open && (wide
        ? <div className="help__inline" role="menu">{items}</div>
        : <div className="help__popover" role="menu">{items}</div>)}
      <button
        className={`controls__btn ${open ? 'is-on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Ajuda"
        title="Ajuda e atalhos"
      >
        <PokeHelpIcon />
      </button>

    </div>
  );
}
