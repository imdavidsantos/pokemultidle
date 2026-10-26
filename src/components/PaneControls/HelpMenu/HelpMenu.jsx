import React, { useCallback, useRef, useState } from 'react';
import { PokeHelpIcon } from '../../../assets/icons/PokeHelpIcon';
import useMediaQuery from '../../../hooks/useMediaQuery';
import useDismiss from '../../../hooks/useDismiss';
import useFixados, { MAX_FIXADOS, salvarFixados } from '../../../hooks/useFixados';
import { WIDE_QUERY } from '../../../config';
import './HelpMenu.css';

/**
 * actions: [{ id, label, icon, onClick, fechaMenu? }]
 * Janela larga: até 3 ícones fixos na barra; o botão abre o menu completo (e os ícones somem).
 * Janela estreita: só o botão; o menu completo abre embaixo dele.
 */
export default function HelpMenu({ actions }) {
  const wide = useMediaQuery(WIDE_QUERY);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('lista');   // 'lista' | 'config'
  const ref = useRef(null);
  const salvos = useFixados();

  const fechar = useCallback(() => { setOpen(false); setView('lista'); }, []);
  useDismiss(ref, open, fechar);

  // Quais ações ficam como ícone na barra (máx. 3). Sem escolha salva, as 3 primeiras.
  const ids = (salvos ?? actions.map((a) => a.id))
    .filter((id) => actions.some((a) => a.id === id))
    .slice(0, MAX_FIXADOS);
  const fixados = actions.filter((a) => ids.includes(a.id));

  const alternar = (id) => {
    salvarFixados(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  };

  const executar = (a) => {
    a.onClick();
    if (a.fechaMenu) fechar();   // ações que abrem outro painel fecham o menu para não sobrepor
  };

  return (
    <div className="help" ref={ref}>
      {wide && !open && (
        <div className="help__inline">
          {fixados.map((a) => (
            <button key={a.id} className="help__action" onClick={() => a.onClick()} title={a.label} aria-label={a.label}>
              <span className="help__icon" aria-hidden="true">{a.icon}</span>
            </button>
          ))}
        </div>
      )}

      <button
        className={`controls__btn ${open ? 'is-on' : ''}`}
        onClick={() => (open ? fechar() : setOpen(true))}
        aria-expanded={open}
        aria-label="Ajuda"
        title="Ajuda e atalhos"
      >
        <PokeHelpIcon />
      </button>

      {open && (
        <div className="help__popover" role="menu">
          {view === 'lista' ? (
            <>
              {actions.map((a) => (
                <button key={a.id} className="help__action" role="menuitem" onClick={() => executar(a)}>
                  <span className="help__icon" aria-hidden="true">{a.icon}</span>
                  <span>{a.label}</span>
                </button>
              ))}
              <hr className="help__sep" />
              <button className="help__action" role="menuitem" onClick={() => setView('config')}>
                <span className="help__icon" aria-hidden="true">⚙</span>
                <span>Ícones do painel</span>
              </button>
            </>
          ) : (
            <>
              <div className="help__cfg-titulo">Ícones no painel ({ids.length}/{MAX_FIXADOS})</div>
              <div className="help__cfg-dica">Ficam sempre na barra quando a janela é larga.</div>
              {actions.map((a) => {
                const marcado = ids.includes(a.id);
                const bloqueado = !marcado && ids.length >= MAX_FIXADOS;
                return (
                  <label key={a.id} className={`help__cfg-linha ${bloqueado ? 'is-off' : ''}`}>
                    <input type="checkbox" checked={marcado} disabled={bloqueado} onChange={() => alternar(a.id)} />
                    <span className="help__icon" aria-hidden="true">{a.icon}</span>
                    <span>{a.label}</span>
                  </label>
                );
              })}
              <hr className="help__sep" />
              <button className="help__action" onClick={() => setView('lista')}>← Voltar</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}