import React from 'react';

// Campo numérico pequeno com rótulo em cima. Só aceita inteiros >= 0.
export default function CampoNum({ rotulo, valor, onChange, largura = 92, titulo }) {
  return (
    <label className="sniper__campo" title={titulo}>
      {rotulo}
      <input
        className="sniper__input"
        style={{ width: largura }}
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        placeholder="0"
        value={valor ? valor : ''}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        onKeyDown={(e) => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault(); }}
      />
    </label>
  );
}
