const CHAVE_STAT = { HP: 'hp', ATK: 'atk', DEF: 'def', 'SP.ATK': 'spAtk', 'SP.DEF': 'spDef', SPD: 'speed' };

// Lê o texto da ficha do jogo. Devolve os dados, mais `erros` e `avisos`.
export function lerFicha(texto) {
  const num = (s) => Number(String(s).replace(/,/g, ''));   // "1,390" -> 1390
  const campo = (rotulo) => {
    const m = texto.match(new RegExp(`^\\s*[-*]\\s*${rotulo}[^:\\n]*:\\s*(.+)$`, 'im'));
    return m ? m[1].trim() : '';
  };

  const nota = parseFloat(campo('Nota da Calculadora').replace(',', '.'));
  const ficha = {
    nome: campo('Esp[ée]cie').replace(/\s*\(#\d+\).*$/, '').trim(),  
    shiny: /^s/i.test(campo('Shiny')),                                // "sim" / "não"
    nivel: num(campo('N[ií]vel').match(/[\d,]+/)?.[0] ?? NaN),
    pot: Number(campo('Pot[êe]ncia').match(/P(\d)/i)?.[1]),
    q: parseFloat(campo('Qualidade').replace(',', '.')),
    percentil: Number(campo('Qualidade').match(/(\d+)\s*%/)?.[1]) || null,
    ivSoma: Number(campo('IV somado').match(/\d+/)?.[0]),
    nota: Number.isNaN(nota) ? null : nota,                           // null = lendário (sem nota)
    refino: Number(campo('Refino').match(/\d+/)?.[0]) || 0,
    ivs: {},
    stats: {},
    erros: [],
    avisos: [],
  };

  for (const m of texto.matchAll(/^\|\s*(HP|ATK|DEF|SP\.ATK|SP\.DEF|SPD)\s*\|\s*[\d,]+\s*\|\s*(\d+)\s*\|\s*([\d,]+)\s*\|/gim)) {
    const k = CHAVE_STAT[m[1].toUpperCase()];
    ficha.ivs[k] = Number(m[2]);
    ficha.stats[k] = num(m[3]);
  }

  const faltando = [];
  if (!ficha.nome) faltando.push('espécie');
  if (!(ficha.nivel > 0)) faltando.push('nível');
  if (!(ficha.q >= 0.8 && ficha.q <= 1.8)) faltando.push('qualidade');
  if (!(ficha.pot >= 1 && ficha.pot <= 5)) faltando.push('potência');
  if (Object.keys(ficha.ivs).length < 6) faltando.push('tabela de stats');
  if (faltando.length) ficha.erros.push(`Não consegui ler: ${faltando.join(', ')}.`);

  const soma = Object.values(ficha.ivs).reduce((a, b) => a + b, 0);
  if (ficha.ivSoma && soma && soma !== ficha.ivSoma) ficha.avisos.push('A soma dos IVs da tabela não bate com o IV somado.');
  return ficha;
}
