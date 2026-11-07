import React, { useState } from 'react';
import CampoNum from './CampoNum';

const MULT = { un: 1, M: 1e6, B: 1e9 };
const OPCOES = [
  { id: 'un', txt: 'Un.', titulo: 'Unidade (sem multiplicar)' },
  { id: 'M', txt: 'M', titulo: 'Milhão (× 1.000.000)' },
  { id: 'B', txt: 'B', titulo: 'Bilhão (× 1.000.000.000)' },
];

// Descobre a unidade a partir do valor já salvo (ex.: 50000000 → "50" em M).
const unidadeInicial = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e9 && n % 1e9 === 0) return 'B';
  if (n >= 1e6 && n % 1e6 === 0) return 'M';
  return 'un';
};

// Campo de ouro com seletor de unidade embaixo (Un. / M / B).
// O valor salvo (onChange) é SEMPRE o número final: 50 em "M" salva 50000000.
// Trocar a unidade mantém o número digitado e só muda o multiplicador.
export default function CampoOuro({ rotulo, valor, onChange, titulo }) {
  const [unidade, setUnidade] = useState(() => unidadeInicial(valor));
  const mult = MULT[unidade];
  const mantissa = (Number(valor) || 0) / mult;

  const trocar = (u) => {
    setUnidade(u);
    onChange(Math.round(mantissa * MULT[u]));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <CampoNum
        rotulo={rotulo}
        titulo={titulo}
        valor={mantissa}
        largura="100%"
        decimal={unidade !== 'un'}
        onChange={(v) => onChange(Math.round(v * mult))}
      />
      <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Unidade do ouro">
        {OPCOES.map((o) => {
          const ativo = unidade === o.id;
          return (
            <button
              key={o.id}
              type="button"
              className="sniper__btn"
              title={o.titulo}
              aria-pressed={ativo}
              onClick={() => trocar(o.id)}
              style={{
                flex: 1,
                padding: '2px 0',
                fontSize: 12,
                fontWeight: 600,
                ...(ativo ? { borderColor: '#f5b800', color: '#f5b800', background: 'rgba(245, 184, 0, 0.12)' } : null),
              }}
            >
              {o.txt}
            </button>
          );
        })}
      </div>
      {unidade !== 'un' && Number(valor) > 0 && (
        <span style={{ fontSize: 11, opacity: 0.7, textAlign: 'center' }}>{Number(valor).toLocaleString('pt-BR')}</span>
      )}
    </div>
  );
}
