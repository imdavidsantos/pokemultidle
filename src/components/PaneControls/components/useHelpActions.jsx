import React, { useState } from 'react';
import { StockIcon } from '../../../assets/icons/StockIcon';

// Ações do menu de ajuda. Para acrescentar uma nova, é só colocar mais um item na lista.
export default function useHelpActions({ onCopySheet, onToggleRestock }) {
  const [copied, setCopied] = useState(null); // 'ok' | 'err' | null

  const handleCopy = async () => {
    try {
      await onCopySheet();
      setCopied('ok');
    } catch (err) {
      console.warn('Não foi possível copiar a ficha:', err);
      setCopied('err');
    }
    setTimeout(() => setCopied(null), 1500);
  };

  return [
    {
      id: 'copy-sheet',
      icon: copied === 'ok' ? '✓' : copied === 'err' ? '⚠' : '📋',
      label: copied === 'ok' ? 'Ficha copiada!' : copied === 'err' ? 'Não foi possível copiar' : 'Copiar ficha do pokémon',
      onClick: handleCopy,
    },
    {
      id: 'restock',
      icon: <StockIcon />,
      label: 'Estoque',
      onClick: onToggleRestock,
    },
  ];
}
