import { useSyncExternalStore } from 'react';
import { ITENS_MERCADO } from './itensMercado';
import { createStore } from '../../shared/createStore';

// Guarda a config do sniper POR CONTA (slot), os logs e o status ao vivo.

// Modo dev para simulação
export const DEV = false;

// "Quantidade infinita": um número enorme (Infinity vira null no JSON, então não serve).
// Assim o limite `comprados >= maxQtd` nunca é atingido, sem mexer na lógica de compra.
export const INFINITO = 1e9;
// true: lembra quais contas estavam LIGADAS ao fechar o app e as religa ao abrir. false: toda abertura começa desligada.
export const RESTAURAR_SNIPER_ATIVO = true;

const CHAVE = 'pokemultidle-sniper-v1';
const MAX_LOGS = 60;

// Status que são só ruído interno do sniper: nem entram no registro
// (assim também não ocupam as 60 vagas e empurram eventos úteis para fora).
const LOGS_IGNORADOS = new Set(['REFORCO', 'DISPARADO']);

export const configPadrao = () => ({
  enabled: false,
  dryRun: DEV,                       // simulação só existe em modo dev
  rules: [],
  global: { shiny: null, p5: null, nota: null },
});

const VAZIA = configPadrao();
const SEM_LOGS = [];
const SEM_STATUS = {};

function carregar() {
  let bruto;
  try {
    bruto = JSON.parse(localStorage.getItem(CHAVE) || '{}');
  } catch (err) {
    // ilegível: guarda uma cópia para recuperar à mão e começa vazio
    console.error('[sniper] configuração salva ilegível; cópia mantida em', `${CHAVE}.bak`, err);
    try { localStorage.setItem(`${CHAVE}.bak`, localStorage.getItem(CHAVE) || ''); } catch { /* ignora */ }
    return {};
  }
  const contas = {};
  for (const [slot, cfg] of Object.entries((bruto && bruto.contas) || {})) {
    contas[slot] = { ...configPadrao(), ...cfg, enabled: false, dryRun: DEV ? cfg.dryRun !== false : false };
    // só o "ligado" depende de RESTAURAR_SNIPER_ATIVO: se algo falhar aqui, a conta volta desligada,
    // mas as regras NUNCA se perdem (e o erro aparece no console).
    try {
      contas[slot].enabled = RESTAURAR_SNIPER_ATIVO === true && cfg.enabled === true;
    } catch (err) {
      console.error('[sniper] não consegui restaurar o "ligado" da conta', slot, err);
    }
  }
  return contas;
}

let contas = carregar();   // slot -> config (salva no localStorage)
let logs = {};             // slot -> eventos recentes (só em memória)
let status = {};           // slot -> { socket, saldo }

const { subscribe: assinar, emit: avisar } = createStore();
let fezBackup = false;
const persistir = () => {
  try {
    // antes da 1ª gravação da sessão, guarda o que estava salvo ao abrir o app (rede de segurança)
    if (!fezBackup) {
      fezBackup = true;
      const atual = localStorage.getItem(CHAVE);
      if (atual) localStorage.setItem(`${CHAVE}.bak`, atual);
    }
    localStorage.setItem(CHAVE, JSON.stringify({ contas }));
  } catch { /* sem espaço */ }
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

// ---- compra direta na loja pelo socket ----
// O GameView registra, por conta, a função que manda o pedido ao webview (ver registrarEnviador).
const enviadores = {};          // slot -> (pedido) => void
const pedidosLoja = new Map();  // reqId -> { resolve, reject, timer }
let seqLoja = 0;

export function registrarEnviador(slot, fn) {
  enviadores[slot] = fn;
  return () => { if (enviadores[slot] === fn) delete enviadores[slot]; };
}

// Compra { kind: 'ball' | 'item', id, qty } na conta `slot`. Resolve quando o jogo responde
// (ou depois de 4 s sem resposta, como "enviado"); rejeita se o jogo recusar ou não responder.
export function comprarLojaSocket(slot, { kind, id, qty }) {
  return new Promise((resolve, reject) => {
    const enviar = enviadores[slot];
    if (!enviar) { reject(new Error('A conta ainda não está pronta para comprar (o jogo não carregou).')); return; }
    const reqId = `${slot}-${Date.now()}-${++seqLoja}`;
    const timer = setTimeout(() => {
      pedidosLoja.delete(reqId);
      reject(new Error('O jogo não respondeu à compra.'));
    }, 8000);
    pedidosLoja.set(reqId, { resolve, reject, timer });
    try {
      enviar({ reqId, kind, id, qty });
    } catch (err) {
      clearTimeout(timer);
      pedidosLoja.delete(reqId);
      reject(err);
    }
  });
}

// Chamado pelo GameView com cada evento que vem do jogo: { tipo, dados }
export function registrarEvento(slot, ev) {
  const { tipo, dados = {} } = ev || {};
  const atualizar = (patch) => { status = { ...status, [slot]: { ...(status[slot] ?? {}), ...patch } }; };

  if (tipo === 'loja') {   // resposta de uma compra na loja
    const pedido = pedidosLoja.get(dados.reqId);
    if (pedido) {
      clearTimeout(pedido.timer);
      pedidosLoja.delete(dados.reqId);
      if (dados.ok) pedido.resolve(dados);
      else pedido.reject(new Error(dados.erro || 'O jogo recusou a compra.'));
    }
    return;
  }

  if (tipo === 'comprada') {
    somarComprados(slot, String(dados.chave), Number(dados.qtd) || 0);
    return;
  }

  if (tipo === 'log') {
    if (LOGS_IGNORADOS.has(dados.status)) return;
    logs = { ...logs, [slot]: [{ ...dados }, ...(logs[slot] ?? [])].slice(0, MAX_LOGS) };
  }
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
  else if (tipo === 'captura') {
    // modo descoberta (ver CAPTURA no webview-preload.js): guarda e escreve no console do app
    (window.__pmCaptura = window.__pmCaptura || []).push({ slot, ...dados });
    if (window.__pmCaptura.length > 200) window.__pmCaptura.shift();   // não cresce sem parar
    console.log(`[captura:${dados.dir}]`, dados.msg);
    return;
  }
  else return;

  avisar();
}
