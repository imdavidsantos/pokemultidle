import React, { useEffect } from 'react';
import RestockItem from './components/RestockItem';
import AutoRestock from './components/AutoRestock';
import { temPreco } from './components/useAutoRestock';
import './RestockPanel.css';

// O painel agora é só a TELA do estoque. A lógica (ler itens, comprar, automático) mora no
// PaneControls, que fica sempre montado: por isso o automático roda com este painel fechado.
//   restock = retorno do useRestock    auto = retorno do useAutoRestock
export default function RestockPanel({ restock, auto, onClose }) {
  const { itens, erro, qtds, status, msgs, setQtd, normalizarQtd, comprar, carregar } = restock;
  const { grupos, atualizar } = auto;

  // ao abrir o painel, atualiza o estoque que aparece na tela
  useEffect(() => { carregar(); }, [carregar]);

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
