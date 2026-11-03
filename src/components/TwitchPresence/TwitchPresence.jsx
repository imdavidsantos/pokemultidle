import React from 'react';
import './TwitchPresence.css';

// Indicador pequeno: bolinha + texto do status. `onEntrar` (opcional) é chamado no botão que aparece
// quando falta o login da Twitch (por exemplo, para abrir o Lives da conta).
export default function TwitchPresence({ estado, onEntrar }) {
  const completo = estado.total > 0 && estado.entrados >= estado.total;
  const classe = estado.precisaLogin ? 'erro' : completo ? 'ok' : estado.entrados > 0 ? 'parcial' : 'espera';

  return (
    <div className={`twitchp twitchp--${classe}`} title={estado.status}>
      <span className="twitchp__ponto" aria-hidden="true" />
      <span className="twitchp__texto">
        {estado.total > 0 && estado.entrados > 0 ? `Twitch ${estado.entrados}/${estado.total}` : `Twitch: ${estado.status}`}
      </span>
      {estado.precisaLogin && onEntrar && (
        <button className="twitchp__btn" onClick={onEntrar}>Entrar</button>
      )}
    </div>
  );
}
