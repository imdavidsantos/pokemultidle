// PROCESSO PRINCIPAL do Electron (main.js). Lê o login da Twitch salvo na conta e confere se ainda vale.
//
//   const { registrarLoginTwitch } = require('./twitchLogin.main');
//   app.whenReady().then(() => { registrarLoginTwitch(); /* ... */ });
//
// E no preload.js da janela principal, junto do que já é exposto:
//   readTwitchLogin: (slot) => ipcRenderer.invoke('twitch:login', slot),
//
// O login fica nos cookies da conta (partição do webview), depois que você entra na Twitch pelo Lives.
// Nomes de cookie usados pela web da Twitch: "auth-token" (o token) e "login" (o usuário).
// Se não achar, liste os cookies da conta para conferir:
//   (await session.fromPartition('persist:pokemultidle-slot-1').cookies.get({ domain: 'twitch.tv' })).map(c => c.name)

const { ipcMain, session, net, BrowserWindow } = require('electron');

const doFetch = net && typeof net.fetch === 'function' ? net.fetch.bind(net) : fetch;

const janelasLogin = new Map();   // slot -> janela de login aberta

function abrirLoginTwitch(slot, pai) {
  const aberta = janelasLogin.get(slot);
  if (aberta && !aberta.isDestroyed()) { aberta.focus(); return; }

  const ses = session.fromPartition(`persist:pokemultidle-slot-${slot}`);
  const win = new BrowserWindow({
    width: 520,
    height: 780,
    parent: pai || undefined,
    title: 'Entrar na Twitch',
    autoHideMenuBar: true,
    backgroundColor: '#18181b',
    webPreferences: { session: ses, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  janelasLogin.set(slot, win);

  // sem "Electron/..." no user agent, para a Twitch tratar como navegador comum
  win.webContents.setUserAgent(win.webContents.getUserAgent().replace(/\s(Electron|pokemultidle)\/\S+/gi, ''));

  // quando o cookie do login aparecer, espera a Twitch terminar de gravar o resto e fecha
  const aoMudar = (_e, cookie, _causa, removido) => {
    if (removido || cookie.name !== 'auth-token' || !cookie.domain.includes('twitch.tv')) return;
    setTimeout(() => { if (!win.isDestroyed()) win.close(); }, 1500);
  };
  ses.cookies.on('changed', aoMudar);
  win.on('closed', () => {
    ses.cookies.removeListener('changed', aoMudar);
    janelasLogin.delete(slot);
  });

  win.loadURL('https://www.twitch.tv/login');
}

function registrarLoginTwitch() {
  ipcMain.handle('twitch:login', async (_evento, slot) => {
    if (!Number.isInteger(slot) || slot < 0) return { token: null, login: null, expirado: false };

    const ses = session.fromPartition(`persist:pokemultidle-slot-${slot}`);
    const cookies = await ses.cookies.get({ domain: 'twitch.tv' });
    // console.log('[twitch-login] slot', slot, 'cookies:', cookies.map((c) => c.name));
    const valor = (nome) => cookies.find((c) => c.name === nome)?.value || null;

    const token = valor('auth-token');
    let login = valor('login');
    if (!token) return { token: null, login, expirado: false, nomes: cookies.map((c) => c.name) };

    // Endpoint oficial de validação: 401 = login vencido; sem resposta, segue com o login do cookie.
    try {
      const r = await doFetch('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `OAuth ${token}` },
        signal: AbortSignal.timeout(15000),
      });
      if (r.status === 401) return { token: null, login, expirado: true };
      if (r.ok) login = (await r.json()).login || login;
    } catch {
      /* sem rede agora: o chat tenta de novo */
    }
    return { token, login, expirado: false };
  });

  ipcMain.handle('twitch:entrar', (evento, slot) => {
    if (!Number.isInteger(slot) || slot < 0) return false;
    abrirLoginTwitch(slot, BrowserWindow.fromWebContents(evento.sender));
    return true;
  });
}

module.exports = { registrarLoginTwitch };
