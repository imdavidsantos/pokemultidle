import React, { useState } from 'react';
import { StockIcon } from '../../../assets/icons/StockIcon';
import { IMG } from '../../../utils/rmt/config';

// Ações do menu de ajuda. Para acrescentar uma nova, é só colocar mais um item na lista.
export default function useHelpActions({ onCopySheet, onToggleRestock, onSellDepot, onToggleRmt }) {
  // resultado de cada ação: { [id]: { tipo: 'ok' | 'err', msg? } }
  const [feedback, setFeedback] = useState({});

  // Roda a ação e mostra ✓ ou ⚠ por um instante
  const executar = (id, fn) => async () => {
    try {
      await fn();
      setFeedback((f) => ({ ...f, [id]: { tipo: 'ok' } }));
    } catch (err) {
      console.warn(`Ação "${id}" falhou:`, err);
      setFeedback((f) => ({ ...f, [id]: { tipo: 'err', msg: err?.message } }));
    }
    setTimeout(() => setFeedback((f) => ({ ...f, [id]: undefined })), 2500);
  };

  const tipo = (id) => feedback[id]?.tipo;
  const icone = (id, padrao) => (tipo(id) === 'ok' ? '✓' : tipo(id) === 'err' ? '⚠' : padrao);

  return [
    {
      id: 'copy-sheet',
      icon: icone('copy-sheet', '📋'),
      label: tipo('copy-sheet') === 'ok' ? 'Ficha copiada!' : tipo('copy-sheet') === 'err' ? 'Não foi possível copiar' : 'Copiar ficha do pokémon',
      onClick: executar('copy-sheet', onCopySheet),
    },
    {
      id: 'restock',
      icon: <StockIcon />,
      label: 'Reabastecer itens',
      onClick: onToggleRestock,
    },
    {
      id: 'sell-depot',
      icon: icone('sell-depot', '💰'),
      label: tipo('sell-depot') === 'ok'
        ? 'Confirme a venda no jogo'
        : tipo('sell-depot') === 'err'
          ? (feedback['sell-depot'].msg || 'Não foi possível abrir a venda')
          : 'Vender todo o Depot',
      onClick: executar('sell-depot', onSellDepot),
    },
    {
      id: 'rmt',
      icon: <img src={IMG.gema} width="18" height="18" alt="" draggable={false} />,
      label: 'Vender no market RMT',
      onClick: onToggleRmt,
    },
  ];
}
