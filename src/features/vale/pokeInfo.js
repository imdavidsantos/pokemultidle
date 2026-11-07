const BONUS_POT = [0, 0.05, 0.10, 0.25, 1];          // P1..P5 => ×1, ×1.05, ×1.1, ×1.25, ×2
const RARIDADES_LENDARIAS = new Set(['LEGENDARY', 'MYTHIC']); // confira os valores reais do seu JSON
const PODER_MAX_GOLPE = 500;                          // ignora golpes "600" (Petal Bloom etc.) ao detectar o papel

const ICONE = { ok: '✅', warn: '⚠️', no: '❌' };

const VEREDITO = {
  bom:   { icone: '🟢', titulo: 'NASCEU BOM',          sub: 'vale usar no time' },
  medio: { icone: '🟡', titulo: 'USÁVEL COM RESSALVA', sub: 'funciona, mas tem ponto fraco' },
  ruim:  { icone: '🔴', titulo: 'FRACO',               sub: 'guarda pra troca ou espera um melhor' },
};

const norm = (s) => String(s).trim().toLowerCase();

export {BONUS_POT, RARIDADES_LENDARIAS, PODER_MAX_GOLPE, ICONE, VEREDITO, norm}
