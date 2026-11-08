// Exportar/importar as regras do sniper (para passar de uma conta para outra).
// O texto importado vira config de compra automática, então tudo é validado e limpo antes de entrar.

const FORMATO = 'pokemultidle-sniper-regras';
const VERSAO = 1;
const MAX_REGRAS = 200;
const MAX_TEXTO = 80;
const MAX_EXTRAS = 20;
const GLOBAIS = ['shiny', 'p5', 'nota'];

const CHAVE_OK = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const PROIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);
const CONHECIDAS_REGRA = new Set(['id', 'active', 'tipo', 'alvoNome', 'alvoId', 'maxOuro', 'maxGemas', 'maxQtd', 'infinito', 'comprados', 'zerarEm']);

const texto = (v) => String(v ?? '').slice(0, MAX_TEXTO);

function numero(v, { max = 1e12, decimal = false } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(decimal ? n : Math.floor(n), max);
}

// Campos que o painel guarda na regra além dos conhecidos (ex.: o que o seletor de item acrescentar):
// só valores simples, com chave segura.
function extras(obj) {
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (n >= MAX_EXTRAS) break;
    if (CONHECIDAS_REGRA.has(k) || PROIBIDAS.has(k) || !CHAVE_OK.test(k)) continue;
    if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 200);
    else continue;
    n += 1;
  }
  return out;
}

function limparRegra(r, i) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const tipo = r.tipo === 'pokemon' ? 'pokemon' : 'item';
  const idOk = (typeof r.alvoId === 'string' || typeof r.alvoId === 'number') && String(r.alvoId).length <= MAX_TEXTO;
  return {
    ...extras(r),
    id: `r${Date.now()}${i}`,        // id novo: não colide com as regras da conta de destino
    active: r.active !== false,
    tipo,
    alvoNome: texto(r.alvoNome),
    alvoId: tipo === 'item' && idOk ? r.alvoId : null,
    maxOuro: numero(r.maxOuro),
    maxGemas: numero(r.maxGemas),
    maxQtd: Math.max(1, numero(r.maxQtd, { max: 1e9 })),
    infinito: r.infinito === true,
    comprados: 0,                    // o contador é da conta de origem, a nova começa do zero
  };
}

function limparGlobal(g, ehNota = false) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return null;   // null = regra desligada
  return {
    maxOuro: numero(g.maxOuro),
    maxGemas: numero(g.maxGemas),
    maxQtd: Math.max(1, numero(g.maxQtd, { max: 1e9 })),
    infinito: g.infinito === true,
    comprados: 0,
    ...(ehNota ? { min: numero(g.min, { max: 10, decimal: true }) } : {}),
  };
}

// Texto JSON com as regras da conta. Não leva o contador de comprados, o id nem os interruptores
// (ligado / simulação): cada conta mantém os seus.
export function serializarRegras(cfg, { nomeConta } = {}) {
  const semContador = ({ id, comprados, zerarEm, ...resto }) => resto;   // id/comprados/zerarEm saem de propósito
  const global = {};
  for (const k of GLOBAIS) global[k] = cfg?.global?.[k] ? semContador(cfg.global[k]) : null;
  return JSON.stringify({
    formato: FORMATO,
    versao: VERSAO,
    conta: nomeConta ? texto(nomeConta) : undefined,
    exportadoEm: new Date().toISOString(),
    rules: (cfg?.rules || []).map(semContador),
    global,
  }, null, 2);
}

export function contarRegras(cfg) {
  return { regras: (cfg?.rules || []).length, globais: GLOBAIS.filter((k) => cfg?.global?.[k]).length };
}

// Lê o texto colado/arquivo e devolve { ok, rules, global, conta } ou { ok: false, erro }.
export function lerRegras(entrada) {
  let dados;
  try { dados = JSON.parse(String(entrada ?? '').trim()); } catch { return { ok: false, erro: 'Isso não é um JSON válido.' }; }
  if (!dados || typeof dados !== 'object' || dados.formato !== FORMATO) return { ok: false, erro: 'Esse texto não é uma exportação de regras do sniper.' };
  if (!(dados.versao <= VERSAO)) return { ok: false, erro: 'Exportação de uma versão mais nova do app. Atualize o app e tente de novo.' };
  if (!Array.isArray(dados.rules)) return { ok: false, erro: 'A exportação não tem a lista de regras.' };
  if (dados.rules.length > MAX_REGRAS) return { ok: false, erro: `Regras demais (máximo ${MAX_REGRAS}).` };
  const rules = dados.rules.map(limparRegra).filter(Boolean);
  const g = dados.global && typeof dados.global === 'object' ? dados.global : {};
  return {
    ok: true,
    rules,
    global: { shiny: limparGlobal(g.shiny), p5: limparGlobal(g.p5), nota: limparGlobal(g.nota, true) },
    conta: texto(dados.conta),
  };
}
