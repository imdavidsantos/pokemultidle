const { app, BrowserWindow, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

function setupAutoUpdate(win) {
  if (!app.isPackaged) return; // em desenvolvimento não há o que atualizar

  autoUpdater.autoDownload = false; // só baixa se o usuário aceitar

  autoUpdater.on('update-available', async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Atualizar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      title: 'Atualização disponível',
      message: `Nova versão ${info.version} disponível.`,
      detail: 'Deseja baixar e instalar agora?',
    });
    if (response === 0) autoUpdater.downloadUpdate();
  });

  autoUpdater.on('update-downloaded', async () => {
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

  autoUpdater.on('error', (err) => console.error('Erro ao atualizar:', err));

  autoUpdater.checkForUpdates().catch((err) => console.error('Falha ao checar atualização:', err));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    title: 'Pokemultidle 3.0',
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
