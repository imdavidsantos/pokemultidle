import React, { useEffect, useState } from 'react';
import { useIconeItem } from '../../sniperStore';

// Formata 415000000 -> "415M", 1500000000 -> "1,5B", 12000 -> "12K"
const fmtCompacto = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  const casas = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ','));
  if (v >= 1e9) return `${casas(v / 1e9)}B`;
  if (v >= 1e6) return `${casas(v / 1e6)}M`;
  if (v >= 1e3) return `${casas(v / 1e3)}K`;
  return v.toLocaleString('pt-BR');
};

// Imagem da regra: imagem própria da regra > ícone real aprendido do jogo (pelo id do item).
// Não dá para adivinhar pelo nome: o site usa nomes próprios e subpastas (ex.: /img/itens/casa-comum.png,
// /img/itens/zmove/aoe-peca.png). Sem ícone aprendido ainda, mostra a inicial do nome.
export const imagemDaRegra = (regra, iconeAprendido = null) => {
  const propria = regra.imagem ?? regra.img ?? regra.icone ?? regra.sprite ?? null;
  if (propria) return propria;
  if (regra.tipo === 'item' && iconeAprendido) return iconeAprendido;
  return null;
};

export default function RuleCard({ regra, onOpen, onToggle, onRemove }) {
  const [imgFalhou, setImgFalhou] = useState(false);
  const aprendido = useIconeItem(regra.tipo === 'item' ? regra.alvoId : null);
  const url = imagemDaRegra(regra, aprendido);
  useEffect(() => { setImgFalhou(false); }, [url]);   // trocou o item da regra: tenta a imagem de novo
  const nome = regra.alvoNome?.trim() || 'Sem nome';
  const ouro = fmtCompacto(regra.maxOuro);
  const gemas = fmtCompacto(regra.maxGemas);

  const abrir = () => onOpen?.();
  const onKey = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
  };

  return (
    <div
      className={`rcard ${regra.active ? '' : 'is-off'}`}
      role="button"
      tabIndex={0}
      onClick={abrir}
      onKeyDown={onKey}
      title="Clique para editar a regra"
    >
      <input
        type="checkbox"
        className="rcard__toggle"
        checked={!!regra.active}
        onChange={(e) => onToggle?.(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Regra ${nome} ativa`}
        title={regra.active ? 'Clique para pausar esta regra' : 'Clique para reativar esta regra'}
      />

      <button
        type="button"
        className="rcard__remover"
        onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={`Excluir regra ${nome}`}
        title="Excluir esta regra"
      >✕</button>

      {!regra.active && <span className="rcard__pausada">Pausada</span>}

      <div className="rcard__img">
        {url && !imgFalhou
          ? <img src={url} alt="" loading="lazy" onError={() => setImgFalhou(true)} />
          : <span aria-hidden="true">{nome.charAt(0).toUpperCase()}</span>}
      </div>

      <div className="rcard__nome" title={nome}>{nome}</div>

      <div className="rcard__preco">
        <div className="rcard__linha"><small>Ouro</small><b>{ouro ?? '—'}</b></div>
        <div className="rcard__linha"><small>Gemas</small><b>{gemas ?? '—'}</b></div>
      </div>

      <div className="rcard__rodape">
        {regra.infinito
          ? <span className="rcard__chip rcard__chip--inf">∞ Até parar</span>
          : <span className="rcard__chip">Qtd {Number(regra.maxQtd) || 0}</span>}
        <span className="rcard__comp">{Number(regra.comprados) || 0} comprados</span>
      </div>
    </div>
  );
}
