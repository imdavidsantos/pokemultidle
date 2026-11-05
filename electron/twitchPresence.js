// PROCESSO PRINCIPAL do Electron (CommonJS). Coloque ao lado do seu main.js.
// Gerencia o miner da pasta "twitch-presence": confere se a pasta existe, gera a config de cada conta
// a partir das configurações do app e roda um processo Python por conta (até 4).
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const NOME_PASTA = 'twitch-presence';
const MAX_LINHAS = 200;
const ANSI = /\x1b\[[0-9;]*m/g;
const RE_USUARIO = /^[A-Za-z0-9_]{1,25}$/;       // vale para a conta e para os streamers
const CHATS = ['ONLINE', 'ALWAYS', 'NEVER', 'OFFLINE'];

const isRaiz = (dir) => {
  try { return fs.existsSync(path.join(dir, 'TwitchChannelPointsMiner', 'runner.py')); } catch { return false; }
};

// Procura a raiz do miner (a pasta que contém TwitchChannelPointsMiner/). Aceita o zip extraído com pasta dentro de pasta.
function acharRaiz(base) {
  try {
    if (!fs.statSync(base).isDirectory()) return null;
  } catch { return null; }
  if (isRaiz(base)) return base;
  try {
    for (const nome of fs.readdirSync(base)) {
      const sub = path.join(base, nome);
      if (fs.statSync(sub).isDirectory() && isRaiz(sub)) return sub;
    }
  } catch { /* sem acesso */ }
  return null;
}

function criarGerenciador({ app, shell, enviar, pastaExtra }) {
  const contas = new Map();    // slot -> { proc, estado, codigo, linhas, pid }
  let prontaCache = null;      // { raiz, python } da última checagem ok: evita rodar o Python de novo a cada início
  const dadosDir = path.join(app.getPath('userData'), 'twitch-presence-data');

  const emitir = (slot, patch) => enviar('twitch:evento', { slot: String(slot), ...patch });

  // ---------- 1) a pasta existe? ----------
  function localizarPasta() {
    const candidatos = [
      pastaExtra && pastaExtra(),
      process.env.TWITCH_PRESENCE_DIR,
      path.join(app.getPath('userData'), NOME_PASTA),
      path.join(__dirname, '..', NOME_PASTA),   // dev: raiz do projeto (electron/ fica dentro dela)
      path.join(path.dirname(app.getPath('exe')), NOME_PASTA),
      path.join(app.getAppPath(), NOME_PASTA),
      process.resourcesPath && path.join(process.resourcesPath, NOME_PASTA),
      path.join(process.cwd(), NOME_PASTA),
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
      return { ok: false, etapa: 'pasta', mensagem: `Pasta "${NOME_PASTA}" não encontrada.`, procurou };
    }
    const py = acharPython(raiz);
    if (!py) return { ok: false, etapa: 'python', raiz, mensagem: 'Python 3 não encontrado. Instale o Python ou crie uma pasta "venv" dentro de twitch-presence.' };
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

  function instalarDependencias() {
    const { raiz } = localizarPasta();
    if (!raiz) return Promise.resolve({ ok: false, mensagem: `Pasta "${NOME_PASTA}" não encontrada.` });
    const py = acharPython(raiz);
    if (!py) return Promise.resolve({ ok: false, mensagem: 'Python 3 não encontrado.' });
    return new Promise((resolve) => {
      const p = spawn(py.cmd, [...py.args, '-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: raiz, windowsHide: true, env: envPython(raiz) });
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
        log_retention_days=3,
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

    // cwd = pasta da conta: cookies/, logs/ ficam isolados por conta (login de uma não mistura com outra)
    const proc = spawn(python.cmd, [...python.args, '-u', '-m', 'TwitchChannelPointsMiner.runner', '--config-dir', cfgDir], {
      cwd: dir, env: envPython(raiz), windowsHide: true,
    });
    const reg = { proc, estado: 'iniciando', codigo: null, linhas: [], pid: proc.pid };
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

  const status = () => Object.fromEntries([...contas.entries()].map(([s, r]) => [s, { estado: r.estado, codigo: r.codigo, linhas: r.linhas.slice(-30) }]));

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

module.exports = { setupTwitchPresence, criarGerenciador, acharRaiz };
