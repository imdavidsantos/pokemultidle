import React from 'react';

export default function PaneActions({ focused, canRemove, onReload, onToggleFocus, onRemove }) {
  return (
    <>
      <button className="controls__btn" onClick={onReload} title="Recarregar página (F5)">⟳</button>
      <button className={`controls__btn ${focused ? 'is-on' : ''}`} onClick={onToggleFocus} title={focused ? 'Voltar para todas' : 'Focar nesta tela'}>
        {focused ? '⤡' : '⤢'}
      </button>
      <button className="controls__btn controls__btn--danger" onClick={onRemove} disabled={!canRemove} title={canRemove ? 'Remover tela' : 'Mantenha ao menos 1 tela'}>
        ✕
      </button>
    </>
  );
}
