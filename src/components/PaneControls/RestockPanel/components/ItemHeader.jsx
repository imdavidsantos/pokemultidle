import React, { useEffect, useState } from 'react';
import { urlIcone } from '../../../../utils/restock/loja';
import './ItemHeader.css';

// Ícone do item. Se a imagem não carregar, mostra um quadrado vazio
// para o card não "pular" de tamanho nem exibir um ícone quebrado.
function ItemIcon({ item }) {
  const src = urlIcone(item);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => { setFalhou(false); }, [src]);

  if (falhou) return <span className="restock__ico restock__ico--vazio" aria-hidden="true" />;

  return (
    <img
      className="restock__ico"
      src={src}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => {
        console.warn('Ícone não encontrado:', src);
        setFalhou(true);
      }}
    />
  );
}

export default function ItemHeader({ item }) {
  return (
    <div className="restock__topo">
      <ItemIcon item={item} />
      <div className="restock__nome" title={item.nome}>{item.nome}</div>
    </div>
  );
}
