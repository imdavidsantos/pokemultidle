import React from 'react';
import { QTD_MAX, QTD_MIN } from '../../../../utils/restock/loja';
import ItemHeader from './ItemHeader';
import ItemPrice from './ItemPrice';

const rotuloBotao = (status) => {
  if (status === 'ok') return '✓';
  if (status === 'err') return '⚠';
  return 'Comprar';
};

// só dígitos, sem decimais nem negativos, e nunca acima do máximo
const limitarQtd = (texto) => {
  const digitos = String(texto).replace(/\D/g, '');
  if (digitos === '') return '';
  return String(Math.min(Number(digitos), QTD_MAX));
};

export default function RestockItem({ item, qtd, status, msg, onQtd, onBlurQtd, onComprar }) {
  const comprando = status === 'buying';

  const somar = (n) => onQtd(limitarQtd((Number(qtd) || 0) + n));

  return (
    <div className="restock__item">
      <ItemHeader item={item} />

      <div className="restock__tem"><b>{item.qtd.toLocaleString('pt-BR')}</b></div>

<div className='restock__compra'>      <input
        className="restock__input"
        type="number"
        inputMode="numeric"
        min={QTD_MIN}
        max={QTD_MAX}
        step="1"
        placeholder="1"
        value={qtd ?? ''}
        onChange={(e) => onQtd(limitarQtd(e.target.value))}
        onBlur={onBlurQtd}
        onKeyDown={(e) => {
          if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault();
          if (e.key === 'Enter') onComprar();
        }}
        aria-label={`Quantidade de ${item.nome}`}
      />

      <div className="restock__quantidade">
        <button className="restock__addqtd" onClick={() => somar(100)} disabled={comprando}>+100</button>
        <button className="restock__addqtd" onClick={() => somar(1000)} disabled={comprando}>+1000</button>
        <button className="restock__addqtd" onClick={() => onQtd(String(QTD_MAX))} disabled={comprando}>MAX</button>
      </div>

      <button className="restock__buy" onClick={onComprar} disabled={comprando}>
        {rotuloBotao(status)}
      </button>
</div>
      <ItemPrice item={item} qtdTexto={qtd} />
      {msg && <div className="restock__erro">{msg}</div>}
    </div>
  );
}
