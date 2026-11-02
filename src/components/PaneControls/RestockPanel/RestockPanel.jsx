import React from 'react';
import useRestock from './components/useRestock';
import RestockItem from './components/RestockItem';
import AutoRestock from './components/AutoRestock';
import useAutoRestock, { temPreco } from './components/useAutoRestock';
import './RestockPanel.css';

function Painel({ onList, onBuy, onClose, chave }) {
  const { itens, erro, qtds, status, msgs, setQtd, normalizarQtd, comprar, carregar } = useRestock({ onList, onBuy });
  const { grupos, atualizar } = useAutoRestock({ itens, carregar, onBuy, chave });

  return (
    <div className="restock" role="dialog" aria-label="Estoque de Itens">
      <div className="restock__bar">
        <span>Estoque de Itens</span>
        <button className="restock__close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <AutoRestock grupos={grupos} atualizar={atualizar} />

      {itens === null && <p className="restock__msg">Lendo itens do jogo…</p>}
      {erro && <p className="restock__msg restock__msg--erro">{erro}</p>}
      {itens?.length === 0 && !erro && <p className="restock__msg">Nenhum item encontrado.</p>}

      <div className="restock__grid">
        {itens?.filter(temPreco).map((item) => (
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

// `chave` identifica a conta (use o slot). Ela separa o auto-reabastecimento de cada conta:
// a config é salva por chave e o painel é remontado do zero quando a chave muda,
// então nada (estado, estoque lido, timers) vaza de uma conta para a outra.
export default function RestockPanel({ onList, onBuy, onClose, chave }) {
  if (chave === undefined || chave === null || chave === '') {
    console.warn('RestockPanel sem `chave`: passe chave={slot} para o reestoque automático ficar separado por conta.');
  }
  const id = String(chave ?? 'default');
  return <Painel key={id} chave={id} onList={onList} onBuy={onBuy} onClose={onClose} />;
}
