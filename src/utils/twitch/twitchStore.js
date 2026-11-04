import { useSyncExternalStore } from 'react';

// Config por conta (salva no localStorage) + estado ao vivo vindo do processo principal (window.twitch).
const CHAVE = 'pokemultidle-twitch-v1';
const MAX_LINHAS = 40;

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
    for (const [slot, s] of Object.entries(st || {})) setEstado(slot, { estado: s.estado, codigo: s.codigo, linhas: s.linhas || [] });
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
  if (!r.ok) { setEstado(slot, { estado: 'erro', mensagem: r.mensagem }); avisar(); }
  return r;
}

export const pararTwitch = (slot) => ponte()?.parar(String(slot));
export const pararTodasTwitch = () => ponte()?.pararTodas();

// Inicia só as contas com usuário preenchido.
export async function iniciarTodasTwitch(slots) {
  for (const slot of slots) {
    if (String(cfgDe(slot).username).trim()) await iniciarTwitch(slot);
  }
}
