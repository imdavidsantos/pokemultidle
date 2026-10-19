import { lerFicha } from './lerFicha.js';
import { BONUS_POT, norm, PODER_MAX_GOLPE, RARIDADES_LENDARIAS } from './pokeInfo.js';


// Fórmula do jogo (serve para conferir a ficha).
function calcularStat(esp, chave, { nivel, q, pot, shiny, refino, iv, lendario }) {
  const baseKey = { hp: 'baseHp', atk: 'baseAtk', def: 'baseDef', spAtk: 'baseSpAtk', spDef: 'baseSpDef', speed: 'baseSpeed' }[chave];
  const expoente = chave === 'hp' || chave === 'speed' ? 0.95 : 0.8;
  return (esp[baseKey] + refino + 2 * iv) * (nivel / 100) * q ** expoente
    * (1 + BONUS_POT[pot - 1]) * (shiny ? 3 : 1) * (lendario ? 4 : 1);
}

// Papel: soma o poder dos golpes por categoria; empate -> decide pelos stats base.
function detectarPapel(esp) {
  const soma = (cat) => (esp.attacks ?? [])
    .filter((a) => a.category === cat && a.power < PODER_MAX_GOLPE)
    .reduce((s, a) => s + a.power, 0);
  const fisico = soma('PHYSICAL');
  const especial = soma('SPECIAL');
  if (fisico === especial) return esp.baseSpAtk > esp.baseAtk ? 'elemental' : 'físico';
  return especial > fisico ? 'elemental' : 'físico';
}

// avaliação da ficha do pokemon
export function avaliarFicha(texto, pokedex) {
  const ficha = lerFicha(texto);
  if (ficha.erros.length) return { erros: ficha.erros };

  const esp = (ficha.pokeId && pokedex.porId.get(ficha.pokeId)) || pokedex.porNome.get(norm(ficha.nome));
  if (!esp) return { erros: [`"${ficha.nome}" não está na pokedex.`] };

  const { ivs, q, pot, shiny } = ficha;
  const lendario = RARIDADES_LENDARIAS.has(esp.rarity);
  const ivSum = ficha.ivSoma || Object.values(ivs).reduce((a, b) => a + b, 0);
  const papel = detectarPapel(esp);
  const ivChave = papel === 'elemental' ? ['spAtk', 'speed'] : ['atk', 'speed'];
  const ivChaveMin = Math.min(...ivChave.map((k) => ivs[k]));
  const aindaEvolui = esp.evolvesToId > 0;
  const limNota = aindaEvolui ? 2.9 : 3.5;

  const checks = [];
  const ck = (status, titulo, texto) => checks.push({ status, titulo, texto });

  // Nota: usa a REAL da ficha. Lendário não tem nota, então pula o check.
  if (ficha.nota != null) {
    ck(ficha.nota >= limNota ? 'ok' : ficha.nota >= limNota - 0.5 ? 'warn' : 'no', 'Nota',
      `${ficha.nota.toFixed(1)} (referência ${limNota}+${aindaEvolui ? ', ainda evolui, dá pra relevar' : ''})`);
  }

  const qOk = q >= 1.6 || (pot >= 4 && ivSum >= 120) || shiny;
  ck(q >= 1.6 ? 'ok' : qOk ? 'warn' : 'no', 'Qualidade',
    `${q.toFixed(3)}${ficha.percentil ? ` (melhor que ${ficha.percentil}% dos nascimentos)` : ''}`);

  ck(ivSum >= 150 && ivChaveMin >= 20 ? 'ok' : ivSum >= 120 && ivChaveMin >= 14 ? 'warn' : 'no', 'IVs',
    `soma ${ivSum}/192 · ${ivChave.map((k) => `${k}=${ivs[k]}`).join(' + ')}`);

  ck(pot >= 4 ? 'ok' : pot === 3 ? 'warn' : 'no', 'Potência', `P${pot}`);
  ck(shiny ? 'ok' : 'warn', 'Shiny', shiny ? 'shiny (×3)' : 'não é shiny');
  ck(ivChaveMin >= 20 ? 'ok' : ivChaveMin >= 14 ? 'warn' : 'no', 'Papel',
    `${papel} — precisa ${papel === 'elemental' ? 'Sp.ATK' : 'ATK'} + SPD altos`);

  const nOk = checks.filter((c) => c.status === 'ok').length;
  const nNo = checks.filter((c) => c.status === 'no').length;
  const veredito = nNo === 0 && nOk >= 4 ? 'bom' : nNo <= 1 ? 'medio' : 'ruim';

  const dicas = [];
  if (q < 1.6 && !shiny) dicas.push('qualidade baixa, um novo nascimento maior que 1.6 muda tudo');
  if (ivChaveMin < 14) dicas.push(`falta IV nos stats, ${papel}`);
  if (pot < 4) dicas.push('potência baixa, P4+ multiplicaria todos os stats e ficaria bom');

  // Confere a pokedex contra a ficha: se divergir, a pokedex está desatualizada (ou lendário/forma errada).
  const avisos = [...ficha.avisos];
  for (const k of Object.keys(ficha.stats)) {
    const calc = calcularStat(esp, k, { nivel: ficha.nivel, q, pot, shiny, refino: ficha.refino, iv: ivs[k], lendario });
    if (Math.abs(calc - ficha.stats[k]) > 2) {
      avisos.push(`Stat ${k} da ficha (${ficha.stats[k]}) difere do calculado (${Math.round(calc)}) — confira a pokedex.`);
    }
  }

  return { nome: esp.name, nivel: ficha.nivel, papel, veredito, checks, dicas, avisos };
}
