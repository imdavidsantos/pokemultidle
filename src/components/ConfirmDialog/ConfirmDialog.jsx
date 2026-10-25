import React, { useEffect, useRef } from 'react';
import './ConfirmDialog.css';

// Janela de confirmação centralizada sobre a área do jogo (precisa estar dentro de um elemento com position: relative).
export default function ConfirmDialog({
  titulo, children, onCancel, onConfirm,
  cancelar = 'Cancelar', confirmar = 'Confirmar', ocupado = false, ocupadoTexto = 'Aguarde…',
}) {
  const cancelRef = useRef(null);

  // o foco começa no Cancelar, para um Enter sem querer não confirmar
  useEffect(() => { cancelRef.current?.focus(); }, []);

  return (
    <div
      className="confirm"
      role="alertdialog"
      aria-modal="true"
      aria-label={titulo}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !ocupado) onCancel(); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); if (!ocupado) onCancel(); }   // não sai do modo foco junto
      }}
    >
      <div className="confirm__card">
        <h3 className="confirm__titulo">{titulo}</h3>
        <div className="confirm__texto">{children}</div>
        <div className="confirm__acoes">
          <button ref={cancelRef} className="confirm__btn" onClick={onCancel} disabled={ocupado}>{cancelar}</button>
          {onConfirm && (
            <button className="confirm__btn confirm__btn--primary" onClick={onConfirm} disabled={ocupado}>
              {ocupado ? ocupadoTexto : confirmar}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
