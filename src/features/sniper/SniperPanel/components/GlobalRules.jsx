import React from 'react';
import CampoNum from './CampoNum';
import CampoOuro from './CampoOuro';
import BotaoInfinito from './BotaoInfinito';

const LINHAS = [
  { chave: 'shiny', titulo: '✨ Qualquer shiny' },
  { chave: 'p5', titulo: '⚡ Qualquer P5' },
  { chave: 'nota', titulo: '⭐ Nota mínima' },
];

// Campos em grade: preenchem a largura e quebram de linha sozinhos.
const GRADE = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8, alignItems: 'start' };

// Atalhos de nota mínima.
const NOTAS_RAPIDAS = [3.5, 4, 6];
const ESTILO_ATIVO = { borderColor: '#f5b800', color: '#f5b800', background: 'rgba(245, 184, 0, 0.12)' };

// Regras que valem para QUALQUER pokémon anunciado (não precisa dizer a espécie).
export default function GlobalRules({ global, scan, ligado, onChange }) {
  const ligar = (k, ligado) => onChange({
    ...global,
    [k]: ligado ? { maxOuro: 0, maxGemas: 0, maxQtd: 1, infinito: false, comprados: 0, ...(k === 'nota' ? { min: 0 } : {}) } : null,
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
            <div className="sniper__linha" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <label className="sniper__check">
                <input type="checkbox" checked={!!g} onChange={(e) => ligar(chave, e.target.checked)} />
                <b>{titulo}</b>
              </label>
              {g && <BotaoInfinito ativo={!!g.infinito} onChange={(p) => editar(chave, p)} />}
            </div>
            {g && (
              <>
                <div style={GRADE}>
                  {chave === 'nota' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                      <CampoNum rotulo="Nota mín. (1-10)" valor={g.min} largura="100%" decimal max={10} onChange={(v) => editar(chave, { min: v })} />
                      <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Notas rápidas">
                        {NOTAS_RAPIDAS.map((n) => (
                          <button
                            key={n}
                            type="button"
                            className="sniper__btn"
                            title={`Definir nota mínima ${n.toFixed(1)}`}
                            aria-pressed={Number(g.min) === n}
                            onClick={() => editar(chave, { min: n })}
                            style={{ flex: 1, padding: '2px 0', fontSize: 12, fontWeight: 600, ...(Number(g.min) === n ? ESTILO_ATIVO : null) }}
                          >
                            {n.toFixed(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <CampoOuro rotulo="Teto ouro" valor={g.maxOuro} onChange={(v) => editar(chave, { maxOuro: v })} />
                  <CampoNum rotulo="Teto gemas" valor={g.maxGemas} largura="100%" onChange={(v) => editar(chave, { maxGemas: v })} />
                  <CampoNum
                    rotulo="Qtd máxima"
                    valor={g.infinito ? 0 : g.maxQtd}
                    largura="100%"
                    disabled={!!g.infinito}
                    placeholder={g.infinito ? '∞' : '0'}
                    onChange={(v) => editar(chave, { maxQtd: Math.max(1, v) })}
                  />
                  <div className="sniper__campo" style={{ minWidth: 0 }}>
                    Comprados
                    <span className="sniper__comprados">
                      {g.comprados || 0}{g.infinito ? '' : `/${g.maxQtd || 1}`}
                      <button className="sniper__btn" onClick={() => editar(chave, { comprados: 0, zerarEm: Date.now() })}>zerar</button>
                    </span>
                  </div>
                </div>
                {!(g.maxOuro > 0) && !(g.maxGemas > 0) && <div className="sniper__aviso-regra">Sem teto de preço: não compra nada.</div>}
                {chave === 'nota' && !(g.min > 0) && <div className="sniper__aviso-regra">Defina a nota mínima.</div>}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
