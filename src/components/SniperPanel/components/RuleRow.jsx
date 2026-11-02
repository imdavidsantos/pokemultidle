import React from 'react';
import CampoNum from './CampoNum';
import ItemPicker from './ItemPicker';
import ScanInfo from './ScanInfo';

// Uma regra: "compre este item/pokémon até este preço, no máximo X unidades".
export default function RuleRow({ regra, scan, ligado, onChange, onRemove }) {
  const limite = regra.maxQtd || 1;
  const ehItem = regra.tipo === 'item';
  const semAlvo = ehItem ? !regra.alvoId : !String(regra.alvoNome || '').trim();
  const semTeto = !(regra.maxOuro > 0) && !(regra.maxGemas > 0);
  const esgotada = (regra.comprados || 0) >= limite;

  return (
    <div className={`sniper__regra ${regra.active ? '' : 'is-off'}`}>
      <div className="sniper__linha sniper__linha--topo">
        <input
          type="checkbox"
          checked={!!regra.active}
          onChange={(e) => onChange({ active: e.target.checked })}
          title="Ativar esta regra"
        />
        <select
          className="sniper__input"
          value={regra.tipo}
          onChange={(e) => onChange({ tipo: e.target.value, alvoNome: '', alvoId: null })}
        >
          <option value="item">Item</option>
          <option value="pokemon">Pokémon</option>
        </select>

        {ehItem ? (
          <ItemPicker nome={regra.alvoNome} itemId={regra.alvoId} onChange={onChange} />
        ) : (
          <div className="sniper__picker">
            <input
              className="sniper__input sniper__picker-input"
              list="sniper-pokemon"
              placeholder="Nome do pokémon (ex.: Dratini)"
              value={regra.alvoNome || ''}
              onChange={(e) => onChange({ alvoNome: e.target.value, alvoId: null })}
            />
            <div className="sniper__resolvido">Compara com o nome do pokémon anunciado (trecho do nome).</div>
          </div>
        )}

        <button className="sniper__btn sniper__btn--perigo" onClick={onRemove} aria-label="Remover regra" title="Remover regra">✕</button>
      </div>

      <div className="sniper__linha">
        <CampoNum rotulo="Teto ouro (por un.)" valor={regra.maxOuro} onChange={(v) => onChange({ maxOuro: v })} />
        <CampoNum rotulo="Teto gemas (por un.)" valor={regra.maxGemas} onChange={(v) => onChange({ maxGemas: v })} />
        <CampoNum rotulo="Qtd máxima" valor={regra.maxQtd} largura={70} onChange={(v) => onChange({ maxQtd: Math.max(1, v) })} />
        <div className="sniper__campo">
          Comprados
          <span className="sniper__comprados">
            {regra.comprados || 0}/{limite}
            <button className="sniper__btn" onClick={() => onChange({ comprados: 0, zerarEm: Date.now() })} title="Zerar o contador">zerar</button>
          </span>
        </div>
      </div>

      {regra.active && semAlvo && <div className="sniper__aviso-regra">{ehItem ? 'Escolha o item na lista: sem o id a regra não compra nada.' : 'Preencha o nome: sem ele a regra não compra nada.'}</div>}
      {regra.active && !semAlvo && semTeto && <div className="sniper__aviso-regra">Sem teto de preço: esta regra não compra nada.</div>}
      {regra.active && esgotada && <div className="sniper__aviso-regra">Limite atingido: use "zerar" para comprar mais.</div>}

      {regra.active && ehItem && <ScanInfo info={scan} ligado={ligado} />}
    </div>
  );
}
