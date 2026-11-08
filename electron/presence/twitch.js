// Gerencia o miner da pasta "mods/".
// a partir das configurações do app e roda um processo Python por conta (até 4).
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { net } = require('electron');
const crypto = require('crypto');
const { NOME_MODS, rodar, acharRaiz: acharRaizEm, localizarPasta: localizarPastaMiner, envPython: envPythonMiner, limparLogsAntigos, textoCurto } = require('./miner');

const NOME_MINER = 'Twitch-Channel-Points-Miner-v3-3.19.6';   // subpasta deste miner dentro de mods/
const MAX_LINHAS = 200;
// eslint-disable-next-line no-control-regex -- de propósito: tira as cores ANSI (ESC[...m) das linhas do miner
const ANSI = /\x1b\[[0-9;]*m/g;
const RE_USUARIO = /^[A-Za-z0-9_]{1,25}$/;       // vale para a conta e para os streamers
const CHATS = ['ONLINE', 'ALWAYS', 'NEVER', 'OFFLINE'];
const DIAS_LOGS = 3;   // quantos dias de log ficam guardados (o miner e o app apagam os mais antigos)

const isRaiz = (dir) => {
  try { return fs.existsSync(path.join(dir, 'TwitchChannelPointsMiner', 'runner.py')); } catch { return false; }
};


// ---------- saldo de pontos (lido do log do miner) ----------
// O miner escreve o saldo do canal em dois formatos, conforme o logger_settings.less:
//   completo:  Streamer(username=canal, channel_id=1, channel_points=330) is Online!
//   compacto:  canal (1.08k points) is Online!          (less=True, o que o app usa)
// Números grandes podem vir abreviados (1.08k), então aceitamos o sufixo k/m/b (valor aproximado).
const RE_SALDO = /Streamer\(username=([A-Za-z0-9_]{1,25}),[^)]*?channel_points=([0-9][0-9.,]*[kKmMbB]?)\)/;
// No formato compacto só vale "canal (N points)" seguido de uma das mensagens do miner, para um título de
// live com "(500 points)" no texto não virar saldo.
const RE_SALDO_COMPACTO = /(?<=^|\s)([A-Za-z0-9_]{1,25}) \(([0-9][0-9.,]*[kKmMbB]?) points\)(?= is (?:Online|Offline)!| is streaming | - Reason:)/;

function lerPontos(token) {
  const m = /^([0-9][0-9.,]*)([kKmMbB]?)$/.exec(token);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const mult = { '': 1, k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()];
  return { pontos: Math.round(n * mult), aprox: m[2] !== '' };
}

// Devolve { canal, pontos, texto, aprox, ganho, online } ou null.
//  - ganho: o "+N" quando a linha é de um ganho ("+10 -> canal (1.09k points) - Reason: WATCH"); só vale se o
//    "+N" vier logo antes do nome do canal, para um título de live com "+10" não ser confundido com ganho.
//  - online: true/false quando a linha diz "is Online!/is Offline!/is streaming"; undefined nas demais.
function lerSaldo(linha) {
  const a = RE_SALDO.exec(linha);
  const b = RE_SALDO_COMPACTO.exec(linha);
  const m = a && b ? (a.index <= b.index ? a : b) : (a || b);
  if (!m) return null;
  const p = lerPontos(m[2]);
  if (!p) return null;
  const g = /\+(\d+)\s+\S{1,3}\s+$/.exec(linha.slice(0, m.index));
  const ganho = g && /Reason:/.test(linha) ? Number(g[1]) : 0;
  const resto = linha.slice(m.index + m[0].length);
  let online;
  if (/^\s*is (?:Online!|streaming )/.test(resto)) online = true;
  else if (/^\s*is Offline!/.test(resto)) online = false;
  return { canal: m[1].toLowerCase(), pontos: p.pontos, texto: m[2], aprox: p.aprox, ganho, online };
}

// ---------- pontos e recompensas pela API da Twitch (token OPCIONAL do usuário; o miner não usa) ----------
// A Twitch não tem endereços REST para isso: o site usa o GraphQL (gql.twitch.tv) com "persisted queries", cada uma
// identificada por um hash que a Twitch troca de tempos em tempos. Se parar de funcionar, confira no DevTools
// (twitch.tv logado > Network > filtrar "gql") e copie o sha256Hash de dentro de extensions.persistedQuery:
//   HASH_CONTEXTO = pedido "ChannelPointsContext" (aparece ao abrir o baú de pontos / lista de recompensas)
//   HASH_RESGATE  = pedido "RedeemCustomReward" (aparece ao resgatar uma recompensa na mão). Vazio = resgate desligado.
const URL_GQL = 'https://gql.twitch.tv/gql';
const CLIENT_ID_WEB = 'kimne78kx3ncx6brgo4mv6wki5h1ko';   // o do site: o cookie auth-token só vale com ele
const HASH_CONTEXTO = '1530a003a7d374b0380b79db0be0534f30ff46e61cffa2bc0e2468a909fbc024';
const HASH_RESGATE = 'd56249a7adb4978898ea3412e196688d4ac3cea1c0c2dfd65561d229ea5dcc42';
const LOTE_PONTOS = 8;           // canais por pedido (o GraphQL aceita vários numa lista só)
const PONTOS_ESPERA_MS = 200;

const MSG_TOKEN = 'Token da Twitch inválido ou expirado (use o cookie auth-token do twitch.tv).';
const MSG_HASH = 'A Twitch trocou o código da consulta (hash). Copie o novo do DevTools (veja o comentário em presence/twitch.js).';
const RE_TOKEN_TW = /^[A-Za-z0-9]{20,64}$/;
const RE_ID_REC = /^[A-Za-z0-9-]{8,64}$/;
const RE_ID_CANAL = /^[0-9]{1,20}$/;

const limparTokenTw = (t) => String(t || '').trim().replace(/^oauth\s*:?\s*/i, '');

function tokenValido(cfgBruta) {
  const token = limparTokenTw(cfgBruta?.token);
  if (!token) return { erro: 'Cole o token da Twitch (campo opcional no painel Twitch).' };
  if (!RE_TOKEN_TW.test(token)) return { erro: 'Token da Twitch com formato inválido (use só o valor do cookie auth-token).' };
  return { token };
}

async function chamarGql(token, corpo) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await net.fetch(URL_GQL, {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}`, 'Client-Id': CLIENT_ID_WEB, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    });
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: r.status, json, texto };
  } catch (e) {
    return { status: 0, json: null, texto: '', erro: e?.message || 'Falha de rede.' };
  } finally { clearTimeout(to); }
}

// Erro da resposta inteira (rede, token recusado, limite). '' = a resposta chegou bem.
function erroDaResposta(r) {
  if (r.status === 0) return r.erro;
  const j = r.json;
  const primeiro = Array.isArray(j) ? j[0] : j;
  const msg = String(primeiro?.message ?? primeiro?.error ?? '');
  if (r.status === 401 || /unauthorized|invalid.*token/i.test(msg)) return MSG_TOKEN;
  if (r.status === 429) return 'A Twitch limitou os pedidos (429). Tente de novo em instantes.';
  if (!(r.status >= 200 && r.status < 300)) return textoCurto(msg, 120) || `HTTP ${r.status}`;
  return '';
}

const operacaoContexto = (slug) => ({
  operationName: 'ChannelPointsContext',
  variables: { channelLogin: slug },
  extensions: { persistedQuery: { version: 1, sha256Hash: HASH_CONTEXTO } },
});

// Lê um ChannelPointsContext: saldo, id do canal e (se vierem) as recompensas.
// Devolve { fatal } | { erro } | { pontos, canalId, rewards }.
function lerContexto(el) {
  const msg = textoCurto(el?.errors?.[0]?.message ?? el?.message ?? el?.error ?? '', 120);
  if (/PersistedQueryNotFound/i.test(msg)) return { fatal: MSG_HASH };
  if (/unauthorized|invalid.*token/i.test(msg)) return { fatal: MSG_TOKEN };
  const comunidade = el?.data?.community;
  if (!comunidade) return { erro: msg || 'Canal não encontrado.' };
  const canal = comunidade.channel;
  if (!canal?.self) return { fatal: MSG_TOKEN };   // sem usuário logado = token não foi aceito
  const n = Number(canal.self.communityPoints?.balance);
  const customs = canal.communityPointsSettings?.customRewards;
  return {
    pontos: Number.isFinite(n) ? Math.trunc(n) : null,
    canalId: String(canal.id ?? comunidade.id ?? ''),
    rewards: Array.isArray(customs) ? customs : null,
  };
}

function normalizarRecompensas(lista) {
  return lista.map((r) => {
    const cor = String(r?.backgroundColor ?? '');
    return {
      id: String(r?.id ?? ''),
      titulo: textoCurto(r?.title, 80),
      descricao: textoCurto(r?.prompt, 200),
      tituloOriginal: String(r?.title ?? ''),
      promptOriginal: r?.prompt == null ? null : String(r.prompt),
      custo: Math.max(0, Math.trunc(Number(r?.cost)) || 0),
      ativo: r?.isEnabled !== false && !r?.isPaused && r?.isInStock !== false,
      pedeTexto: !!r?.isUserInputRequired,
      cor: /^#[0-9a-f]{3,8}$/i.test(cor) ? cor : '',
    };
  }).filter((r) => RE_ID_REC.test(r.id) && r.titulo);
}

// cfgBruta = { token }, slugs = logins dos canais. Devolve { ok, mensagem, saldos: { slug: { pontos } }, erros: { slug: texto } }.
async function buscarPontos(cfgBruta, slugsBrutos) {
  const v = tokenValido(cfgBruta);
  if (v.erro) return { ok: false, mensagem: v.erro, saldos: {}, erros: {} };
  const slugs = [...new Set((Array.isArray(slugsBrutos) ? slugsBrutos : [])
    .map((s) => String(s).trim().toLowerCase()).filter((s) => RE_USUARIO.test(s)))].slice(0, 100);
  if (!slugs.length) return { ok: false, mensagem: 'Nenhum canal para consultar.', saldos: {}, erros: {} };

  const saldos = {}; const erros = {};
  let fatal = '';
  for (let i = 0; i < slugs.length && !fatal; i += LOTE_PONTOS) {
    const lote = slugs.slice(i, i + LOTE_PONTOS);
    const r = await chamarGql(v.token, lote.map(operacaoContexto));
    fatal = erroDaResposta(r);
    if (fatal) break;
    const lista = Array.isArray(r.json) ? r.json : [r.json];
    lote.forEach((slug, k) => {
      const c = lerContexto(lista[k]);
      if (c.fatal) fatal = fatal || c.fatal;
      else if (c.erro) erros[slug] = c.erro;
      else if (c.pontos === null) erros[slug] = 'Sem pontos neste canal.';
      else saldos[slug] = { pontos: c.pontos };
    });
    await new Promise((ok) => setTimeout(ok, PONTOS_ESPERA_MS));
  }
  const nSaldos = Object.keys(saldos).length;
  return {
    ok: !fatal && nSaldos > 0,
    mensagem: fatal || (nSaldos ? '' : Object.values(erros)[0] || 'Não consegui ler nenhum saldo.'),
    saldos,
    erros,
  };
}

// Devolve { ok, mensagem, canalId, lista: [{ id, titulo, descricao, custo, ativo, pedeTexto, cor }] }.
async function buscarRecompensas(cfgBruta, slugBruto) {
  const v = tokenValido(cfgBruta);
  if (v.erro) return { ok: false, mensagem: v.erro, lista: [] };
  const slug = String(slugBruto || '').trim().toLowerCase();
  if (!RE_USUARIO.test(slug)) return { ok: false, mensagem: 'Streamer inválido.', lista: [] };
  const r = await chamarGql(v.token, [operacaoContexto(slug)]);
  const e = erroDaResposta(r);
  if (e) return { ok: false, mensagem: e, lista: [] };
  const c = lerContexto(Array.isArray(r.json) ? r.json[0] : r.json);
  if (c.fatal || c.erro) return { ok: false, mensagem: c.fatal || c.erro, lista: [] };
  if (!c.rewards) return { ok: false, mensagem: `Resposta sem recompensas (hash desatualizado?): ${textoCurto(r.texto, 100)}`, lista: [] };
  return { ok: true, mensagem: '', canalId: c.canalId, lista: normalizarRecompensas(c.rewards) };
}

const MOTIVOS_RESGATE = {
  NOT_ENOUGH_POINTS: 'Pontos insuficientes.',
  COOLDOWN: 'A recompensa está em espera (cooldown).',
  DISABLED: 'A recompensa está desativada.',
  MAX_PER_STREAM: 'Limite de resgates desta live atingido.',
  MAX_PER_USER_PER_STREAM: 'Você já atingiu o limite desta recompensa nesta live.',
  REWARD_NOT_FOUND: 'Recompensa não encontrada (atualize a lista).',
  CHANNEL_NOT_FOUND: 'Canal não encontrado.',
};

// Gasta pontos de verdade: só é chamado depois do clique + confirmação do usuário.
async function resgatarRecompensa(cfgBruta, slugBruto, idBruto, textoBruto, canalIdBruto, custoBruto, extraBruto) {
  if (!HASH_RESGATE) return { ok: false, mensagem: 'Resgate desligado: falta o hash do RedeemCustomReward em presence/twitch.js (copie do DevTools).' };
  const v = tokenValido(cfgBruta);
  if (v.erro) return { ok: false, mensagem: v.erro };
  const slug = String(slugBruto || '').trim().toLowerCase();
  const id = String(idBruto || '');
  const canalId = String(canalIdBruto || '');
  const custo = Math.trunc(Number(custoBruto));
  if (!RE_USUARIO.test(slug) || !RE_ID_REC.test(id) || !RE_ID_CANAL.test(canalId) || !Number.isFinite(custo) || custo < 0) {
    return { ok: false, mensagem: 'Recompensa inválida (atualize a lista e tente de novo).' };
  }
  const titulo = String(extraBruto?.titulo ?? '');
  const prompt = extraBruto?.prompt == null ? null : String(extraBruto.prompt);
  if (!titulo) return { ok: false, mensagem: 'Recompensa inválida (atualize a lista e tente de novo).' };
  const texto = textoCurto(textoBruto, 500);
  const corpo = {
    operationName: 'RedeemCustomReward',
    variables: { input: { channelID: canalId, cost: custo, pricingType: 'POINTS', prompt, rewardID: id, textInput: texto || null, title: titulo, transactionID: crypto.randomBytes(16).toString('hex') } },
    extensions: { persistedQuery: { version: 1, sha256Hash: HASH_RESGATE } },
  };
  const r = await chamarGql(v.token, [corpo]);
  const e = erroDaResposta(r);
  if (e) return { ok: false, mensagem: e };
  const el = Array.isArray(r.json) ? r.json[0] : r.json;
  const msg = textoCurto(el?.errors?.[0]?.message ?? '', 160);
  if (/PersistedQueryNotFound/i.test(msg)) return { ok: false, mensagem: MSG_HASH };
  if (/integrity/i.test(msg)) return { ok: false, mensagem: 'A Twitch exigiu verificação de integridade para este resgate; resgate pelo site.' };
  const d = el?.data?.redeemCommunityPointsCustomReward;
  const codigo = d?.error?.code;
  if (codigo) return { ok: false, mensagem: MOTIVOS_RESGATE[codigo] || `Recusado pela Twitch (${codigo}).` };
  if (!d) return { ok: false, mensagem: msg || `Resposta inesperada: ${textoCurto(r.texto, 120)}` };
  return { ok: true, mensagem: 'Resgatado! Chegará no jogo em 1 minuto!' };
}

function criarGerenciador({ app, shell, enviar, pastaExtra }) {
  const contas = new Map();    // slot -> { proc, estado, codigo, linhas, pid }
  let prontaCache = null;      // { raiz, python } da última checagem ok: evita rodar o Python de novo a cada início
  const dadosDir = path.join(app.getPath('userData'), 'twitch-presence-data');

  const emitir = (slot, patch) => enviar('twitch:evento', { slot: String(slot), ...patch });

  // ---------- 1) a pasta existe? ----------
  const localizarPasta = () => localizarPastaMiner({ app, pastaExtra, envDir: 'TWITCH_MINER_DIR', nomeMiner: NOME_MINER, isRaiz });

  // ---------- 2) Python (venv da própria pasta primeiro) ----------
  async function acharPython(raiz) {
    const win = process.platform === 'win32';
    const candidatos = [
      { cmd: path.join(raiz, 'venv', win ? 'Scripts/python.exe' : 'bin/python'), args: [] },
      { cmd: path.join(raiz, '.venv', win ? 'Scripts/python.exe' : 'bin/python'), args: [] },
      ...(win ? [{ cmd: 'py', args: ['-3'] }] : []),
      { cmd: 'python', args: [] },
      { cmd: 'python3', args: [] },
    ];
    for (const c of candidatos) {
      if (path.isAbsolute(c.cmd) && !fs.existsSync(c.cmd)) continue;
      const r = await rodar(c.cmd, [...c.args, '--version'], { timeout: 10000 });
      if (r.status === 0) return c;
    }
    return null;
  }

  const envPython = (raiz) => envPythonMiner(raiz);

  async function checarInterno() {
    prontaCache = null;   // só fica preenchido se a checagem inteira passar
    const { raiz, procurou } = localizarPasta();
    if (!raiz) {
      return { ok: false, etapa: 'pasta', mensagem: `Pasta "${NOME_MODS}" não encontrada.`, procurou };
    }
    const py = await acharPython(raiz);
    if (!py) return { ok: false, etapa: 'python', raiz, mensagem: 'Python 3 não encontrado. Instale o Python ou crie uma pasta "venv" dentro de mods.' };
    const t = await rodar(py.cmd, [...py.args, '-c', 'import TwitchChannelPointsMiner.runner'], { env: envPython(raiz), cwd: raiz });
    if (t.status !== 0) {
      const ultima = String(t.stderr || '').trim().split(/\r?\n/).pop() || 'erro desconhecido';
      return { ok: false, etapa: 'dependencias', raiz, mensagem: `Faltam dependências do miner (${ultima}).` };
    }
    prontaCache = { raiz, python: py };
    return { ok: true, raiz, mensagem: 'Pasta encontrada e pronta.' };
  }

  let checando = null;
  const checar = () => { if (!checando) checando = checarInterno().finally(() => { checando = null; }); return checando; };

  // Os dois miners têm requirements.txt e ficam na mesma pasta: use "requirements-twitch.txt" para o deste miner
  // (se não existir, cai no requirements.txt comum).
  const arqRequisitos = (raiz) => (fs.existsSync(path.join(raiz, 'requirements-twitch.txt')) ? 'requirements-twitch.txt' : 'requirements.txt');

  async function instalarDependencias() {
    const { raiz } = localizarPasta();
    if (!raiz) return Promise.resolve({ ok: false, mensagem: `Pasta "${NOME_MODS}" não encontrada.` });
    const py = await acharPython(raiz);
    if (!py) return Promise.resolve({ ok: false, mensagem: 'Python 3 não encontrado.' });
    return new Promise((resolve) => {
      const p = spawn(py.cmd, [...py.args, '-m', 'pip', 'install', '-r', arqRequisitos(raiz)], { cwd: raiz, windowsHide: true, env: envPython(raiz) });
      const linha = (b) => String(b).split(/\r?\n/).filter(Boolean).forEach((l) => enviar('twitch:evento', { slot: '0', tipo: 'pip', linha: l.slice(0, 300) }));
      p.stdout.on('data', linha); p.stderr.on('data', linha);
      p.on('error', (e) => resolve({ ok: false, mensagem: e.message }));
      p.on('close', (code) => resolve({ ok: code === 0, mensagem: code === 0 ? 'Dependências instaladas.' : `pip terminou com código ${code}.` }));
    });
  }

  // ---------- 3) config.py da conta (gerada a partir das configurações do app) ----------
  // O config.py é CÓDIGO Python executado pelo miner: tudo que vem de fora é validado e entra como string JSON.
  function validar(cfg) {
    const username = String(cfg?.username || '').trim();
    if (!RE_USUARIO.test(username)) throw new Error('Usuário da Twitch inválido (use só letras, números e _).');
    const streamers = [...new Set(String(Array.isArray(cfg?.streamers) ? cfg.streamers.join(',') : cfg?.streamers || '')
      .split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
    for (const s of streamers) if (!RE_USUARIO.test(s)) throw new Error(`Nome de streamer inválido: ${s.slice(0, 30)}`);
    const seguidores = !!cfg?.seguidores;
    if (!streamers.length && !seguidores) throw new Error('Informe pelo menos um streamer (ou ative "canais que eu sigo").');
    const chat = CHATS.includes(cfg?.chat) ? cfg.chat : 'ONLINE';
    const assistidos = Number(cfg?.assistidos) === 1 ? 1 : 2;
    return {
      username, streamers, seguidores, chat, assistidos,
      drops: cfg?.drops === true, moments: cfg?.moments !== false, streak: cfg?.streak !== false, raid: cfg?.raid !== false,
    };
  }

  const py = (v) => (v ? 'True' : 'False');

  function gerarConfig(c) {
    return `# -*- coding: utf-8 -*-
# GERADO PELO APP: é sobrescrito a cada início. Edite pelo painel do app.
CONFIG_VERSION = 11

import logging
from TwitchChannelPointsMiner.logger import LoggerSettings
from TwitchChannelPointsMiner.classes.Chat import ChatPresence
from TwitchChannelPointsMiner.classes.Settings import FollowersOrder
from TwitchChannelPointsMiner.classes.entities.Streamer import StreamerSettings

MINER_CONFIG = {
    "username": ${JSON.stringify(c.username)},
    "claim_drops_startup": False,
    "enable_analytics": False,
    "update_check": False,
    "streams_watched": ${c.assistidos},
    "logger_settings": LoggerSettings(
        save=True,
        less=True,
        console_level=logging.INFO,
        file_level=logging.INFO,
        emoji=False,
        colored=False,
        auto_clear=True,
        log_retention_days=${DIAS_LOGS},
        daily_report=False,
    ),
    "streamer_settings": StreamerSettings(
        make_predictions=False,
        follow_raid=${py(c.raid)},
        claim_drops=${py(c.drops)},
        claim_moments=${py(c.moments)},
        watch_streak=${py(c.streak)},
        favorite=False,
        points_limit=None,
        community_goals=False,
        chat=ChatPresence.${c.chat},
        bet=None,   # None = apostas com padrão do miner (e make_predictions=False impede qualquer aposta). NÃO use False aqui.
    ),
}

STREAMERS = [${c.streamers.map((s) => JSON.stringify(s)).join(', ')}]

MINE_CONFIG = {
    "followers": ${py(c.seguidores)},
    "followers_order": FollowersOrder.ASC,
    "categories": [],
    "category_drops_enabled": False,
    "drop_badge_catalog": False,
}

ANALYTICS_CONFIG = None
`;
  }

  const slotSeguro = (slot) => String(slot).replace(/[^A-Za-z0-9_-]/g, '_');
  const dirConta = (slot) => path.join(dadosDir, `conta-${slotSeguro(slot)}`);

  // ---------- 4) processo por conta ----------
  const estadoDe = (slot) => contas.get(String(slot)) || { estado: 'parado', codigo: null, linhas: [] };

  function tratarLinha(slot, bruta, reg) {
    const linha = bruta.replace(ANSI, '').trim();
    if (!linha) return;
    reg.linhas.push(linha);
    if (reg.linhas.length > MAX_LINHAS) reg.linhas.shift();
    const s = lerSaldo(linha);
    if (s) {
      const antes = reg.saldos.get(s.canal);
      const novo = {
        pontos: s.pontos, texto: s.texto, aprox: s.aprox,
        ganho: (antes?.ganho || 0) + s.ganho,   // soma dos "+N" vistos nesta sessão
        online: s.online ?? antes?.online,      // sem informação na linha: mantém o que já sabia
        t: Date.now(),
      };
      reg.saldos.set(s.canal, novo);
      emitir(slot, { tipo: 'saldo', canal: s.canal, ...novo });
      if (reg.estado !== 'rodando') {   // ler um saldo prova que o login passou e o miner está de pé
        reg.estado = 'rodando'; reg.codigo = null;
        emitir(slot, { tipo: 'estado', estado: 'rodando', codigo: null });
      }
    }
    const cod = /enter this code:\s*([A-Z0-9-]{4,12})/i.exec(linha);
    if (cod) {
      reg.estado = 'login'; reg.codigo = cod[1];
      emitir(slot, { tipo: 'estado', estado: 'login', codigo: cod[1] });
      shell.openExternal('https://www.twitch.tv/activate').catch(() => {});
    } else if (/Start session|Loading data for|Saving cookies/i.test(linha) && reg.estado !== 'rodando') {
      reg.estado = 'rodando'; reg.codigo = null;
      emitir(slot, { tipo: 'estado', estado: 'rodando', codigo: null });
    }
    emitir(slot, { tipo: 'log', linha: linha.slice(0, 400) });
  }

  async function iniciar(slot, cfgBruta) {
    slot = String(slot);
    if (contas.get(slot)?.proc) return { ok: true, mensagem: 'Já está rodando.' };

    // confirma pasta, Python e dependências só na primeira vez (spawnSync trava o processo principal);
    // depois reaproveita o resultado. O botão "Verificar de novo" do painel refaz a checagem.
    if (!prontaCache) {
      const chk = await checar();
      if (!chk.ok) { emitir(slot, { tipo: 'estado', estado: 'erro', mensagem: chk.mensagem }); return { ok: false, mensagem: chk.mensagem }; }
      // outra chamada pode ter iniciado esta conta enquanto a checagem rodava
      if (contas.get(slot)?.proc) return { ok: true, mensagem: 'Já está rodando.' };
    }
    const { raiz, python } = prontaCache;

    let cfg;
    try { cfg = validar(cfgBruta); } catch (e) {
      emitir(slot, { tipo: 'estado', estado: 'erro', mensagem: e.message });
      return { ok: false, mensagem: e.message };
    }

    const dir = dirConta(slot);
    const cfgDir = path.join(dir, 'config');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.py'), gerarConfig(cfg), 'utf8');
    limparLogsAntigos(path.join(dir, 'logs'), DIAS_LOGS);   // antes de subir o miner, nada em uso

    // cwd = pasta da conta: cookies/, logs/ ficam isolados por conta (login de uma não mistura com outra)
    const proc = spawn(python.cmd, [...python.args, '-u', '-m', 'TwitchChannelPointsMiner.runner', '--config-dir', cfgDir], {
      cwd: dir, env: envPython(raiz), windowsHide: true,
    });
    const reg = { proc, estado: 'iniciando', codigo: null, linhas: [], saldos: new Map(), pid: proc.pid };
    contas.set(slot, reg);
    emitir(slot, { tipo: 'estado', estado: 'iniciando', codigo: null });

    let resto = '';
    const ler = (b) => {
      const partes = (resto + String(b)).split(/\r?\n/);
      resto = partes.pop();
      partes.forEach((l) => tratarLinha(slot, l, reg));
    };
    proc.stdout.on('data', ler);
    proc.stderr.on('data', ler);
    proc.on('error', (e) => {
      contas.delete(slot);
      emitir(slot, { tipo: 'estado', estado: 'erro', mensagem: e.message });
    });
    proc.on('close', (code) => {
      if (resto) tratarLinha(slot, resto, reg);
      contas.delete(slot);
      const pediu = reg.pediuParar;
      emitir(slot, { tipo: 'estado', estado: pediu || code === 0 ? 'parado' : 'erro', codigo: null, mensagem: pediu || code === 0 ? '' : `O miner terminou com código ${code}.` });
    });
    return { ok: true, mensagem: 'Iniciando…' };
  }

  // `sincrono`: só para o encerramento do app (before-quit), quando não dá para esperar um processo assíncrono
  function parar(slot, sincrono = false) {
    const reg = contas.get(String(slot));
    if (!reg?.proc) return { ok: true };
    reg.pediuParar = true;
    try {
      if (process.platform === 'win32') {
        const args = ['/pid', String(reg.proc.pid), '/T', '/F'];
        if (sincrono) spawnSync('taskkill', args, { windowsHide: true });
        else spawn('taskkill', args, { windowsHide: true }).on('error', () => {});
      } else reg.proc.kill('SIGTERM');
    } catch { /* já terminou */ }
    return { ok: true };
  }

  const pararTodas = (sincrono = false) => [...contas.keys()].forEach((s) => parar(s, sincrono));
  app.on('before-quit', () => pararTodas(true));

  const status = () => Object.fromEntries([...contas.entries()].map(([s, r]) => [s, { estado: r.estado, codigo: r.codigo, linhas: r.linhas.slice(-30), saldos: Object.fromEntries(r.saldos) }]));

  return { checar, instalarDependencias, iniciar, parar, pararTodas, status, estadoDe, gerarConfig, validar };
}

// Registra os canais IPC. Chame uma vez no main.js.
// obterToken(slot) devolve o token da conta guardado no cofre (tokenVault.js). A interface só manda o slot.
function setupTwitchPresence({ app, ipcMain, shell, send, pastaExtra, obterToken = () => null }) {
  const cfgDoToken = (slot) => ({ token: obterToken(slot) });
  const g = criarGerenciador({ app, shell, enviar: send, pastaExtra });
  ipcMain.handle('twitch:checar', () => g.checar());
  ipcMain.handle('twitch:instalar', () => g.instalarDependencias());
  ipcMain.handle('twitch:iniciar', (_e, slot, cfg) => g.iniciar(slot, cfg));
  ipcMain.handle('twitch:parar', (_e, slot) => g.parar(slot));
  ipcMain.handle('twitch:parar-todas', () => { g.pararTodas(); return { ok: true }; });
  ipcMain.handle('twitch:status', () => g.status());
  ipcMain.handle('twitch:pontos', (_e, slot, slugs) => buscarPontos(cfgDoToken(slot), slugs));   // saldos pelo token (opcional)
  ipcMain.handle('twitch:recompensas', (_e, slot, slug) => buscarRecompensas(cfgDoToken(slot), slug));
  ipcMain.handle('twitch:resgatar', (_e, slot, slug, id, texto, canalId, custo, extra) => resgatarRecompensa(cfgDoToken(slot), slug, id, texto, canalId, custo, extra));
  return g;
}

// Mantido no export (usado por testes/ferramentas): procura a raiz deste miner.
const acharRaiz = (base) => acharRaizEm(base, isRaiz);

module.exports = { setupTwitchPresence, criarGerenciador, acharRaiz, limparLogsAntigos, lerSaldo, tokenValido, buscarPontos, buscarRecompensas, resgatarRecompensa };
