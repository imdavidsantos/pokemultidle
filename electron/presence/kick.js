// Requer Python 3.12 (só essa versão).
// Gerencia o miner da pasta "mods/": confere se a pasta existe,
// gera o config.json de cada conta a partir das configurações do app e roda um processo Python por conta.
// O login é por TOKEN (Bearer) colado no painel.
// "config.json" e "lang/" do diretório atual, então cada conta ganha a própria pasta com uma cópia de lang/.
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const { net } = require('electron');
const crypto = require('crypto');
const { NOME_MODS, rodar, acharRaiz: acharRaizEm, localizarPasta: localizarPastaMiner, envPython: envPythonMiner, limparLogsAntigos, textoCurto } = require('./miner');

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

// Linha do rebalanceamento: "... [conta-1] Ativos: ['axt', 'clovaobengalalol'] (2/2)" = canais assistidos agora.
const RE_ATIVOS = /(?:Ativos|Активные|Active):\s*\[([^\]]*)\]/u;

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

// ---------- saldo de pontos pela API da Kick (usa o token da conta, sem depender do miner) ----------
// ATENÇÃO: confira este endereço no DevTools (abra um canal da Kick logado > Network > filtre por "points").
// Se for outro, é só trocar aqui; o resto do código não muda.
const URL_PONTOS = (slug) => `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/points`;
const PONTOS_PARALELO = 3;
const PONTOS_ESPERA_MS = 150;

const limparToken = (t) => String(t || '').trim().replace(/^Bearer\s+/i, '');

// 1ª tentativa: rede do Chromium (net.fetch), que passa melhor pelo Cloudflare que o fetch do Node.
async function pedirNet(url, token, opc = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await net.fetch(url, {
      method: opc.metodo || 'GET',
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/json', 'x-app-platform': 'web',
        ...(opc.corpo ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(opc.corpo ? { body: opc.corpo } : {}),
      signal: ctrl.signal,
    });
    return { status: r.status, corpo: await r.text() };
  } catch (e) {
    return { status: 0, corpo: '', erro: e?.message || 'Falha de rede.' };
  } finally { clearTimeout(to); }
}

// 2ª tentativa (se der 403 ou falha de rede): curl do sistema. O token vai por stdin, não aparece na linha de comando.
function pedirCurl(url, token, opc = {}) {
  return new Promise((resolve) => {
    let out = ''; let err = '';
    const p = spawn('curl', ['-sS', '-m', '15', '-X', opc.metodo || 'GET', '-w', '\n%{http_code}', '-K', '-', url], { windowsHide: true });
    p.stdout.on('data', (b) => { out += b; });
    p.stderr.on('data', (b) => { err += b; });
    p.on('error', (e) => resolve({ status: 0, corpo: '', erro: e.message }));
    p.on('close', () => {
      const i = out.lastIndexOf('\n');
      const status = Number(out.slice(i + 1)) || 0;
      resolve({ status, corpo: i >= 0 ? out.slice(0, i) : '', erro: status ? '' : err.trim() });
    });
    p.stdin.on('error', () => {});
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');   // escape do arquivo de config do curl
    p.stdin.end(`header = "Authorization: Bearer ${token}"\nheader = "Accept: application/json"\nheader = "x-app-platform: web"\n`
      + (opc.corpo ? `header = "Content-Type: application/json"\ndata = "${esc(opc.corpo)}"\n` : ''));
  });
}

async function chamar(url, token, opc = {}) {
  let r = await pedirNet(url, token, opc);
  if (r.status === 0 || r.status === 403) {
    const c = await pedirCurl(url, token, opc);
    if (c.status) r = c;
  }
  return r;
}

// Aceita { data: { points } } ou { points } (e variações comuns).
function extrairPontos(corpo) {
  let j;
  try { j = JSON.parse(corpo); } catch { return null; }
  const d = j && typeof j === 'object' && j.data && typeof j.data === 'object' ? j.data : j;
  if (!d || typeof d !== 'object') return null;
  for (const k of ['points', 'balance', 'channel_points', 'amount']) {
    if (d[k] === undefined || d[k] === null || d[k] === '') continue;
    const n = Number(d[k]);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

// cfgBruta = { token }, slugs = lista de canais. Devolve { ok, mensagem, saldos: { slug: { pontos } }, erros: { slug: texto } }.
async function buscarPontos(cfgBruta, slugsBrutos) {
  const token = limparToken(cfgBruta?.token);
  if (!token) return { ok: false, mensagem: 'Cole o token da Kick desta conta.', saldos: {}, erros: {} };
  if (!RE_TOKEN.test(token)) return { ok: false, mensagem: 'Token da Kick com formato inválido.', saldos: {}, erros: {} };
  const slugs = [...new Set((Array.isArray(slugsBrutos) ? slugsBrutos : [])
    .map((s) => String(s).trim().toLowerCase()).filter((s) => RE_CANAL.test(s)))].slice(0, 100);
  if (!slugs.length) return { ok: false, mensagem: 'Nenhum canal para consultar.', saldos: {}, erros: {} };

  const saldos = {}; const erros = {};
  let fatal = '';
  let prox = 0;

  const trabalhar = async () => {
    while (!fatal && prox < slugs.length) {
      const slug = slugs[prox++];
      const url = URL_PONTOS(slug);
      const r = await chamar(url, token);
      if (r.status === 401) fatal = 'Token da Kick inválido ou expirado (401).';
      else if (r.status === 429) fatal = 'A Kick limitou as consultas (429). Tente de novo em alguns minutos.';
      else if (r.status === 403) erros[slug] = '403 (bloqueio Cloudflare/IP).';
      else if (r.status === 404) erros[slug] = 'Sem pontos neste canal (404).';
      else if (r.status >= 200 && r.status < 300) {
        const pontos = extrairPontos(r.corpo);
        if (pontos === null) erros[slug] = `Resposta inesperada: ${String(r.corpo).replace(/\s+/g, ' ').slice(0, 120)}`;
        else saldos[slug] = { pontos };
      } else erros[slug] = r.erro || `HTTP ${r.status}`;
      await new Promise((ok) => setTimeout(ok, PONTOS_ESPERA_MS));
    }
  };
  await Promise.all(Array.from({ length: Math.min(PONTOS_PARALELO, slugs.length) }, trabalhar));

  const nSaldos = Object.keys(saldos).length;
  const primeiroErro = Object.values(erros)[0] || '';
  return {
    ok: !fatal && nSaldos > 0,
    mensagem: fatal || (nSaldos ? '' : primeiroErro || 'Não consegui ler nenhum saldo.'),
    saldos,
    erros,
  };
}

// ---------- recompensas de um streamer (listar e resgatar) ----------
// Endereços conferidos no DevTools (GET .../rewards?is_enabled=true e POST .../rewards/{id}/redeem). A Kick não documenta
// o lado "espectador" das recompensas, então se algo mudar, copie de novo do DevTools (Network) e ajuste as definições abaixo.
const URL_RECOMPENSAS = (slug) => `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/rewards?is_enabled=true`;
const URL_RESGATE = (slug, id) => `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/rewards/${encodeURIComponent(id)}/redeem`;
// Confirmado no DevTools: o corpo do resgate é só { transaction_id } com um ULID novo a cada resgate (o id da recompensa vai na URL).
// O campo do texto digitado (recompensas que pedem mensagem) NÃO foi confirmado: "user_input" é um palpite.
const ALFABETO_ULID = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function novoUlid() {
  let tempo = Date.now();
  let s = '';
  for (let i = 0; i < 10; i++) { s = ALFABETO_ULID[tempo % 32] + s; tempo = Math.floor(tempo / 32); }
  const r = crypto.randomBytes(16);
  for (let i = 0; i < 16; i++) s += ALFABETO_ULID[r[i] % 32];
  return s;   // 26 caracteres: 10 de data + 16 aleatórios
}
const corpoResgate = (id, texto) => ({ transaction_id: novoUlid(), ...(texto ? { user_input: texto } : {}) });
const RE_ID_REC = /^[A-Za-z0-9_-]{1,64}$/;


// Aceita lista direta, { data: [...] }, { rewards: [...] } ou { data: { rewards: [...] } }.
function normalizarRecompensas(corpo) {
  let j;
  try { j = JSON.parse(corpo); } catch { return null; }
  let arr = Array.isArray(j) ? j : (j?.data ?? j?.rewards);
  if (arr && !Array.isArray(arr)) arr = arr.rewards ?? arr.items ?? arr.data;
  if (!Array.isArray(arr)) return null;
  return arr.map((r) => {
    const cor = String(r?.background_color ?? r?.color ?? '');
    return {
      id: String(r?.id ?? r?.reward_id ?? ''),
      titulo: textoCurto(r?.title ?? r?.name, 80),
      descricao: textoCurto(r?.description, 200),
      custo: Math.max(0, Math.trunc(Number(r?.cost ?? r?.price ?? r?.points ?? 0)) || 0),
      ativo: (r?.is_enabled ?? r?.enabled ?? true) !== false && !(r?.is_paused ?? r?.paused),
      pedeTexto: !!(r?.is_user_input_required ?? r?.user_input_required ?? r?.requires_input),
      cor: /^#[0-9a-f]{3,8}$/i.test(cor) ? cor : '',
    };
  }).filter((r) => RE_ID_REC.test(r.id) && r.titulo);
}

function tokenValido(cfgBruta) {
  const token = limparToken(cfgBruta?.token);
  if (!token) return { erro: 'Cole o token da Kick desta conta.' };
  if (!RE_TOKEN.test(token)) return { erro: 'Token da Kick com formato inválido.' };
  return { token };
}

const msgHttp = (r) => {
  if (r.status === 401) return 'Token da Kick inválido ou expirado (401).';
  if (r.status === 403) return 'A Kick bloqueou o pedido (403: Cloudflare/IP ou sem permissão).';
  if (r.status === 404) return 'Não encontrado (404): confira o endereço no DevTools.';
  if (r.status === 429) return 'A Kick limitou os pedidos (429). Tente de novo em instantes.';
  return r.erro || `HTTP ${r.status}`;
};

// Devolve { ok, mensagem, lista: [{ id, titulo, descricao, custo, ativo, pedeTexto, cor }] }.
async function buscarRecompensas(cfgBruta, slugBruto) {
  const v = tokenValido(cfgBruta);
  if (v.erro) return { ok: false, mensagem: v.erro, lista: [] };
  const slug = String(slugBruto || '').trim().toLowerCase();
  if (!RE_CANAL.test(slug)) return { ok: false, mensagem: 'Streamer inválido.', lista: [] };
  const r = await chamar(URL_RECOMPENSAS(slug), v.token);
  if (!(r.status >= 200 && r.status < 300)) return { ok: false, mensagem: msgHttp(r), lista: [] };
  const lista = normalizarRecompensas(r.corpo);
  if (!lista) return { ok: false, mensagem: `Resposta inesperada: ${textoCurto(r.corpo, 120)}`, lista: [] };
  return { ok: true, mensagem: '', lista };
}

// Gasta pontos de verdade: só é chamado depois do clique + confirmação do usuário.
async function resgatarRecompensa(cfgBruta, slugBruto, idBruto, textoBruto) {
  const v = tokenValido(cfgBruta);
  if (v.erro) return { ok: false, mensagem: v.erro };
  const slug = String(slugBruto || '').trim().toLowerCase();
  const id = String(idBruto || '');
  if (!RE_CANAL.test(slug) || !RE_ID_REC.test(id)) return { ok: false, mensagem: 'Recompensa inválida.' };
  const texto = textoCurto(textoBruto, 500);
  const r = await chamar(URL_RESGATE(slug, id), v.token, { metodo: 'POST', corpo: JSON.stringify(corpoResgate(id, texto)) });
  let msg = '';
  try {
    const j = JSON.parse(r.corpo);
    msg = textoCurto(j?.message ?? j?.error ?? j?.data?.message, 160);
    // erro de validação (422): mostra qual campo a Kick reclamou, ex.: "reward_id: obrigatório"
    if (j?.errors && typeof j.errors === 'object') {
      const det = Object.entries(j.errors).map(([k, v]) => `${k}: ${[].concat(v).join(' ')}`).join(' | ');
      if (det) msg = `${msg} [${textoCurto(det, 200)}]`.trim();
    }
  } catch { /* sem JSON */ }
  if (r.status >= 200 && r.status < 300) return { ok: true, mensagem: 'Resgatado! Chegará no jogo em 1 minuto!' };
  return { ok: false, mensagem: `${msg || msgHttp(r)} (HTTP ${r.status})` };
}

function criarGerenciador({ app, shell, enviar, pastaExtra }) {
  void shell;
  const contas = new Map();    // slot -> { proc, estado, codigo, linhas, saldos, pid }
  let prontaCache = null;      // { raiz, python } da última checagem ok
  const dadosDir = path.join(app.getPath('userData'), 'kick-presence-data');

  const emitir = (slot, patch) => enviar('kick:evento', { slot: String(slot), ...patch });

  // ---------- 1) a pasta existe? ----------
  const localizarPasta = () => localizarPastaMiner({ app, pastaExtra, envDir: 'KICK_MINER_DIR', nomeMiner: NOME_MINER, isRaiz });

  // ---------- 2) Python 3.12 (o miner só funciona nessa versão; venv da própria pasta primeiro) ----------
  const PY_VERSAO = '3.12';
  let pythonOutros = [];   // versões encontradas que não servem (para a mensagem de erro)

  async function acharPython(raiz) {
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
      const r = await rodar(c.cmd, [...c.args, '--version'], { timeout: 10000 });
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

  const envPython = (raiz) => envPythonMiner(raiz, { PYTHONUTF8: '1' });

  async function checarInterno() {
    prontaCache = null;
    const { raiz, procurou } = localizarPasta();
    if (!raiz) {
      return { ok: false, etapa: 'pasta', mensagem: `Pasta "${NOME_MODS}" não encontrada.`, procurou };
    }
    const py = await acharPython(raiz);
    if (!py) return { ok: false, etapa: 'python', raiz, mensagem: msgSemPython() };
    // o mesmo que o main.py importa (rnet, loguru, curl_cffi, flask via web_server)
    const t = await rodar(py.cmd, [...py.args, '-c', 'import account_manager, web_server'], { env: envPython(raiz), cwd: raiz });
    if (t.status !== 0) {
      const ultima = String(t.stderr || '').trim().split(/\r?\n/).pop() || 'erro desconhecido';
      return { ok: false, etapa: 'dependencias', raiz, mensagem: `Faltam dependências do miner (${ultima}).` };
    }
    prontaCache = { raiz, python: py };
    return { ok: true, raiz, mensagem: 'Pasta encontrada e pronta.' };
  }

  let checando = null;
  const checar = () => { if (!checando) checando = checarInterno().finally(() => { checando = null; }); return checando; };

  // Os dois miners têm requirements.txt e ficam na mesma pasta: use "requirements-kick.txt" para o deste miner
  // (se não existir, cai no requirements.txt comum).
  const arqRequisitos = (raiz) => (fs.existsSync(path.join(raiz, 'requirements-kick.txt')) ? 'requirements-kick.txt' : 'requirements.txt');

  async function instalarDependencias() {
    const { raiz } = localizarPasta();
    if (!raiz) return Promise.resolve({ ok: false, mensagem: `Pasta "${NOME_MODS}" não encontrada.` });
    const py = await acharPython(raiz);
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

  // O miner lê o token de um config.json em texto puro. Para não deixar o token solto em disco, o arquivo só existe
  // enquanto o miner roda: some ao parar, ao fechar o app e (sobras de uma queda) ao abrir o app.
  const apagarConfig = (dir) => { try { fs.rmSync(path.join(dir, 'config.json'), { force: true }); } catch { /* em uso: tenta de novo depois */ } };
  const apagarTodosConfigs = () => {
    let nomes = [];
    try { nomes = fs.readdirSync(dadosDir); } catch { return; }   // a pasta ainda não existe
    for (const nome of nomes) apagarConfig(path.join(dadosDir, nome));
  };
  apagarTodosConfigs();

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

    const at = RE_ATIVOS.exec(linha);
    if (at) {   // quem o miner está assistindo agora (o "Farmando" usa isso para pintar de verde)
      reg.ativos = [...at[1].matchAll(/['"]([A-Za-z0-9_-]{1,50})['"]/g)].map((m) => m[1].toLowerCase());
      emitir(slot, { tipo: 'ativos', canais: reg.ativos });
    }

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

  async function iniciar(slot, cfgBruta) {
    slot = String(slot);
    if (contas.get(slot)?.proc) return { ok: true, mensagem: 'Já está rodando.' };

    if (!prontaCache) {
      const chk = await checar();
      if (!chk.ok) { emitir(slot, { tipo: 'estado', estado: 'erro', mensagem: chk.mensagem }); return { ok: false, mensagem: chk.mensagem }; }
      // outra chamada pode ter iniciado esta conta enquanto a checagem rodava
      if (contas.get(slot)?.proc) return { ok: true, mensagem: 'Já está rodando.' };
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
    const reg = { proc, estado: 'iniciando', codigo: null, mensagem: '', linhas: [], saldos: new Map(), online: new Map(), ativos: [], pid: proc.pid };
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
      apagarConfig(dir);
      emitir(slot, { tipo: 'estado', estado: 'erro', mensagem: e.message });
    });
    proc.on('close', (code) => {
      if (resto) tratarLinha(slot, resto, reg);
      contas.delete(slot);
      apagarConfig(dir);   // o token em texto puro não fica em disco com o miner parado
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
  app.on('before-quit', () => { pararTodas(true); apagarTodosConfigs(); });

  const status = () => Object.fromEntries([...contas.entries()].map(([s, r]) => [s, { estado: r.estado, codigo: r.codigo, linhas: r.linhas.slice(-30), saldos: Object.fromEntries(r.saldos), ativos: r.ativos || [] }]));

  return { checar, instalarDependencias, iniciar, parar, pararTodas, status, estadoDe, gerarConfig, validar };
}

// Registra os canais IPC. Chame uma vez no main.js.
// obterToken(slot) devolve o token da conta guardado no cofre (tokenVault.js). A interface só manda o slot.
function setupKickPresence({ app, ipcMain, shell, send, pastaExtra, obterToken = () => null }) {
  const cfgDoToken = (slot) => ({ token: obterToken(slot) });
  const g = criarGerenciador({ app, shell, enviar: send, pastaExtra });
  ipcMain.handle('kick:checar', () => g.checar());
  ipcMain.handle('kick:instalar', () => g.instalarDependencias());
  ipcMain.handle('kick:iniciar', (_e, slot, cfg) => g.iniciar(slot, { ...(cfg || {}), token: obterToken(slot) }));   // o token nunca vem da interface
  ipcMain.handle('kick:parar', (_e, slot) => g.parar(slot));
  ipcMain.handle('kick:parar-todas', () => { g.pararTodas(); return { ok: true }; });
  ipcMain.handle('kick:status', () => g.status());
  ipcMain.handle('kick:pontos', (_e, slot, slugs) => buscarPontos(cfgDoToken(slot), slugs));   // saldo pelo token
  ipcMain.handle('kick:recompensas', (_e, slot, slug) => buscarRecompensas(cfgDoToken(slot), slug));
  ipcMain.handle('kick:resgatar', (_e, slot, slug, id, texto) => resgatarRecompensa(cfgDoToken(slot), slug, id, texto));
  return g;
}

// Mantido no export (usado por testes/ferramentas): procura a raiz deste miner.
const acharRaiz = (base) => acharRaizEm(base, isRaiz);

module.exports = { setupKickPresence, criarGerenciador, acharRaiz, limparLogsAntigos, lerLinha, aplicarPatchSaldo, tokenValido, buscarPontos, extrairPontos, buscarRecompensas, resgatarRecompensa, normalizarRecompensas };
