import React from 'react';
import { INFINITO } from '../../sniperStore';

// Patch para ligar/desligar "sem limite" numa regra (item, pokémon ou global).
// maxQtd vira um número enorme porque Infinity não sobrevive ao JSON.
export const patchInfinito = (ligar) => (
  ligar ? { infinito: true, maxQtd: INFINITO } : { infinito: false, maxQtd: 1 }
);

const ESTILO_ATIVO = {
  borderColor: '#f5b800',
  color: '#f5b800',
  background: 'rgba(245, 184, 0, 0.12)',
};

// Botão de alternar (liga/desliga) para o canto superior direito do título da regra.
// Ligado: compra sem limite de quantidade até você clicar de novo para parar.
export default function BotaoInfinito({ ativo, onChange }) {
  return (
    <button
      type="button"
      className={`sniper__btn sniper__infinito ${ativo ? 'is-active' : ''}`}
      style={{ whiteSpace: 'nowrap', fontWeight: 600, ...(ativo ? ESTILO_ATIVO : null) }}
      aria-pressed={!!ativo}
      onClick={() => onChange(patchInfinito(!ativo))}
      title={ativo
        ? 'Comprando sem limite. Clique para parar e voltar ao limite de quantidade.'
        : 'Clique para comprar sem limite de quantidade, até você desativar.'}
    >
      ∞ {ativo ? 'Até parar' : 'Sem limite'}
    </button>
  );
}
