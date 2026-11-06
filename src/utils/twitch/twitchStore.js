import { useSyncExternalStore } from 'react';

// Config por conta (salva no localStorage) + estado ao vivo vindo do processo principal (window.twitch).
const CHAVE = 'pokemultidle-twitch-v1';
const CHAVE_AUTO = 'pokemultidle-twitch-auto-v1';       // retomar as contas ao abrir o app
const CHAVE_LIGADAS = 'pokemultidle-twitch-ligadas-v1'; // contas que ficaram ligadas (as que serão retomadas)
const CHAVE_SALDOS = 'pokemultidle-twitch-saldos-v1';   // último saldo conhecido por conta e canal
const MAX_LINHAS = 40;
const MAX_CANAIS = 100;   // por conta (com "canais que sigo" ligado podem ser muitos)

export const configPadrao = () => ({
  username: '',          // usuário da Twitch desta conta
  streamers: '',         // um por linha ou separados por vírgula
  seguidores: false,     // também assistir canais que a conta segue
  chat: 'ONLINE',        // presença no chat: ONLINE | ALWAYS | NEVER | OFFLINE
  drops: false,          // resgatar drops (desligado por padrão)
  moments: true,         // resgatar moments automaticamente
  streak: true,
  raid: false,
  assistidos: 2,         // 1 ou 2 streams ao mesmo tempo
});

const SEM_ESTADO = { estado: 'parado', codigo: null, mensagem: '', linhas: [] };

function carregar() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || '{}'); } catch { return {}; }
}
let contas = carregar();      // slot -> config
let estados = {};             // slot -> { estado, codigo, mensagem, linhas }
let checagem = null;          // resultado de twitch.checar()
let pip = [];                 // linhas da instalação de dependências

const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f());
const assinar = (f) => { ouvintes.add(f); return () => ouvintes.delete(f); };
const persistir = () => { try { localStorage.setItem(CHAVE, JSON.stringify(contas)); } catch { /* sem espaço */ } };

// Contas que o usuário deixou ligadas: entra ao iniciar, sai ao parar (botão Parar / Parar todas).
// Fechar o app NÃO mexe nisso, por isso elas voltam a ligar na próxima abertura.
let ligadas = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_LIGADAS) || '[]');
    return new Set(Array.isArray(v) ? v.map(String) : []);
  } catch { return new Set(); }
})();
const salvarLigadas = () => { try { localStorage.setItem(CHAVE_LIGADAS, JSON.stringify([...ligadas])); } catch { /* sem espaço */ } };
const marcarLigada = (slot, ligada) => {
  const s = String(slot);
  if (ligada === ligadas.has(s)) return;
  if (ligada) ligadas.add(s); else ligadas.delete(s);
  salvarLigadas();
};

// Retomar ao abrir o app (padrão: ligado)
let autoIniciar = (() => { try { return localStorage.getItem(CHAVE_AUTO) !== '0'; } catch { return true; } })();
export const autoIniciarAtivo = () => autoIniciar;
export const useTwitchAutoIniciar = () => useSyncExternalStore(assinar, () => autoIniciar);
export function definirAutoIniciar(valor) {
  autoIniciar = !!valor;
  try { localStorage.setItem(CHAVE_AUTO, autoIniciar ? '1' : '0'); } catch { /* sem espaço */ }
  avisar();
}

// Saldo de pontos lido do log do miner: slot -> { canal -> { pontos, texto, aprox, ganho, online, t } }.
// `texto` é como o miner escreveu (pode vir abreviado, ex.: 61.38k, e então `aprox` é true); `ganho` é a soma
// dos "+N" da sessão; `t` é quando foi visto pela última vez. Fica salvo para aparecer mesmo com o miner parado.
const SEM_SALDOS = {};
let saldos = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_SALDOS) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
})();
let tSaldos = null;
const persistirSaldos = () => {   // agrupa as gravações: chegam várias por minuto
  if (tSaldos) return;
  tSaldos = setTimeout(() => {
    tSaldos = null;
    try { localStorage.setItem(CHAVE_SALDOS, JSON.stringify(saldos)); } catch { /* sem espaço */ }
  }, 2000);
};
function guardarSaldo(slot, canal, dados) {
  const s = String(slot);
  const atual = { ...(saldos[s] ?? {}), [canal]: dados };
  const nomes = Object.keys(atual);
  if (nomes.length > MAX_CANAIS) {   // mantém só os vistos mais recentemente
    nomes.sort((a, b) => (atual[b].t || 0) - (atual[a].t || 0)).slice(MAX_CANAIS).forEach((n) => { delete atual[n]; });
  }
  saldos = { ...saldos, [s]: atual };
  persistirSaldos();
}
export const useTwitchSaldos = (slot) => useSyncExternalStore(assinar, () => saldos[String(slot)] ?? SEM_SALDOS);
export function limparSaldosTwitch(slot) {
  const resto = { ...saldos };
  delete resto[String(slot)];
  saldos = resto;
  persistirSaldos();
  avisar();
}

const ponte = () => (typeof window !== 'undefined' ? window.twitch : undefined);
export const twitchDisponivel = () => !!ponte();

const cfgDe = (slot) => ({ ...configPadrao(), ...(contas[String(slot)] || {}) });
const VAZIA = configPadrao();
const cache = {};   // slot -> última config mesclada (mantém a referência estável para o React)
const snapshotCfg = (slot) => {
  const bruta = contas[String(slot)];
  if (!bruta) return VAZIA;
  const antes = cache[slot];
  if (antes && antes.bruta === bruta) return antes.mesclada;
  const mesclada = { ...configPadrao(), ...bruta };
  cache[slot] = { bruta, mesclada };
  return mesclada;
};

export const useTwitchConfig = (slot) => useSyncExternalStore(assinar, () => snapshotCfg(slot));
export const useTwitchEstado = (slot) => useSyncExternalStore(assinar, () => estados[String(slot)] ?? SEM_ESTADO);
export const useTwitchChecagem = () => useSyncExternalStore(assinar, () => checagem);
export const useTwitchPip = () => useSyncExternalStore(assinar, () => pip);

export function salvarTwitch(slot, patch) {
  contas = { ...contas, [String(slot)]: { ...cfgDe(slot), ...patch } };
  persistir();
  avisar();
}

const setEstado = (slot, patch) => {
  const s = String(slot);
  estados = { ...estados, [s]: { ...(estados[s] ?? SEM_ESTADO), ...patch } };
};

function aoEvento(ev) {
  if (!ev) return;
  if (ev.tipo === 'pip') { pip = [...pip, ev.linha].slice(-MAX_LINHAS); avisar(); return; }
  if (ev.tipo === 'estado') {
    setEstado(ev.slot, { estado: ev.estado, codigo: ev.codigo ?? null, mensagem: ev.mensagem || '' });
  } else if (ev.tipo === 'log') {
    const atual = estados[ev.slot] ?? SEM_ESTADO;
    setEstado(ev.slot, { linhas: [...atual.linhas, ev.linha].slice(-MAX_LINHAS) });
  } else if (ev.tipo === 'saldo') {
    guardarSaldo(ev.slot, ev.canal, { pontos: ev.pontos, texto: ev.texto, aprox: !!ev.aprox, ganho: ev.ganho || 0, online: ev.online, t: ev.t || Date.now() });
  } else return;
  avisar();
}

let ligado = false;
export async function iniciarPonteTwitch() {
  const t = ponte();
  if (!t || ligado) return;
  ligado = true;
  t.aoMudar(aoEvento);
  try {
    const st = await t.status();   // reaproveita o que já estava rodando (ex.: recarregou a tela)
    for (const [slot, s] of Object.entries(st || {})) {
      setEstado(slot, { estado: s.estado, codigo: s.codigo, linhas: s.linhas || [] });
      for (const [canal, v] of Object.entries(s.saldos || {})) guardarSaldo(slot, canal, v);
    }
  } catch { /* sem status */ }
  await checarTwitch();
}

export async function checarTwitch() {
  const t = ponte();
  if (!t) return null;
  try { checagem = await t.checar(); } catch (e) { checagem = { ok: false, mensagem: e?.message || 'Falha ao checar.' }; }
  avisar();
  return checagem;
}

export async function instalarTwitch() {
  const t = ponte();
  if (!t) return;
  pip = [];
  avisar();
  const r = await t.instalar();
  pip = [...pip, r.mensagem];
  avisar();
  await checarTwitch();
}

export async function iniciarTwitch(slot) {
  const t = ponte();
  if (!t) return { ok: false, mensagem: 'Disponível só no app desktop.' };
  const r = await t.iniciar(String(slot), cfgDe(slot));
  if (r.ok) marcarLigada(slot, true);
  else { setEstado(slot, { estado: 'erro', mensagem: r.mensagem }); avisar(); }
  return r;
}

export const pararTwitch = (slot) => { marcarLigada(slot, false); return ponte()?.parar(String(slot)); };
export const pararTodasTwitch = () => { ligadas = new Set(); salvarLigadas(); return ponte()?.pararTodas(); };

// Inicia só as contas com usuário preenchido. intervaloMs espaça uma conta da outra.
export async function iniciarTodasTwitch(slots, intervaloMs = 0) {
  let primeira = true;
  for (const slot of slots) {
    if (!String(cfgDe(slot).username).trim()) continue;
    if (!primeira && intervaloMs) await new Promise((r) => setTimeout(r, intervaloMs));
    primeira = false;
    await iniciarTwitch(slot);
  }
}

// Usado ao abrir o app: retoma só as contas que estavam ligadas quando o app foi fechado.
// Liga a ponte, confere a pasta do miner e só então inicia. Se a pasta/Python/dependências não
// estiverem prontos, não inicia nada (o painel mostra o motivo).
export async function iniciarAutomaticoTwitch(slots, intervaloMs = 0) {
  const retomar = slots.filter((s) => ligadas.has(String(s)));
  if (!retomar.length) return { ok: true, mensagem: 'Nenhuma conta para retomar.' };   // nem checa o Python
  if (!ponte()) return { ok: false, mensagem: 'Disponível só no app desktop.' };
  await iniciarPonteTwitch();
  const chk = checagem ?? (await checarTwitch());
  if (!chk?.ok) return { ok: false, mensagem: chk?.mensagem || 'Miner não está pronto.' };
  await iniciarTodasTwitch(retomar, intervaloMs);
  return { ok: true };
}
