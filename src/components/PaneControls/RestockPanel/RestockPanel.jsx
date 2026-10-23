import React from 'react';
import useRestock from './components/useRestock';
import RestockItem from './components/RestockItem';
import './RestockPanel.css';

export default function RestockPanel({ onList, onBuy, onClose }) {
  const { itens, erro, qtds, status, msgs, setQtd, normalizarQtd, comprar } = useRestock({ onList, onBuy });

  return (
    <div className="restock" role="dialog" aria-label="Estoque de Itens">
      <div className="restock__bar">
        <span>Estoque de Itens</span>
        <button className="restock__close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      {itens === null && <p className="restock__msg">Lendo itens do jogo…</p>}
      {erro && <p className="restock__msg restock__msg--erro">{erro}</p>}
      {itens?.length === 0 && !erro && <p className="restock__msg">Nenhum item encontrado.</p>}

      <div className="restock__grid">
        {itens?.map((item) => (
          <RestockItem
            key={item.id}
            item={item}
            qtd={qtds[item.id]}
            status={status[item.id]}
            msg={msgs[item.id]}
            onQtd={(valor) => setQtd(item.id, valor)}
            onBlurQtd={() => normalizarQtd(item.id)}
            onComprar={() => comprar(item)}
          />
        ))}
      </div>
    </div>
  );
}
