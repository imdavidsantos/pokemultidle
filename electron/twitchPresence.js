// Gerencia o miner da pasta "mods/".
// a partir das configurações do app e roda um processo Python por conta (até 4).
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

// Pasta "mods": os arquivos dos miners da Twitch e da Kick ficam juntos, direto nela (sem subpasta por miner).
const NOME_MODS = 'mods';
const NOME_MINER = 'Twitch-Channel-Points-Miner-v3-3.19.6';   // subpasta deste miner dentro de mods/
const MAX_LINHAS = 200;
const ANSI = /\x1b\[[0-9;]*m/g;
const RE_USUARIO = /^[A-Za-z0-9_]{1,25}$/;       // vale para a conta e para os streamers
const CHATS = ['ONLINE', 'ALWAYS', 'NEVER', 'OFFLINE'];
const DIAS_LOGS = 3;   // quantos dias de log ficam guardados (o miner e o app apagam os mais antigos)

const isRaiz = (dir) => {
  try { return fs.existsSync(path.join(dir, 'TwitchChannelPointsMiner', 'runner.py')); } catch { return false; }
};

// Procura a raiz do miner (a pasta que contém TwitchChannelPointsMiner/). Aceita o zip extraído com pasta dentro de pasta.
function acharRaiz(base, nivel = 0) {
  try {
    if (!fs.statSync(base).isDirectory()) return null;
  } catch { return null; }
  if (isRaiz(base)) return base;
  if (nivel >= 3) return null;   // aceita o zip extraído com pastas dentro de pastas (até 3 níveis)
  try {
    for (const nome of fs.readdirSync(base)) {
      if (nome === 'node_modules' || nome.startsWith('.') || nome === '__pycache__') continue;
      const r = acharRaiz(path.join(base, nome), nivel + 1);
      if (r) return r;
    }
  } catch { /* sem acesso */ }
  return null;
}

// Apaga os logs com mais de `dias` dias da pasta logs/ de uma conta. Segurança extra: o miner também
// limpa os próprios (auto_clear), mas se o nome do arquivo mudar a cada início os antigos ficariam para sempre.
function limparLogsAntigos(pasta, dias) {
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  let nomes;
  try { nomes = fs.readdirSync(pasta); } catch { return; }   // a pasta ainda não existe
  for (const nome of nomes) {
    if (!/\.log($|\.)/.test(nome)) continue;   // só logs (inclui os rotacionados, ex.: usuario.log.2026-11-04)
    const arq = path.join(pasta, nome);
    try {
      const st = fs.statSync(arq);
      if (st.isFile() && st.mtimeMs < limite) fs.unlinkSync(arq);
    } catch { /* em uso ou sem permissão: fica para a próxima */ }
  }
}

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

function criarGerenciador({ app, shell, enviar, pastaExtra }) {
  const contas = new Map();    // slot -> { proc, estado, codigo, linhas, pid }
  let prontaCache = null;      // { raiz, python } da última checagem ok: evita rodar o Python de novo a cada início
  const dadosDir = path.join(app.getPath('userData'), 'twitch-presence-data');

  const emitir = (slot, patch) => enviar('twitch:evento', { slot: String(slot), ...patch });

  // ---------- 1) a pasta existe? ----------
  function localizarPasta() {
    const bases = [
      app.getPath('userData'),
      path.join(__dirname, '..'),   // dev: raiz do projeto (electron/ fica dentro dela)
      path.dirname(app.getPath('exe')),
      app.getAppPath(),
      process.resourcesPath,
      process.cwd(),
    ].filter(Boolean);
    const candidatos = [
      pastaExtra && pastaExtra(),                                   // caminho direto da pasta do miner
      process.env.TWITCH_MINER_DIR,                                         // idem, por variável de ambiente
      process.env.MODS_DIR,                                           // caminho da pasta mods
      ...bases.map((b) => path.join(b, NOME_MODS, NOME_MINER)),      // <base>/mods/Twitch-Channel-Points-Miner-v3-3.19.6
      ...bases.map((b) => path.join(b, NOME_MODS)),                  // <base>/mods (fallback: procura dentro)
    ].filter(Boolean);
    for (const base of candidatos) {
      const raiz = acharRaiz(base);
      if (raiz) return { raiz, procurou: candidatos };
    }
    return { raiz: null, procurou: candidatos };
  }

  // ---------- 2) Python (venv da própria pasta primeiro) ----------
  function acharPython(raiz) {
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
      const r = spawnSync(c.cmd, [...c.args, '--version'], { encoding: 'utf8', windowsHide: true });
      if (r.status === 0) return c;
    }
    return null;
  }

  const envPython = (raiz) => ({
    ...process.env,
    PYTHONPATH: raiz + (process.env.PYTHONPATH ? path.delimiter + process.env.PYTHONPATH : ''),
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
  });

  function checar() {
    prontaCache = null;   // só fica preenchido se a checagem inteira passar
    const { raiz, procurou } = localizarPasta();
    if (!raiz) {
      return { ok: false, etapa: 'pasta', mensagem: `Pasta "${NOME_MODS}" não encontrada.`, procurou };
    }
    const py = acharPython(raiz);
    if (!py) return { ok: false, etapa: 'python', raiz, mensagem: 'Python 3 não encontrado. Instale o Python ou crie uma pasta "venv" dentro de mods.' };
    const t = spawnSync(py.cmd, [...py.args, '-c', 'import TwitchChannelPointsMiner.runner'], {
      encoding: 'utf8', windowsHide: true, env: envPython(raiz), cwd: raiz,
    });
    if (t.status !== 0) {
      const ultima = String(t.stderr || '').trim().split(/\r?\n/).pop() || 'erro desconhecido';
      return { ok: false, etapa: 'dependencias', raiz, mensagem: `Faltam dependências do miner (${ultima}).` };
    }
    prontaCache = { raiz, python: py };
    return { ok: true, raiz, mensagem: 'Pasta encontrada e pronta.' };
  }

  // Os dois miners têm requirements.txt e ficam na mesma pasta: use "requirements-twitch.txt" para o deste miner
  // (se não existir, cai no requirements.txt comum).
  const arqRequisitos = (raiz) => (fs.existsSync(path.join(raiz, 'requirements-twitch.txt')) ? 'requirements-twitch.txt' : 'requirements.txt');

  function instalarDependencias() {
    const { raiz } = localizarPasta();
    if (!raiz) return Promise.resolve({ ok: false, mensagem: `Pasta "${NOME_MODS}" não encontrada.` });
    const py = acharPython(raiz);
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

  function iniciar(slot, cfgBruta) {
    slot = String(slot);
    if (contas.get(slot)?.proc) return { ok: true, mensagem: 'Já está rodando.' };

    // confirma pasta, Python e dependências só na primeira vez (spawnSync trava o processo principal);
    // depois reaproveita o resultado. O botão "Verificar de novo" do painel refaz a checagem.
    if (!prontaCache) {
      const chk = checar();
      if (!chk.ok) { emitir(slot, { tipo: 'estado', estado: 'erro', mensagem: chk.mensagem }); return { ok: false, mensagem: chk.mensagem }; }
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

  function parar(slot) {
    const reg = contas.get(String(slot));
    if (!reg?.proc) return { ok: true };
    reg.pediuParar = true;
    try {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(reg.proc.pid), '/T', '/F'], { windowsHide: true });
      else reg.proc.kill('SIGTERM');
    } catch { /* já terminou */ }
    return { ok: true };
  }

  const pararTodas = () => [...contas.keys()].forEach(parar);
  app.on('before-quit', pararTodas);

  const status = () => Object.fromEntries([...contas.entries()].map(([s, r]) => [s, { estado: r.estado, codigo: r.codigo, linhas: r.linhas.slice(-30), saldos: Object.fromEntries(r.saldos) }]));

  return { checar, instalarDependencias, iniciar, parar, pararTodas, status, estadoDe, gerarConfig, validar };
}

// Registra os canais IPC. Chame uma vez no main.js.
function setupTwitchPresence({ app, ipcMain, shell, send, pastaExtra }) {
  const g = criarGerenciador({ app, shell, enviar: send, pastaExtra });
  ipcMain.handle('twitch:checar', () => g.checar());
  ipcMain.handle('twitch:instalar', () => g.instalarDependencias());
  ipcMain.handle('twitch:iniciar', (_e, slot, cfg) => g.iniciar(slot, cfg));
  ipcMain.handle('twitch:parar', (_e, slot) => g.parar(slot));
  ipcMain.handle('twitch:parar-todas', () => { g.pararTodas(); return { ok: true }; });
  ipcMain.handle('twitch:status', () => g.status());
  return g;
}

module.exports = { setupTwitchPresence, criarGerenciador, acharRaiz, limparLogsAntigos, lerSaldo };
