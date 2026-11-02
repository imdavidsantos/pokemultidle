import React, { useMemo, useState } from 'react';
import { useCatalogoItens } from '../../../utils/sniper/sniperStore';

const norm = (s) => String(s || '').toLowerCase().trim();

// Busca de item com lista. Guarda o NOME e o ID: é o id que o jogo usa para comprar.
export default function ItemPicker({ nome, itemId, onChange }) {
  const catalogo = useCatalogoItens();
  const [aberto, setAberto] = useState(false);

  const sugestoes = useMemo(() => {
    const q = norm(nome);
    const lista = q ? catalogo.filter((i) => norm(i.name).includes(q) || String(i.id) === q) : catalogo;
    return lista.slice(0, 8);
  }, [catalogo, nome]);

  // digitou o nome exato? já fixa o id; qualquer outra coisa deixa sem id (a regra não compra)
  const digitar = (texto) => {
    const exato = catalogo.find((i) => norm(i.name) === norm(texto));
    onChange({ alvoNome: texto, alvoId: exato ? exato.id : null });
  };
  const escolher = (item) => {
    onChange({ alvoNome: item.name, alvoId: item.id });
    setAberto(false);
  };

  return (
    <div className="sniper__picker" style={{ flex: 1, minWidth: 0 }}>
      <input
        className="sniper__input sniper__picker-input"
        style={{ width: '100%', boxSizing: 'border-box' }}
        placeholder="Buscar item (ex.: Earth Stone)"
        value={nome || ''}
        onChange={(e) => digitar(e.target.value)}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        autoComplete="off"
      />
      {aberto && sugestoes.length > 0 && (
        <ul className="sniper__sugestoes" role="listbox">
          {sugestoes.map((i) => (
            <li
              key={i.id}
              role="option"
              aria-selected={i.id === itemId}
              className={`sniper__sugestao ${i.id === itemId ? 'is-on' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); escolher(i); }}
            >
              <span>{i.name}</span>
              <small>{i.cat} · #{i.id}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Texto de status do item (✓ escolhido / ✗ erro). Fica numa linha própria, abaixo da linha de inputs,
// igual ao texto do pokémon. Use no RuleRow logo depois da linha do topo.
export function ItemStatus({ nome, itemId }) {
  const catalogo = useCatalogoItens();
  const escolhido = itemId ? catalogo.find((i) => i.id === itemId) : null;
  return (
    <div className={`sniper__resolvido ${itemId ? 'is-ok' : nome ? 'is-erro' : ''}`}>
      {itemId
        ? `✓ ${escolhido ? escolhido.name : 'Item'} · #${itemId}${escolhido && escolhido.cat ? ` · ${escolhido.cat}` : ''}`
        : nome ? '✗ Escolha um item da lista: o nome precisa ser exato.' : 'Digite para buscar na lista de itens.'}
    </div>
  );
}
