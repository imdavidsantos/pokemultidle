import React, { useState } from 'react';

// Popover de configuração: liga/desliga a conta e reseta os dados do webview (com confirmação em 2 cliques)
export default function ConfigPanel({ onReset, onClose, slot, ligado, onTogglePower }) {
  const [confirmando, setConfirmando] = useState(false);
  const conta = 'Conta ' + slot;

  return (
    <div className="controls__popover controls__popover--col">
      {!confirmando ? (
        <button className="controls__btn" onClick={() => setConfirmando(true)}>
          Resetar dados do webview
        </button>
      ) : (
        <>
          <span className="controls__hint">Apaga cookies, login e cache desta conta. Continuar?</span>
          <div className="controls__group">
            <button
              className="controls__btn controls__btn--confirm"
              onClick={() => { onReset(); onClose(); }}
            >
              Sim, resetar
            </button>
            <button className="controls__btn" onClick={() => setConfirmando(false)}>Cancelar</button>
          </div>
        </>
      )}

      <button
        className={`controls__btn controls__power-btn`}
        onClick={onTogglePower}
        aria-pressed={ligado}
      >
        {ligado ? 'Desligar' : 'Ligar'}
      </button>

      <div className="controls__conta">{conta}</div>
    </div>
  );
}
