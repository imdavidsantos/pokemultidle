import { useSyncExternalStore } from 'react';

// Config por conta (salva no localStorage) + estado ao vivo vindo do processo principal (window.twitch).
const CHAVE = 'pokemultidle-twitch-v1';
const CHAVE_AUTO = 'pokemultidle-twitch-auto-v1';       // retomar as contas ao abrir o app
const CHAVE_LIGADAS = 'pokemultidle-twitch-ligadas-v1'; // contas que ficaram ligadas (as que serão retomadas)
const CHAVE_SALDOS = 'pokemultidle-twitch-saldos-v1';   // último saldo conhecido por conta e canal
const MAX_LINHAS = 40;
const MAX_CANAIS = 100;   // por conta (com "canais que sigo" ligado podem ser muitos)
const CHAVE_PARCEIROS = 'pokemultidle-twitch-parceiros-v1';   // última lista de canais parceiros vista no jogo
const DIA_MS = 24 * 60 * 60 * 1000;
const RE_SLUG = /^[A-Za-z0-9_]{1,25}$/;   // login da Twitch

export const configPadrao = () => ({
  username: '',          // usuário da Twitch desta conta
  token: '',             // OPCIONAL: cookie auth-token do twitch.tv, só para ver pontos/resgatar recompensas pelo app (o miner não usa)
  prioridade: [],        // logins de canais parceiros, em ordem de prioridade (o de cima é assistido primeiro)
  desativados: [],       // logins de parceiros que o usuário desmarcou (parceiro novo entra ativado por padrão)
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
  // tGanho = quando o saldo SUBIU pela última vez (o resumo "Farmando" usa isso; `t` também muda a cada consulta).
  // Saldo abreviado do log (1.08k) não serve para comparar: só conta como alta o ganho informado ou a diferença entre saldos exatos.
  const antes = saldos[s]?.[canal];
  const exato = antes && !antes.aprox && !dados.aprox;
  const subiu = antes
    ? (exato && Number(dados.pontos) > Number(antes.pontos)) || (dados.ganho || 0) > (antes.ganho || 0)
    : (dados.ganho || 0) > 0;
  const atual = { ...(saldos[s] ?? {}), [canal]: { ...dados, tGanho: subiu ? (dados.t || Date.now()) : antes?.tGanho } };
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
  agendarReinicio();   // se a lista de streamers mudou com o miner ligado, reinicia (com espera, juntando vários cliques)
}

// ---------- canais parceiros (vêm do jogo: estado.twitch.oficiais) ----------
// { lista: [{ slug, nome }], atualizadoEm (última vez que a lista MUDOU), checadoEm (última vez que o jogo confirmou),
//   novos: [nomes que entraram na última mudança] }
const PARCEIROS_VAZIO = { lista: [], atualizadoEm: 0, checadoEm: 0, novos: [] };
let parceiros = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_PARCEIROS) || 'null');
    return v && Array.isArray(v.lista) ? { ...PARCEIROS_VAZIO, ...v } : PARCEIROS_VAZIO;
  } catch { return PARCEIROS_VAZIO; }
})();
const persistirParceiros = () => { try { localStorage.setItem(CHAVE_PARCEIROS, JSON.stringify(parceiros)); } catch { /* sem espaço */ } };
export const useTwitchParceiros = () => useSyncExternalStore(assinar, () => parceiros);

const slugsParceiros = () => parceiros.lista.map((p) => p.slug);

// Lista final enviada ao miner: só parceiros ativados; os da prioridade vêm primeiro (na ordem escolhida),
// depois os demais na ordem da lista do jogo.
export function streamersDaConta(cfg) {
  const off = new Set(cfg.desativados || []);
  const ativos = slugsParceiros().filter((s) => !off.has(s));
  const prio = (cfg.prioridade || []).filter((s) => ativos.includes(s));
  return [...new Set([...prio, ...ativos])];
}

// Prioridade limpa: só logins que ainda existem na lista de parceiros.
export const prioridadeDaConta = (cfg) => (cfg.prioridade || []).filter((s) => slugsParceiros().includes(s));

export function alternarStreamerTwitch(slot, slug, ativo) {
  const off = new Set(cfgDe(slot).desativados || []);
  if (ativo) off.delete(slug); else off.add(slug);
  salvarTwitch(slot, { desativados: [...off] });
}

export const definirTodosTwitch = (slot, ativo) => salvarTwitch(slot, { desativados: ativo ? [] : slugsParceiros() });

export function alternarPrioridadeTwitch(slot, slug) {
  const p = prioridadeDaConta(cfgDe(slot));
  salvarTwitch(slot, { prioridade: p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug] });
}

export function moverPrioridadeTwitch(slot, slug, delta) {
  const p = prioridadeDaConta(cfgDe(slot));
  const i = p.indexOf(slug);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= p.length) return;
  [p[i], p[j]] = [p[j], p[i]];
  salvarTwitch(slot, { prioridade: p });
}

const iniciadoCom = {};   // slot -> lista de streamers com que o miner foi iniciado (para saber se precisa reiniciar)
const emUso = (slot) => ['rodando', 'iniciando', 'login'].includes((estados[String(slot)] ?? SEM_ESTADO).estado);

const esperarParado = async (slot, ms = 15000) => {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (!emUso(slot)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};

// O miner só lê o config ao iniciar, então para entrar um streamer novo é preciso reiniciar a conta.
// Só reinicia contas ligadas cuja lista de streamers mudou. Não mexe no "ligadas" (continua ligada).
let tReinicio = null;
let reiniciando = false;
function agendarReinicio() {
  clearTimeout(tReinicio);
  tReinicio = setTimeout(async () => {
    if (reiniciando || !ponte()) return;
    reiniciando = true;
    try {
      for (const slot of [...ligadas]) {
        const cfg = cfgDe(slot);
        if (!emUso(slot)) continue;
        if (iniciadoCom[slot] === streamersDaConta(cfg).join('\n')) continue;
        await ponte().parar(String(slot));
        if (await esperarParado(slot)) {
          await iniciarTwitch(slot);
          await new Promise((r) => setTimeout(r, 2500));   // espaça uma conta da outra
        }
      }
    } finally { reiniciando = false; }
  }, 5000);   // espera: várias contas do jogo mandam a mesma lista quase junto
}

// Chamado quando uma tela do jogo informa a lista de parceiros (dados = { oficiais: [...] }).
// Aceita `slug` (mandado pelo preload) ou `login` (formato cru do jogo).
export function atualizarParceirosTwitch(dados) {
  const lista = (dados?.oficiais || [])
    .map((o) => (o ? { ...o, id: String(o.slug || o.login || '') } : null))
    .filter((o) => o && o.ativo !== false && RE_SLUG.test(o.id))
    .map((o) => ({ slug: o.id.toLowerCase(), nome: String(o.nome || o.id) }));
  if (!lista.length) return;
  const agora = Date.now();
  const antes = new Set(parceiros.lista.map((p) => p.slug));
  const depois = new Set(lista.map((p) => p.slug));
  const novos = lista.filter((p) => !antes.has(p.slug)).map((p) => p.nome);
  const saiu = [...antes].some((s) => !depois.has(s));
  const mudou = novos.length > 0 || saiu;
  parceiros = mudou
    ? { lista, atualizadoEm: agora, checadoEm: agora, novos: antes.size ? novos : [] }   // na 1ª vez não conta como "novos"
    : { ...parceiros, checadoEm: agora };
  persistirParceiros();
  avisar();
  agendarReinicio();   // também cobre o caso de o miner ter subido antes da lista chegar
}

// Opcional: o app registra aqui uma função que faz o jogo mandar o estado de novo (ex.: recarregar uma tela do jogo).
const atualizadores = new Set();   // uma função por tela do jogo; basta chamar uma
export function definirAtualizadorParceirosTwitch(fn) {
  if (typeof fn !== 'function') return () => {};
  atualizadores.add(fn);
  return () => atualizadores.delete(fn);
}

let verificando = false;
// Verifica a cada hora; se a lista não foi confirmada pelo jogo há 24 h, pede uma nova (se houver atualizador).
export function iniciarVerificacaoParceirosTwitch() {
  if (verificando) return;
  verificando = true;
  const checar = () => {
    if (Date.now() - (parceiros.checadoEm || 0) >= DIA_MS) {
      try { [...atualizadores][0]?.(); } catch { /* sem tela do jogo agora */ }
    }
    agendarReinicio();
  };
  setInterval(checar, 60 * 60 * 1000);
  setTimeout(checar, 30000);   // logo depois de abrir o app
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
  const cfg = cfgDe(slot);
  const streamers = streamersDaConta(cfg).join('\n');   // parceiros ativados, prioridade primeiro
  if (!streamers) {
    const mensagem = parceiros.lista.length ? 'Ative pelo menos um streamer parceiro.' : 'A lista de parceiros ainda não chegou do jogo.';
    setEstado(slot, { estado: 'erro', mensagem });
    avisar();
    return { ok: false, mensagem };
  }
  const r = await t.iniciar(String(slot), { ...cfg, streamers });
  if (r.ok) { iniciadoCom[String(slot)] = streamers; marcarLigada(slot, true); }
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

// ---------- saldo de pontos pela API (token opcional) ----------
// O processo principal consulta a Twitch com o token (window.twitch.pontos) e o resultado entra no mesmo `saldos`
// que o painel já lê. Funciona com o miner parado. `ganho` aqui = soma das altas vistas entre uma consulta e outra.
const SEM_STATUS_PONTOS = { carregando: false, erro: '', t: 0 };
let statusPontos = {};   // slot -> { carregando, erro, t (última consulta ok) }
const setStatusPontos = (slot, patch) => {
  const k = String(slot);
  statusPontos = { ...statusPontos, [k]: { ...(statusPontos[k] ?? SEM_STATUS_PONTOS), ...patch } };
  avisar();
};
export const useTwitchPontosStatus = (slot) => useSyncExternalStore(assinar, () => statusPontos[String(slot)] ?? SEM_STATUS_PONTOS);

const buscandoPontos = new Set();
export async function buscarPontosTwitch(slot) {
  const k = String(slot);
  const t = ponte();
  if (!t?.pontos) return { ok: false, mensagem: 'Disponível só no app desktop.' };
  if (buscandoPontos.has(k)) return { ok: true };
  const cfg = cfgDe(k);
  if (!String(cfg.token || '').trim()) return { ok: false, mensagem: 'Sem token.' };   // token é opcional: sem ele vale só o log do miner
  const slugs = slugsParceiros();
  if (!slugs.length) return { ok: false, mensagem: 'A lista de parceiros ainda não chegou do jogo.' };

  buscandoPontos.add(k);
  setStatusPontos(k, { carregando: true });
  try {
    const r = await t.pontos({ token: cfg.token }, slugs);
    const agora = Date.now();
    for (const [canal, v] of Object.entries(r?.saldos || {})) {
      const antes = saldos[k]?.[canal];
      const subiu = antes && !antes.aprox && v.pontos > antes.pontos ? v.pontos - antes.pontos : 0;
      guardarSaldo(k, canal, {
        pontos: v.pontos, texto: String(v.pontos), aprox: false,
        ganho: (antes?.ganho || 0) + subiu, online: antes?.online, t: agora,
      });
    }
    const falhas = Object.keys(r?.erros || {}).length;
    const erro = r?.ok ? (falhas ? `${falhas} canal(is) sem resposta.` : '') : (r?.mensagem || 'Falha ao consultar a Twitch.');
    setStatusPontos(k, { carregando: false, erro, ...(r?.ok ? { t: agora } : {}) });
    return r;
  } catch (e) {
    setStatusPontos(k, { carregando: false, erro: e?.message || 'Falha ao consultar a Twitch.' });
    return { ok: false, mensagem: e?.message };
  } finally { buscandoPontos.delete(k); }
}

// ---------- recompensas de um streamer (pedidas com o token) ----------
const SEM_REC = { carregando: false, erro: '', lista: [], canalId: '', t: 0 };
let recompensas = {};   // "slot:slug" -> { carregando, erro, lista, canalId, t }
const setRec = (chave, patch) => {
  recompensas = { ...recompensas, [chave]: { ...(recompensas[chave] ?? SEM_REC), ...patch } };
  avisar();
};
export const useTwitchRecompensas = (slot, slug) => useSyncExternalStore(assinar, () => recompensas[`${slot}:${slug}`] ?? SEM_REC);

export async function buscarRecompensasTwitch(slot, slug) {
  const chave = `${slot}:${slug}`;
  const t = ponte();
  if (!t?.recompensas) return { ok: false, mensagem: 'Disponível só no app desktop.' };
  if (!String(cfgDe(slot).token || '').trim()) {
    setRec(chave, { carregando: false, erro: 'Cole o token da Twitch no painel Twitch (campo opcional) para ver e resgatar recompensas.' });
    return { ok: false, mensagem: 'Sem token.' };
  }
  if (recompensas[chave]?.carregando) return { ok: true };
  setRec(chave, { carregando: true, erro: '' });
  try {
    const r = await t.recompensas({ token: cfgDe(slot).token }, slug);
    setRec(chave, r?.ok
      ? { carregando: false, erro: '', lista: r.lista || [], canalId: r.canalId || '', t: Date.now() }
      : { carregando: false, erro: r?.mensagem || 'Falha ao buscar as recompensas.' });
    return r;
  } catch (e) {
    setRec(chave, { carregando: false, erro: e?.message || 'Falha ao buscar as recompensas.' });
    return { ok: false, mensagem: e?.message };
  }
}

// Resgate em andamento / último resultado, por conta (só um por vez, para não gastar pontos em dobro).
const SEM_RESGATE = { id: '', msg: '', ok: true };
let resgate = {};   // slot -> { id (em andamento), msg, ok }
const setResgate = (slot, patch) => { resgate = { ...resgate, [String(slot)]: { ...(resgate[String(slot)] ?? SEM_RESGATE), ...patch } }; avisar(); };
export const useTwitchResgate = (slot) => useSyncExternalStore(assinar, () => resgate[String(slot)] ?? SEM_RESGATE);

export async function resgatarTwitch(slot, slug, rec, texto = '') {
  const t = ponte();
  if (!t?.resgatar) return { ok: false, mensagem: 'Disponível só no app desktop.' };
  if ((resgate[String(slot)] ?? SEM_RESGATE).id) return { ok: false, mensagem: 'Já há um resgate em andamento.' };
  const canalId = recompensas[`${slot}:${slug}`]?.canalId;
  if (!canalId) {
    setResgate(slot, { id: '', msg: 'Atualize a lista de recompensas antes de resgatar.', ok: false });
    return { ok: false, mensagem: 'Sem id do canal.' };
  }
  setResgate(slot, { id: rec.id, msg: '', ok: true });
  try {
    const r = await t.resgatar({ token: cfgDe(slot).token }, slug, rec.id, texto, canalId, rec.custo, { titulo: rec.tituloOriginal, prompt: rec.promptOriginal });
    setResgate(slot, { id: '', msg: r?.mensagem || (r?.ok ? 'Resgatado! Chegará no jogo em 1 minuto!' : 'Falha ao resgatar.'), ok: !!r?.ok });
    if (r?.ok) { buscarPontosTwitch(slot); buscarRecompensasTwitch(slot, slug); }   // atualiza saldo e limites
    return r;
  } catch (e) {
    setResgate(slot, { id: '', msg: e?.message || 'Falha ao resgatar.', ok: false });
    return { ok: false, mensagem: e?.message };
  }
}
