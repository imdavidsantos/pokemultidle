import React from 'react';
import IconeExpandir from '../../../assets/icons/IconeExpandir';
import IconeReduzir from '../../../assets/icons/IconeReduzir';

export default function PaneActions({ focused, canRemove, onReload, onToggleFocus, onRemove }) {
  const tituloFoco = focused ? 'Voltar para todas as telas' : 'Tela cheia (focar nesta conta)';

  return (
    <>
      <button className="controls__btn" onClick={onReload} title="Recarregar página (F5)">⟳</button>
      <button
        className={`controls__btn ${focused ? 'is-on' : ''}`}
        onClick={onToggleFocus}
        title={tituloFoco}
        aria-label={tituloFoco}
        aria-pressed={!!focused}
      >
        {focused ? <IconeReduzir /> : <IconeExpandir />}
      </button>
      <button className="controls__btn controls__btn--danger" onClick={onRemove} disabled={!canRemove} title={canRemove ? 'Remover tela' : 'Mantenha ao menos 1 tela'}>
        ✕
      </button>
    </>
  );
}
