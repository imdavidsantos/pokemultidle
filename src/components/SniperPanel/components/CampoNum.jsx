import React, { useEffect, useState } from 'react';

// Campo numérico pequeno com rótulo em cima. Só aceita valores >= 0.
// - Padrão: só inteiros (ouro, gemas, quantidade).
// - decimal: aceita casas decimais (ex.: nota 3.5 ou 4.8). Use `passo` para o step das setas.
// - max: valor máximo (ex.: 10 para nota).
// - disabled: desabilita o campo (ex.: quando a quantidade é infinita).
export default function CampoNum({
  rotulo, valor, onChange, largura = 92, titulo,
  decimal = false, passo = 0.1, disabled = false, max, placeholder = '0',
}) {
  // Texto digitado fica local para não perder "3." ou "4," no meio da digitação.
  const [txt, setTxt] = useState(valor ? String(valor) : '');

  // Sincroniza se o valor mudar por fora (ex.: reset da regra).
  useEffect(() => {
    if (Number(txt || 0) !== Number(valor || 0)) setTxt(valor ? String(valor) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  const handleChange = (e) => {
    const bruto = e.target.value;
    setTxt(bruto);
    const n = Number(bruto);
    let seguro = Number.isFinite(n) ? Math.max(0, n) : 0;
    if (max != null && seguro > max) { seguro = max; setTxt(String(max)); }
    onChange(decimal ? seguro : Math.floor(seguro));
  };

  const bloqueadas = decimal ? ['e', 'E', '+', '-'] : ['e', 'E', '+', '-', '.', ','];

  return (
    <label className="sniper__campo" title={titulo} style={{ minWidth: 0 }}>
      {rotulo}
      <input
        className="sniper__input"
        style={{ width: largura, maxWidth: '100%', boxSizing: 'border-box' }}
        type="number"
        inputMode={decimal ? 'decimal' : 'numeric'}
        min="0"
        max={max}
        step={decimal ? passo : 1}
        placeholder={placeholder}
        disabled={disabled}
        value={txt}
        onChange={handleChange}
        onKeyDown={(e) => { if (bloqueadas.includes(e.key)) e.preventDefault(); }}
      />
    </label>
  );
}
