import React from 'react';
import { clampQtd } from '../../../../utils/restock/loja';

export default function ItemPrice({ item, qtdTexto }) {
  if (item.preco == null) return <div className="restock__preco">Preço: —</div>;

  if (!qtdTexto) {
    return <div className="restock__preco">{item.preco.toLocaleString('pt-BR')} {item.moeda} /un.</div>;
  }

  const total = (clampQtd(qtdTexto) * item.preco).toLocaleString('pt-BR');
  return <div className="restock__preco"><span className="restock__total">{total}</span> {item.moeda}</div>;
}
