import { useSyncExternalStore } from 'react';
import { ITENS_MERCADO } from './itensMercado';

// Guarda a config do sniper POR CONTA (slot), os logs e o status ao vivo.
// O GameView e o SniperPanel leem daqui, então não precisa passar props pelo App.

// Troque para true só enquanto estiver mexendo/testando. Em produção deixe false.
// Com false, a simulação não existe: tudo que estiver ligado compra de verdade.
export const DEV = false;

// "Quantidade infinita": um número enorme (Infinity vira null no JSON, então não serve).
// Assim o limite `comprados >= maxQtd` nunca é atingido, sem mexer na lógica de compra.
export const INFINITO = 1e9;

const CHAVE = 'pokemultidle-sniper-v1';
const MAX_LOGS = 60;

export const configPadrao = () => ({
  enabled: false,
  dryRun: DEV,                       // simulação só existe em modo dev
  rules: [],
  global: { shiny: null, p5: null, nota: null },
});

const VAZIA = configPadrao();
const SEM_LOGS = [];
const SEM_STATUS = {};

// "Ligado" NUNCA é restaurado: a cada abertura do app você religa de propósito.
function carregar() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) || '{}');
    const contas = {};
    for (const [slot, cfg] of Object.entries(bruto.contas ?? {})) {
      contas[slot] = { ...configPadrao(), ...cfg, enabled: false, dryRun: DEV ? cfg.dryRun !== false : false };
    }
    return contas;
  } catch {
    return {};
  }
}

let contas = carregar();   // slot -> config (salva no localStorage)
let logs = {};             // slot -> eventos recentes (só em memória)
let status = {};           // slot -> { socket, saldo }

const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f());
const assinar = (f) => { ouvintes.add(f); return () => ouvintes.delete(f); };
const persistir = () => {
  try { localStorage.setItem(CHAVE, JSON.stringify({ contas })); } catch { /* sem espaço */ }
};

// ---- catálogo de itens: lista fixa + o que o leitor aprende do jogo ----
const CHAVE_ITENS = 'pokemultidle-sniper-itens-v1';
const ESTATICOS = new Set(ITENS_MERCADO.map((i) => i.id));

function carregarItens() {
  try {
    const arr = JSON.parse(localStorage.getItem(CHAVE_ITENS) || '[]');
    return Object.fromEntries(arr.map((i) => [i.id, i]));
  } catch {
    return {};
  }
}
let aprendidos = carregarItens();   // id -> { id, name, cat, neg }

function montarCatalogo() {
  const mapa = new Map();
  for (const i of ITENS_MERCADO) mapa.set(i.id, { ...i, neg: true });
  for (const i of Object.values(aprendidos)) {
    const base = mapa.get(i.id);
    mapa.set(i.id, { id: i.id, name: i.name, cat: base ? base.cat : (i.cat || 'Outros'), neg: !!(i.neg || base) });
  }
  return [...mapa.values()].sort((a, b) => (Number(b.neg) - Number(a.neg)) || a.name.localeCompare(b.name));
}
let catalogoLista = montarCatalogo();

function persistirItens() {
  // só guarda o que é negociável e que a lista fixa não conhece (itens novos do jogo)
  const novos = Object.values(aprendidos).filter((i) => i.neg && !ESTATICOS.has(i.id));
  try { localStorage.setItem(CHAVE_ITENS, JSON.stringify(novos)); } catch { /* sem espaço */ }
}

// ---- hooks (o valor só muda de referência quando algo muda de verdade) ----
export const useSniperConfig = (slot) => useSyncExternalStore(assinar, () => contas[slot] ?? VAZIA);
export const useSniperLogs = (slot) => useSyncExternalStore(assinar, () => logs[slot] ?? SEM_LOGS);
export const useCatalogoItens = () => useSyncExternalStore(assinar, () => catalogoLista, () => catalogoLista);
export const useSniperStatus = (slot) => useSyncExternalStore(assinar, () => status[slot] ?? SEM_STATUS);

// ---- ações ----
export function salvarConfig(slot, cfg) {
  contas = { ...contas, [slot]: cfg };
  persistir();
  avisar();
}

export function desligarTudo() {
  contas = Object.fromEntries(Object.entries(contas).map(([s, c]) => [s, { ...c, enabled: false }]));
  persistir();
  avisar();
}

export function limparLogs(slot) {
  logs = { ...logs, [slot]: [] };
  avisar();
}

function somarComprados(slot, chave, qtd) {
  const cfg = contas[slot];
  if (!cfg) return;
  if (chave.startsWith('g:')) {
    const k = chave.slice(2);
    if (!cfg.global[k]) return;
    salvarConfig(slot, {
      ...cfg,
      global: { ...cfg.global, [k]: { ...cfg.global[k], comprados: (cfg.global[k].comprados || 0) + qtd } },
    });
  } else {
    salvarConfig(slot, {
      ...cfg,
      rules: cfg.rules.map((r) => (String(r.id) === chave ? { ...r, comprados: (r.comprados || 0) + qtd } : r)),
    });
  }
}

// Chamado pelo GameView com cada evento que vem do jogo: { tipo, dados }
export function registrarEvento(slot, ev) {
  const { tipo, dados = {} } = ev || {};
  const atualizar = (patch) => { status = { ...status, [slot]: { ...(status[slot] ?? {}), ...patch } }; };

  if (tipo === 'comprada') {
    somarComprados(slot, String(dados.chave), Number(dados.qtd) || 0);
    return;
  }

  if (tipo === 'log') logs = { ...logs, [slot]: [{ ...dados }, ...(logs[slot] ?? [])].slice(0, MAX_LOGS) };
  else if (tipo === 'preload') status = { ...status, [slot]: { preload: true } };   // página nova: recomeça o diagnóstico
  else if (tipo === 'instalado') atualizar({ instalado: true });
  else if (tipo === 'pronto') atualizar({ pronto: true, socket: !!dados.socket || !!status[slot]?.socket });
  else if (tipo === 'conectado') atualizar({ socket: true, url: dados.url });
  else if (tipo === 'trafego') atualizar({ trafego: dados });
  else if (tipo === 'saldo') atualizar({ socket: true, saldo: dados });
  else if (tipo === 'erro') atualizar({ erro: dados });
  else if (tipo === 'varredura') atualizar({ varredura: { ...(status[slot]?.varredura ?? {}), [dados.regra]: dados } });
  else if (tipo === 'catalogo') {
    for (const it of dados.itens || []) aprendidos[it.id] = it;
    catalogoLista = montarCatalogo();
    persistirItens();
  }
  else return;

  avisar();
}
