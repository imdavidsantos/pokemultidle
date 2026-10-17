import React from 'react';
import { HUNT_SIM_URL } from '../../config';
import './HuntSim.css';

export default function HuntSim({ onClose }) {
  return (
    <div className="huntsim" role="dialog" aria-label="Simulador de hunt">
      <div className="huntsim__bar">
        <span className="huntsim__title">Hunt Simulator (Lotuzx)</span>
        <button className="huntsim__close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      <webview
        className="huntsim__view"
        src={HUNT_SIM_URL}
        partition="persist:pokemultidle-hunt"
      />
    </div>
  );
}
