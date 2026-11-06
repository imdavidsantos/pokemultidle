// Requer Python 3.12 (só essa versão).
// Gerencia o miner da pasta "mods/": confere se a pasta existe,
// gera o config.json de cada conta a partir das configurações do app e roda um processo Python por conta.
// O login é por TOKEN (Bearer) colado no painel.
// "config.json" e "lang/" do diretório atual, então cada conta ganha a própria pasta com uma cópia de lang/.
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

// Pasta "mods": os arquivos dos miners da Twitch e da Kick ficam juntos.
const NOME_MODS = 'mods';
const NOME_MINER = 'Kick_Channel_Points_Miner-2.1';   // subpasta deste miner dentro de mods/
const MAX_LINHAS = 200;
const ANSI = /\x1b\[[0-9;]*m/g;
const RE_CANAL = /^[A-Za-z0-9_-]{1,50}$/;                                  // streamers (slug da Kick)
const RE_TOKEN = /^[A-Za-z0-9|._~+/=-]{10,800}$/;                          // ex.: 123456789|abcDEF...
const RE_PROXY = /^(?:socks5h?|socks4|https?):\/\/[^\s"'\\]{3,200}$/i;
const DIAS_LOGS = 3;

const isRaiz = (dir) => {
  try {
    return fs.existsSync(path.join(dir, 'main.py'))
      && fs.existsSync(path.join(dir, 'account_manager.py'))
      && fs.existsSync(path.join(dir, '_websockets'))
      && fs.existsSync(path.join(dir, 'lang', 'en.lang'));
  } catch { return false; }
};

// Procura a raiz do miner.
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

function limparLogsAntigos(pasta, dias) {
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  let nomes;
  try { nomes = fs.readdirSync(pasta); } catch { return; }
  for (const nome of nomes) {
    if (!/\.log($|\.)/.test(nome)) continue;
    const arq = path.join(pasta, nome);
    try {
      const st = fs.statSync(arq);
      if (st.isFile() && st.mtimeMs < limite) fs.unlinkSync(arq);
    } catch { /* em uso ou sem permissão */ }
  }
}

// O miner só loga o saldo depois do primeiro ganho (2-3 min). Esta função acrescenta, uma vez, um log com o saldo
// inicial em account_manager.py (o que antes era o arquivo de miner-patch/). Idempotente; se o trecho não for
// encontrado (miner de outra versão) não mexe em nada e o app só mostra o saldo depois do primeiro ganho.
function aplicarPatchSaldo(raiz) {
  const arq = path.join(raiz, 'account_manager.py');
  try {
    const txt = fs.readFileSync(arq, 'utf8');
    if (txt.includes('(Total: {pts})') || txt.includes('(Всего: {pts})')) return true;   // já aplicado
    const re = /^([ \t]+)st\.points = pts(\r?\n)[ \t]+st\.last_points_update = datetime\.now\(\)\r?\n/m;
    const m = re.exec(txt);
    if (!m || txt.indexOf(m[0]) !== txt.lastIndexOf(m[0])) return false;
    const [, ind, eol] = m;
    const add = `${ind}logger.info(${eol}${ind}    f"[{self.alias}] 📊 {name}: (Total: {pts})"${eol}${ind})${eol}`;
    fs.writeFileSync(arq, txt.replace(m[0], m[0] + add), 'utf8');
    return true;
  } catch { return false; }   // pasta somente leitura, etc.
}

// ---------- leitura do log do miner ----------

// Os saldos da Kick são inteiros exatos (sem abreviação), então `aprox` é sempre false.
const RE_SALDO = /(?:💰|📊)\s*([A-Za-z0-9_-]{1,50}):\s*(?:\+(\d+)\s*)?\((?:Total|Всего):\s*(\d+)\)/u;
const RE_ONLINE = /(?:🟢|🔴)\s*([A-Za-z0-9_-]{1,50})\s+(ONLINE|OFFLINE|ОНЛАЙН|ОФФЛАЙН)/u;

// Devolve { canal, pontos, texto, aprox, ganho } | { canal, online } | null.
function lerLinha(linha) {
  const s = RE_SALDO.exec(linha);
  if (s) {
    const pontos = Number(s[3]);
    if (!Number.isFinite(pontos)) return null;
    return { canal: s[1].toLowerCase(), pontos, texto: String(pontos), aprox: false, ganho: s[2] ? Number(s[2]) : 0 };
  }
  const o = RE_ONLINE.exec(linha);
  if (o) return { canal: o[1].toLowerCase(), online: o[2] === 'ONLINE' || o[2] === 'ОНЛАЙН' };
  return null;
}

// Mensagens de problema que valem mostrar no painel.
const PROBLEMAS = [
  [/Erro ao carregar a configuração|Ошибка загрузки конфига/, 'Falha ao ler o config.json gerado pelo app.'],
  [/Não foi possível obter o token WS|Falha ao obter o token do WebSocket|Не удалось получить WS-токен|Failed to get WebSocket token/,
    'Não foi possível entrar na live: o token da Kick pode estar inválido ou expirado.'],
  [/403 repetido|403 na inicialização|403 ao obter|IP bloqueado|o IP pode estar bloqueado|Повторный 403|403 при получении|IP may be blocked|403 during utility init/,
    'A Kick respondeu 403 (bloqueio de IP/Cloudflare). Tente um proxy.'],
];

function criarGerenciador({ app, shell, enviar, pastaExtra }) {
  void shell;
  const contas = new Map();    // slot -> { proc, estado, codigo, linhas, saldos, pid }
  let prontaCache = null;      // { raiz, python } da última checagem ok
  const dadosDir = path.join(app.getPath('userData'), 'kick-presence-data');

  const emitir = (slot, patch) => enviar('kick:evento', { slot: String(slot), ...patch });

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
      process.env.KICK_MINER_DIR,                                         // idem, por variável de ambiente
      process.env.MODS_DIR,                                           // caminho da pasta mods
      ...bases.map((b) => path.join(b, NOME_MODS, NOME_MINER)),      // <base>/mods/Kick_Channel_Points_Miner-2.1
      ...bases.map((b) => path.join(b, NOME_MODS)),                  // <base>/mods (fallback: procura dentro)
    ].filter(Boolean);
    for (const base of candidatos) {
      const raiz = acharRaiz(base);
      if (raiz) return { raiz, procurou: candidatos };
    }
    return { raiz: null, procurou: candidatos };
  }

  // ---------- 2) Python 3.12 (o miner só funciona nessa versão; venv da própria pasta primeiro) ----------
  const PY_VERSAO = '3.12';
  let pythonOutros = [];   // versões encontradas que não servem (para a mensagem de erro)

  function acharPython(raiz) {
    const win = process.platform === 'win32';
    const candidatos = [
      { cmd: path.join(raiz, 'venv', win ? 'Scripts/python.exe' : 'bin/python'), args: [] },
      { cmd: path.join(raiz, '.venv', win ? 'Scripts/python.exe' : 'bin/python'), args: [] },
      ...(win ? [{ cmd: 'py', args: [`-${PY_VERSAO}`] }] : []),
      { cmd: `python${PY_VERSAO}`, args: [] },
      { cmd: 'python', args: [] },
      { cmd: 'python3', args: [] },
    ];
    pythonOutros = [];
    for (const c of candidatos) {
      if (path.isAbsolute(c.cmd) && !fs.existsSync(c.cmd)) continue;
      const r = spawnSync(c.cmd, [...c.args, '--version'], { encoding: 'utf8', windowsHide: true });
      if (r.status !== 0) continue;
      const v = /Python\s+(\d+\.\d+)(?:\.\d+)?/.exec(`${r.stdout || ''}${r.stderr || ''}`);
      if (v && v[1] === PY_VERSAO) return c;
      if (v && !pythonOutros.includes(v[1])) pythonOutros.push(v[1]);
    }
    return null;
  }

  const msgSemPython = () => (pythonOutros.length
    ? `Python ${PY_VERSAO} não encontrado (achei só ${pythonOutros.join(', ')}). O miner da Kick só funciona no ${PY_VERSAO}: instale-o ou crie uma pasta "venv" com o Python ${PY_VERSAO} dentro de ${NOME_MODS}.`
    : `Python ${PY_VERSAO} não encontrado. Instale o Python ${PY_VERSAO} ou crie uma pasta "venv" com ele dentro de ${NOME_MODS}.`);

  const envPython = (raiz) => ({
    ...process.env,
    PYTHONPATH: raiz + (process.env.PYTHONPATH ? path.delimiter + process.env.PYTHONPATH : ''),
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  });

  function checar() {
    prontaCache = null;
    const { raiz, procurou } = localizarPasta();
    if (!raiz) {
      return { ok: false, etapa: 'pasta', mensagem: `Pasta "${NOME_MODS}" não encontrada.`, procurou };
    }
    const py = acharPython(raiz);
    if (!py) return { ok: false, etapa: 'python', raiz, mensagem: msgSemPython() };
    // o mesmo que o main.py importa (rnet, loguru, curl_cffi, flask via web_server)
    const t = spawnSync(py.cmd, [...py.args, '-c', 'import account_manager, web_server'], {
      encoding: 'utf8', windowsHide: true, env: envPython(raiz), cwd: raiz,
    });
    if (t.status !== 0) {
      const ultima = String(t.stderr || '').trim().split(/\r?\n/).pop() || 'erro desconhecido';
      return { ok: false, etapa: 'dependencias', raiz, mensagem: `Faltam dependências do miner (${ultima}).` };
    }
    prontaCache = { raiz, python: py };
    return { ok: true, raiz, mensagem: 'Pasta encontrada e pronta.' };
  }

  // Os dois miners têm requirements.txt e ficam na mesma pasta: use "requirements-kick.txt" para o deste miner
  // (se não existir, cai no requirements.txt comum).
  const arqRequisitos = (raiz) => (fs.existsSync(path.join(raiz, 'requirements-kick.txt')) ? 'requirements-kick.txt' : 'requirements.txt');

  function instalarDependencias() {
    const { raiz } = localizarPasta();
    if (!raiz) return Promise.resolve({ ok: false, mensagem: `Pasta "${NOME_MODS}" não encontrada.` });
    const py = acharPython(raiz);
    if (!py) return Promise.resolve({ ok: false, mensagem: msgSemPython() });
    return new Promise((resolve) => {
      const p = spawn(py.cmd, [...py.args, '-m', 'pip', 'install', '-r', arqRequisitos(raiz)], { cwd: raiz, windowsHide: true, env: envPython(raiz) });
      const linha = (b) => String(b).split(/\r?\n/).filter(Boolean).forEach((l) => enviar('kick:evento', { slot: '0', tipo: 'pip', linha: l.slice(0, 300) }));
      p.stdout.on('data', linha); p.stderr.on('data', linha);
      p.on('error', (e) => resolve({ ok: false, mensagem: e.message }));
      p.on('close', (code) => resolve({ ok: code === 0, mensagem: code === 0 ? 'Dependências instaladas.' : `pip terminou com código ${code}.` }));
    });
  }

  // ---------- 3) config.json da conta ----------
  // Tudo que vem de fora é validado; o arquivo é JSON (JSON.stringify), então não há injeção de código.
  function validar(cfg, slot = '0') {
    let token = String(cfg?.token || '').trim().replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('Cole o token da Kick desta conta.');
    if (!RE_TOKEN.test(token)) throw new Error('Token da Kick com formato inválido (copie só o texto depois de "Bearer").');
    const streamers = [...new Set(String(Array.isArray(cfg?.streamers) ? cfg.streamers.join(',') : cfg?.streamers || '')
      .split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];   // a ordem é a prioridade
    for (const s of streamers) if (!RE_CANAL.test(s)) throw new Error(`Nome de streamer inválido: ${s.slice(0, 30)}`);
    if (!streamers.length) throw new Error('Informe pelo menos um streamer.');
    const proxy = String(cfg?.proxy || '').trim();
    if (proxy && !RE_PROXY.test(proxy)) throw new Error('Proxy inválido (use socks5://usuario:senha@host:porta).');
    const assistidos = Math.min(5, Math.max(1, Math.trunc(Number(cfg?.assistidos)) || 2));
    return { token, streamers, proxy: proxy || null, assistidos, alias: `conta-${slotSeguro(slot)}` };
  }

  function gerarConfig(c) {
    return JSON.stringify({
      Language: 'pt',   // o miner carrega lang/pt.lang (a cópia de lang/ vai junto)
      Debug: false,
      WebDashboard: { enabled: false, port: 5000 },   // sem painel web: evita conflito de porta entre contas
      Proxy: { enabled: false, url: '' },
      Accounts: [{ alias: c.alias, token: c.token, proxy: c.proxy, streamers: c.streamers, max_concurrent: c.assistidos }],
      Check_interval: 120,
      Reconnect_cooldown: 600,
      Connection_stagger_min: 3,
      Connection_stagger_max: 8,
    }, null, 2);
  }

  const slotSeguro = (slot) => String(slot).replace(/[^A-Za-z0-9_-]/g, '_');
  const dirConta = (slot) => path.join(dadosDir, `conta-${slotSeguro(slot)}`);

  // ---------- 4) processo por conta ----------
  const estadoDe = (slot) => contas.get(String(slot)) || { estado: 'parado', codigo: null, linhas: [] };

  const marcarRodando = (slot, reg) => {
    if (reg.estado === 'rodando') return;
    reg.estado = 'rodando'; reg.codigo = null;
    emitir(slot, { tipo: 'estado', estado: 'rodando', codigo: null, mensagem: reg.mensagem || '' });
  };
  const definirMensagem = (slot, reg, msg) => {
    if ((reg.mensagem || '') === msg) return;
    reg.mensagem = msg;
    emitir(slot, { tipo: 'estado', estado: reg.estado, codigo: null, mensagem: msg });
  };

  function tratarLinha(slot, bruta, reg) {
    const linha = bruta.replace(ANSI, '').trim();
    if (!linha) return;
    reg.linhas.push(linha);
    if (reg.linhas.length > MAX_LINHAS) reg.linhas.shift();

    const r = lerLinha(linha);
    if (r && r.pontos !== undefined) {
      const antes = reg.saldos.get(r.canal);
      const novo = {
        pontos: r.pontos, texto: r.texto, aprox: false,
        ganho: (antes?.ganho || 0) + r.ganho,
        online: antes?.online ?? reg.online.get(r.canal),
        t: Date.now(),
      };
      reg.saldos.set(r.canal, novo);
      emitir(slot, { tipo: 'saldo', canal: r.canal, ...novo });
      marcarRodando(slot, reg);
    } else if (r) {
      reg.online.set(r.canal, r.online);
      const antes = reg.saldos.get(r.canal);
      if (antes) {   // só atualiza o card se o saldo já é conhecido
        const novo = { ...antes, online: r.online, t: Date.now() };
        reg.saldos.set(r.canal, novo);
        emitir(slot, { tipo: 'saldo', canal: r.canal, ...novo });
      }
      marcarRodando(slot, reg);
    }

    if (/\]\s*(?:Iniciando|Запуск):|✅ (?:Assistindo|Смотрим)/.test(linha)) {
      marcarRodando(slot, reg);
      if (/✅ (?:Assistindo|Смотрим)/.test(linha)) definirMensagem(slot, reg, '');   // conseguiu entrar numa live: problema resolvido
    }
    for (const [re, msg] of PROBLEMAS) if (re.test(linha)) { definirMensagem(slot, reg, msg); break; }

    emitir(slot, { tipo: 'log', linha: linha.slice(0, 400) });
  }

  function iniciar(slot, cfgBruta) {
    slot = String(slot);
    if (contas.get(slot)?.proc) return { ok: true, mensagem: 'Já está rodando.' };

    if (!prontaCache) {
      const chk = checar();
      if (!chk.ok) { emitir(slot, { tipo: 'estado', estado: 'erro', mensagem: chk.mensagem }); return { ok: false, mensagem: chk.mensagem }; }
    }
    const { raiz, python } = prontaCache;
    aplicarPatchSaldo(raiz);

    let cfg;
    try { cfg = validar(cfgBruta, slot); } catch (e) {
      emitir(slot, { tipo: 'estado', estado: 'erro', mensagem: e.message });
      return { ok: false, mensagem: e.message };
    }

    const dir = dirConta(slot);
    try {
      fs.mkdirSync(dir, { recursive: true });
      // o miner abre "lang/en.lang" relativo ao diretório atual
      fs.cpSync(path.join(raiz, 'lang'), path.join(dir, 'lang'), { recursive: true, force: true });
      fs.writeFileSync(path.join(dir, 'config.json'), gerarConfig(cfg), { encoding: 'utf8', mode: 0o600 });   // tem o token: só o usuário lê
      limparLogsAntigos(path.join(dir, 'logs'), DIAS_LOGS);
    } catch (e) {
      const msg = `Não foi possível preparar a pasta da conta: ${e.message}`;
      emitir(slot, { tipo: 'estado', estado: 'erro', mensagem: msg });
      return { ok: false, mensagem: msg };
    }

    const proc = spawn(python.cmd, [...python.args, '-u', path.join(raiz, 'main.py')], {
      cwd: dir, env: envPython(raiz), windowsHide: true,
    });
    const reg = { proc, estado: 'iniciando', codigo: null, mensagem: '', linhas: [], saldos: new Map(), online: new Map(), pid: proc.pid };
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
function setupKickPresence({ app, ipcMain, shell, send, pastaExtra }) {
  const g = criarGerenciador({ app, shell, enviar: send, pastaExtra });
  ipcMain.handle('kick:checar', () => g.checar());
  ipcMain.handle('kick:instalar', () => g.instalarDependencias());
  ipcMain.handle('kick:iniciar', (_e, slot, cfg) => g.iniciar(slot, cfg));
  ipcMain.handle('kick:parar', (_e, slot) => g.parar(slot));
  ipcMain.handle('kick:parar-todas', () => { g.pararTodas(); return { ok: true }; });
  ipcMain.handle('kick:status', () => g.status());
  return g;
}

module.exports = { setupKickPresence, criarGerenciador, acharRaiz, limparLogsAntigos, lerLinha, aplicarPatchSaldo };
