import React from 'react';
import CampoNum from './CampoNum';

const LINHAS = [
  { chave: 'shiny', titulo: '✨ Qualquer shiny' },
  { chave: 'p5', titulo: '⚡ Qualquer P5' },
  { chave: 'nota', titulo: '⭐ Nota mínima' },
];

// Regras que valem para QUALQUER pokémon anunciado (não precisa dizer a espécie).
export default function GlobalRules({ global, scan, ligado, onChange }) {
  const ligar = (k, ligado) => onChange({
    ...global,
    [k]: ligado ? { maxOuro: 0, maxGemas: 0, maxQtd: 1, comprados: 0, ...(k === 'nota' ? { min: 0 } : {}) } : null,
  });
  const editar = (k, patch) => onChange({ ...global, [k]: { ...global[k], ...patch } });

  return (
    <div className="sniper__globais">
      {ligado && (
        <div className="sniper__scan">
          {scan ? `Último scan de pokémon ${new Date(scan.t).toLocaleTimeString('pt-BR')}: ${scan.anuncios} anúncios lidos.` : 'Aguardando o primeiro scan de pokémon…'}
        </div>
      )}
      {LINHAS.map(({ chave, titulo }) => {
        const g = global[chave];
        return (
          <div key={chave} className={`sniper__regra ${g ? '' : 'is-off'}`}>
            <div className="sniper__linha">
              <label className="sniper__check">
                <input type="checkbox" checked={!!g} onChange={(e) => ligar(chave, e.target.checked)} />
                <b>{titulo}</b>
              </label>
            </div>
            {g && (
              <div className="sniper__linha">
                {chave === 'nota' && (
                  <CampoNum rotulo="Nota mín. (1-10)" valor={g.min} largura={80} onChange={(v) => editar(chave, { min: Math.min(10, v) })} />
                )}
                <CampoNum rotulo="Teto ouro" valor={g.maxOuro} onChange={(v) => editar(chave, { maxOuro: v })} />
                <CampoNum rotulo="Teto gemas" valor={g.maxGemas} onChange={(v) => editar(chave, { maxGemas: v })} />
                <CampoNum rotulo="Qtd máxima" valor={g.maxQtd} largura={70} onChange={(v) => editar(chave, { maxQtd: Math.max(1, v) })} />
                <div className="sniper__campo">
                  Comprados
                  <span className="sniper__comprados">
                    {g.comprados || 0}/{g.maxQtd || 1}
                    <button className="sniper__btn" onClick={() => editar(chave, { comprados: 0, zerarEm: Date.now() })}>zerar</button>
                  </span>
                </div>
                {!(g.maxOuro > 0) && !(g.maxGemas > 0) && <div className="sniper__aviso-regra">Sem teto de preço: não compra nada.</div>}
                {chave === 'nota' && !(g.min > 0) && <div className="sniper__aviso-regra">Defina a nota mínima.</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
