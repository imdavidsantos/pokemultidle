const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// Caminho do preload que será injetado em cada <webview> (controle de volume)
contextBridge.exposeInMainWorld('pokemultidle', {
  webviewPreload: pathToFileURL(path.join(__dirname, 'webview-preload.js')).href,
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  readTwitchLogin: (slot) => ipcRenderer.invoke('twitch:login', slot),
  readTwitchChannels: () => ipcRenderer.invoke('twitch:canais'),
  openTwitchLogin: (slot) => ipcRenderer.invoke('twitch:entrar', slot),
  onTwitchChannels: (cb) => {
      const f = (_e, canais) => cb(canais);
      ipcRenderer.on('twitch:canais', f);
      return () => ipcRenderer.removeListener('twitch:canais', f);
    },
});
