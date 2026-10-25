import React, { useState } from 'react';
import { IMG } from '../../../utils/rmt/config';
import './RmtPanel.css';

const OPCOES = [
  { tipo: 'item', label: 'Um item', img: IMG.item },
  { tipo: 'pokemon', label: 'Um pokemon', img: IMG.pokemon },
  { tipo: 'diamante', label: 'Diamantes', img: IMG.diamante },
];

export default function RmtPanel({ onChoose, onClose }) {
  const [ocupado, setOcupado] = useState(null);   // tipo em andamento
  const [erro, setErro] = useState('');

  const escolher = async (tipo) => {
    setErro('');
    setOcupado(tipo);
    try {
      await onChoose(tipo);
      onClose();   // o jogo já está na página escolhida
    } catch (err) {
      console.warn('Falha ao abrir o anúncio:', err);
      setErro(err?.message || 'Não foi possível abrir a tela do anúncio.');
      setOcupado(null);
    }
  };

  return (
    <div className="rmt" role="dialog" aria-label="Vender no market RMT">
      <div className="rmt__bar">
        <span>Vender no market RMT</span>
        <button className="rmt__close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="rmt__opcoes">
        {OPCOES.map((o) => (
          <button key={o.tipo} className="rmt__opcao" onClick={() => escolher(o.tipo)} disabled={ocupado !== null}>
            <img src={o.img} alt="" width="38" height="38" draggable={false} />
            <span>{ocupado === o.tipo ? 'Abrindo…' : o.label}</span>
          </button>
        ))}
      </div>

      {erro && <p className="rmt__erro">{erro}</p>}
    </div>
  );
}
