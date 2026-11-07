const { app, BrowserWindow, shell, dialog, ipcMain, webContents, session, safeStorage } = require('electron');
const path = require('path');
const { fileURLToPath } = require('url');
const fs = require('fs');
const { setupTwitchPresence, tokenValido: tokenValidoTwitch } = require('./presence/twitch');
const { setupKickPresence, tokenValido: tokenValidoKick } = require('./presence/kick');
const { setupTokenVault } = require('./tokenVault');

if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'pokemultidle-dev'));
}

const isDev = process.env.NODE_ENV === 'development';
const ABRIR_DEVTOOLS = false;    // só vale no npm run dev; sempre mudar quando quiser abrir o devtools
const VER_DESEMPENHO = false;   // só vale no npm run dev; sempre mudar quando quiser ver o desempenho

// <webview>: só pode abrir os sites que o app usa e só o jogo recebe o preload do app
const ORIGEM_JOGO = 'https://pokeidle.io';
const ORIGENS_WEBVIEW = [ORIGEM_JOGO, 'https://pokeidle-gg.pages.dev'];
const PRELOAD_JOGO = path.resolve(__dirname, 'webview-preload.js');
const ehPreloadDoJogo = (v) => {
  if (!v) return false;
  try {
    const p = String(v).startsWith('file:') ? fileURLToPath(v) : String(v);
    return path.resolve(p).toLowerCase() === PRELOAD_JOGO.toLowerCase();
  } catch { return false; }
};

const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 horas
const PRIMEIRA_CHECAGEM_MS = 8000;             // deixa o app abrir antes de checar atualização
const FALHAS_PARA_AVISAR = 3;                  // checagens seguidas com erro até avisar o usuário

// ---------------------------------------------------------------------------
// Log em arquivo (sem dependência nova). Fica na pasta de dados do app: <userData>/logs/main.log
// ---------------------------------------------------------------------------
const PASTA_LOGS = path.join(app.getPath('userData'), 'logs');
const ARQ_LOG = path.join(PASTA_LOGS, 'main.log');
const LOG_MAX_BYTES = 512 * 1024;

const texto = (a) => {
  if (a instanceof Error) return a.stack || a.message;
  if (typeof a === 'string') return a;
  try { return JSON.stringify(a); } catch { return String(a); }
};

function escrever(nivel, args) {
  const linha = `${new Date().toISOString()} [${nivel}] ${args.map(texto).join(' ')}\n`;
  try {
    fs.mkdirSync(PASTA_LOGS, { recursive: true });
    try { if (fs.statSync(ARQ_LOG).size > LOG_MAX_BYTES) fs.renameSync(ARQ_LOG, `${ARQ_LOG}.old`); } catch { /* ainda não existe */ }
    fs.appendFileSync(ARQ_LOG, linha);
  } catch { /* log nunca pode derrubar o app */ }
}

const log = {
  info: (...a) => { console.log(...a); escrever('info', a); },
  warn: (...a) => { console.warn(...a); escrever('warn', a); },
  error: (...a) => { console.error(...a); escrever('error', a); },
};

// ---------------------------------------------------------------------------
// Estado de saúde: detecta "abriu mal" e "atualização não foi aplicada" na abertura seguinte.
// ---------------------------------------------------------------------------
const ARQ_ESTADO = path.join(app.getPath('userData'), 'saude.json');

function lerEstado() {
  try { return JSON.parse(fs.readFileSync(ARQ_ESTADO, 'utf8')); } catch { return {}; }
}

function salvarEstado(patch) {
  const novo = { ...lerEstado(), ...patch };   // valor undefined some do JSON
  try { fs.writeFileSync(ARQ_ESTADO, JSON.stringify(novo)); } catch (err) { log.warn('Não consegui gravar saude.json:', err); }
  return novo;
}

// Lê o que ficou da última execução, devolve os avisos e já marca esta abertura como "em andamento".
function verificarSaude() {
  const est = lerEstado();
  const versao = app.getVersion();
  const avisos = [];

  if (est.iniciando) {
    avisos.push(`A última abertura (versão ${est.versaoIniciada || '?'}) não terminou de carregar a interface.`);
  }
  if (est.instalando) {
    if (est.instalando.para === versao) {
      log.info(`Atualização aplicada com sucesso: ${est.instalando.de} -> ${versao}`);
    } else {
      avisos.push(`A atualização para a versão ${est.instalando.para} não foi aplicada: o app continua na versão ${versao}.`);
    }
  }

  salvarEstado({ iniciando: true, versaoIniciada: versao, instalando: undefined });
  log.info(`Abrindo Pokemultidle ${versao} (${app.isPackaged ? 'instalado' : 'dev'})`);
  return avisos;
}

async function mostrarAvisos(avisos) {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Abrir pasta de logs', 'Continuar'],
    defaultId: 1,
    cancelId: 1,
    title: 'Aviso do Pokemultidle',
    message: avisos.join('\n\n'),
    detail: `Detalhes técnicos no log:\n${ARQ_LOG}`,
  });
  if (response === 0) shell.openPath(PASTA_LOGS);
}

// Erros que antes passavam em silêncio
let avisouErroGlobal = false;
process.on('uncaughtException', (err) => {
  log.error('uncaughtException:', err);
  if (!avisouErroGlobal && app.isReady()) {
    avisouErroGlobal = true;
    dialog.showErrorBox('Erro inesperado', `${err?.message || err}\n\nLog: ${ARQ_LOG}`);
  }
});
process.on('unhandledRejection', (r) => log.error('unhandledRejection:', r));

// ---------------------------------------------------------------------------
// Atualizador: nunca pode impedir o app de abrir
// ---------------------------------------------------------------------------
let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (err) {
  log.error('Não consegui carregar o electron-updater (confira se ele está em "dependencies" do package.json):', err);
}

// Motivo pelo qual o atualizador não pode funcionar neste pacote (ou null se está tudo certo).
function motivoSemAtualizador() {
  if (!autoUpdater) return 'o módulo de atualização não está no pacote instalado';
  if (!fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
    return 'o pacote não tem o app-update.yml (build sem "publish" configurado)';
  }
  return null;
}

// Verificação manual (menu Configurações → Verificar atualizações).
// Devolve o resultado para a interface. Se houver versão nova, o diálogo de
// "Atualização disponível" continua sendo aberto pelo handler normal.
function manualCheck() {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => finish({ status: 'error', message: 'timeout' }), 20000);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      autoUpdater.removeListener('update-available', onAvailable);
      autoUpdater.removeListener('update-not-available', onNone);
      autoUpdater.removeListener('error', onError);
      resolve(result);
    };
    const onAvailable = (info) => finish({ status: 'available', version: info.version });
    const onNone = () => finish({ status: 'none' });
    const onError = (err) => finish({ status: 'error', message: String(err?.message || err) });

    autoUpdater.on('update-available', onAvailable);
    autoUpdater.on('update-not-available', onNone);
    autoUpdater.on('error', onError);
    autoUpdater.checkForUpdates().catch(onError);
  });
}

function setupAutoUpdate(win) {
  let busy = false;           // pergunta aberta ou download em andamento
  let dismissed = false;      // usuário escolheu "Depois": a checagem automática não pergunta de novo
  let readyToInstall = false; // atualização já baixada
  let baixando = false;       // download em andamento (para saber se um erro foi de download)
  let versaoBaixada = null;
  let falhasChecagem = 0;
  let avisouFalhas = false;
  let ultimoPct = -1;

  const motivo = app.isPackaged ? motivoSemAtualizador() : null;

  // Diálogo preso à janela só se ela ainda existe
  const caixa = (opts) => (win && !win.isDestroyed() ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts));
  const barra = (v) => { if (win && !win.isDestroyed()) win.setProgressBar(v); };

  // Pedido vindo do botão da interface (registrado antes do return do modo dev)
  ipcMain.removeHandler('updater:check'); // evita registro duplicado se a janela for recriada
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return { status: 'dev' };
    if (motivo) return { status: 'error', message: `Atualização indisponível: ${motivo}.` };
    if (readyToInstall) return { status: 'ready' };
    if (busy) return { status: 'busy' };
    dismissed = false; // pedido manual: volta a perguntar se houver versão nova
    return manualCheck();
  });

  if (!app.isPackaged) return; // em desenvolvimento não há o que atualizar

  if (motivo) {
    log.error(`Atualizador desativado: ${motivo}.`);
    // avisa uma vez por versão, para não incomodar a cada abertura
    if (lerEstado().avisouSemAtualizador !== app.getVersion()) {
      salvarEstado({ avisouSemAtualizador: app.getVersion() });
      mostrarAvisos([`O atualizador automático não vai funcionar: ${motivo}.`]);
    }
    return;
  }

  autoUpdater.logger = {
    info: (...a) => log.info('[updater]', ...a),
    warn: (...a) => log.warn('[updater]', ...a),
    error: (...a) => log.error('[updater]', ...a),
    debug: () => {},
  };
  autoUpdater.autoDownload = false; // só baixa se o usuário aceitar

  // Marca "instalando" para conferir, na próxima abertura, se a versão realmente mudou.
  const marcarInstalacao = () => {
    if (!versaoBaixada) return;
    salvarEstado({ instalando: { de: app.getVersion(), para: versaoBaixada, em: Date.now() } });
  };
  app.on('before-quit', () => { if (readyToInstall) marcarInstalacao(); });

  autoUpdater.on('update-available', async (info) => {
    falhasChecagem = 0;
    if (busy || readyToInstall) return;
    busy = true;
    const { response } = await caixa({
      type: 'info',
      buttons: ['Atualizar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      title: 'Atualização disponível',
      message: `Nova versão ${info.version} disponível.`,
      detail: 'Deseja baixar e instalar agora?',
    });
    if (response === 0) {
      baixando = true;
      ultimoPct = -1;
      log.info(`Baixando atualização ${info.version}`);
      autoUpdater.downloadUpdate().catch((err) => {
        // o evento 'error' também dispara e avisa o usuário; aqui só garante o estado
        log.error('Erro ao baixar atualização:', err);
        busy = false;
      });
    } else {
      busy = false;
      dismissed = true; // a checagem automática para de perguntar nesta sessão
    }
  });

  autoUpdater.on('update-not-available', () => { falhasChecagem = 0; });

  autoUpdater.on('download-progress', (p) => {
    barra(p.percent / 100);   // progresso na barra de tarefas
    const pct = Math.floor(p.percent);
    if (pct % 25 === 0 && pct !== ultimoPct) { ultimoPct = pct; log.info(`Download da atualização: ${pct}%`); }
  });

  autoUpdater.on('update-downloaded', async (info) => {
    readyToInstall = true;
    baixando = false;
    busy = false;
    versaoBaixada = info.version;
    barra(-1);
    log.info(`Atualização ${info.version} baixada`);
    const { response } = await caixa({
      type: 'info',
      buttons: ['Reiniciar e instalar', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      title: 'Atualização pronta',
      message: 'A atualização foi baixada.',
      detail: 'Reiniciar agora para instalar? Seus logins ficam salvos.',
    });
    if (response === 0) {
      marcarInstalacao();
      log.info('Reiniciando para instalar a atualização');
      autoUpdater.quitAndInstall(false, true);   // false = mostra o instalador, true = reabre o app depois
    }
  });

  autoUpdater.on('error', async (err) => {
    log.error('Erro ao atualizar:', err);
    barra(-1);
    busy = false;
    if (baixando) {   // erro durante o download: o usuário precisa saber
      baixando = false;
      await caixa({
        type: 'error',
        buttons: ['OK'],
        title: 'Falha ao baixar a atualização',
        message: 'Não consegui baixar a atualização. O app continua funcionando na versão atual.',
        detail: `${err?.message || err}\n\nLog: ${ARQ_LOG}`,
      });
    }
  });

  const check = () => {
    if (busy || dismissed || readyToInstall) return;
    autoUpdater.checkForUpdates().catch(async (err) => {
      falhasChecagem += 1;
      log.error(`Falha ao checar atualização (${falhasChecagem} seguidas):`, err);
      if (falhasChecagem >= FALHAS_PARA_AVISAR && !avisouFalhas) {
        avisouFalhas = true;   // só uma vez por sessão
        await caixa({
          type: 'warning',
          buttons: ['OK'],
          title: 'Atualizações',
          message: 'Não estou conseguindo verificar atualizações.',
          detail: `Pode ser a internet ou o servidor de atualizações. O app continua funcionando.\n\nÚltimo erro: ${err?.message || err}\nLog: ${ARQ_LOG}`,
        });
      }
    });
  };

  setTimeout(check, PRIMEIRA_CHECAGEM_MS);   // logo depois de abrir o app
  setInterval(check, CHECK_INTERVAL_MS);     // e a cada 12 horas
}

let janelaPrincipal = null;   // usada pelo Twitch Presence para avisar a interface

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 600,
    minHeight: 400,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    title: `Pokemultidle ${app.getVersion()}`,
    backgroundColor: '#14161f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,            // necessário para <webview>
      backgroundThrottling: false, // mantém os jogos rodando mesmo em segundo plano
    },
  });

  win.webContents.on('will-attach-webview', (e, webPreferences, params) => {
    let origem = '';
    try { origem = new URL(params.src).origin; } catch { /* src inválido */ }
    if (!ORIGENS_WEBVIEW.includes(origem)) {
      log.warn(`<webview> bloqueado (origem não permitida): ${params.src}`);
      e.preventDefault();
      return;
    }
    const preloadOk = origem === ORIGEM_JOGO && (ehPreloadDoJogo(webPreferences.preload) || ehPreloadDoJogo(webPreferences.preloadURL));
    if (!preloadOk) { delete webPreferences.preload; delete webPreferences.preloadURL; }
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
  });

  win.on('page-title-updated', (e) => e.preventDefault()); // mantém o título do app
  janelaPrincipal = win;
  win.on('closed', () => { if (janelaPrincipal === win) janelaPrincipal = null; });

  // A interface carregou: esta abertura deu certo.
  win.webContents.once('did-finish-load', () => {
    salvarEstado({ iniciando: false, ultimaVersaoOk: app.getVersion() });
    log.info('Interface carregada');
  });

  // Falhas que antes deixavam a janela em branco ou fechavam sem dizer nada
  win.webContents.on('did-fail-load', (_e, codigo, descricao, url, principal) => {
    if (!principal || codigo === -3) return;   // -3 = carregamento cancelado, normal
    log.error(`Falha ao carregar a interface: ${descricao} (${codigo}) ${url}`);
    dialog.showErrorBox('Não foi possível carregar a interface', `${descricao} (${codigo})\n${url}\n\nLog: ${ARQ_LOG}`);
  });

  win.webContents.on('render-process-gone', async (_e, detalhes) => {
    log.error('A interface travou (render-process-gone):', detalhes);
    if (win.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(win, {
      type: 'error',
      buttons: ['Recarregar', 'Fechar o app'],
      defaultId: 0,
      cancelId: 1,
      title: 'A interface parou de responder',
      message: 'A tela principal do app travou.',
      detail: `Motivo: ${detalhes.reason} (código ${detalhes.exitCode}).\nLog: ${ARQ_LOG}`,
    });
    if (response === 0 && !win.isDestroyed()) win.reload();
    else app.quit();
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    if (ABRIR_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });   // console numa janela separada
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Links externos abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  setupAutoUpdate(win);
}

// Mantém os jogos ativos mesmo com a janela minimizada/oculta
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(() => {
  const avisos = verificarSaude();   // lê o que ficou da última execução
  // Reset dos dados de uma conta: apaga cookies, login (localStorage/IndexedDB) e cache da partição dela.
  // A partição precisa ser a mesma usada no GameView.jsx.
  ipcMain.removeHandler('conta:limpar-dados');
  ipcMain.handle('conta:limpar-dados', async (_e, slot) => {
    const n = Number(slot);
    if (!Number.isInteger(n) || n < 1) return { ok: false, erro: 'Conta inválida.' };
    try {
      const ses = session.fromPartition(`persist:pokemultidle-slot-${n}`);
      await ses.clearStorageData();   // cookies, localStorage, IndexedDB, service workers...
      await ses.clearCache();
      await ses.clearAuthCache();
      log.info(`Dados da conta ${n} resetados`);
      return { ok: true };
    } catch (err) {
      log.error(`Falha ao resetar os dados da conta ${n}:`, err);
      return { ok: false, erro: String((err && err.message) || err) };
    }
  });

  createWindow();
  if (avisos.length) mostrarAvisos(avisos);   // sem await: não segura a abertura do app

  // Cofre dos tokens (criptografados com o safeStorage). Os tokens só são lidos aqui, no processo principal;
  // a interface só guarda/remove e pergunta quais contas têm token.
  const cofre = setupTokenVault({
    app, ipcMain, safeStorage, log,
    validar: { twitch: tokenValidoTwitch, kick: tokenValidoKick },   // também normaliza (ex.: tira o "Bearer")
  });

  // Twitch Presence: registra os canais IPC uma vez (o miner roda em processos Python, um por conta)
  setupTwitchPresence({
    app, ipcMain, shell,
    obterToken: (slot) => cofre.obter('twitch', slot),
    send: (canal, payload) => {
      if (janelaPrincipal && !janelaPrincipal.isDestroyed()) janelaPrincipal.webContents.send(canal, payload);
    },
  });

  // Kick Presence: mesmo esquema do Twitch (um processo Python por conta)
  setupKickPresence({
    app, ipcMain, shell,
    obterToken: (slot) => cofre.obter('kick', slot),
    send: (canal, payload) => {
      if (janelaPrincipal && !janelaPrincipal.isDestroyed()) janelaPrincipal.webContents.send(canal, payload);
    },
  });


  // para ver as metricas de desempenho no cmd
  if (isDev && VER_DESEMPENHO) {
    setInterval(() => {
      const metricas = app.getAppMetrics();
      const porPid = new Map(metricas.map((m) => [m.pid, m]));

      console.table(webContents.getAllWebContents().map((wc) => {
        const m = porPid.get(wc.getOSProcessId());
        return {
          tipo: wc.getType(),
          url: wc.getURL().slice(0, 45),
          mb: m ? Math.round(m.memory.workingSetSize / 1024) : '?',
          cpu: m ? m.cpu.percentCPUUsage.toFixed(1) : '?',
        };
      }));

      const gpu = metricas.find((m) => m.type === 'GPU');
      console.log('GPU cpu%:', gpu?.cpu.percentCPUUsage.toFixed(1));
    }, 30000);
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
