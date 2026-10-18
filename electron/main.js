const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'pokemultidle-dev'));
}

const isDev = process.env.NODE_ENV === 'development';

const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 horas

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

  // Pedido vindo do botão da interface (registrado antes do return do modo dev)
  ipcMain.removeHandler('updater:check'); // evita registro duplicado se a janela for recriada
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return { status: 'dev' };
    if (readyToInstall) return { status: 'ready' };
    if (busy) return { status: 'busy' };
    dismissed = false; // pedido manual: volta a perguntar se houver versão nova
    return manualCheck();
  });

  if (!app.isPackaged) return; // em desenvolvimento não há o que atualizar

  autoUpdater.autoDownload = false; // só baixa se o usuário aceitar

  autoUpdater.on('update-available', async (info) => {
    if (busy || readyToInstall) return;
    busy = true;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Atualizar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      title: 'Atualização disponível',
      message: `Nova versão ${info.version} disponível.`,
      detail: 'Deseja baixar e instalar agora?',
    });
    if (response === 0) {
      autoUpdater.downloadUpdate().catch((err) => {
        console.error('Erro ao baixar atualização:', err);
        busy = false;
      });
    } else {
      busy = false;
      dismissed = true; // a checagem automática para de perguntar nesta sessão
    }
  });

  autoUpdater.on('update-downloaded', async () => {
    readyToInstall = true;
    busy = false;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Reiniciar e instalar', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      title: 'Atualização pronta',
      message: 'A atualização foi baixada.',
      detail: 'Reiniciar agora para instalar? Seus logins ficam salvos.',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  autoUpdater.on('error', (err) => {
    console.error('Erro ao atualizar:', err);
    busy = false;
  });

  const check = () => {
    if (busy || dismissed || readyToInstall) return;
    autoUpdater.checkForUpdates().catch((err) => console.error('Falha ao checar atualização:', err));
  };

  check();                               // ao abrir o app
  setInterval(check, CHECK_INTERVAL_MS); // e a cada 12 horas
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 900,
    minHeight: 600,
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

  win.on('page-title-updated', (e) => e.preventDefault()); // mantém o título do app

  if (isDev) {
    win.loadURL('http://localhost:5173');
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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});