const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// Caminho do preload que será injetado em cada <webview> (controle de volume)
contextBridge.exposeInMainWorld('pokemultidle', {
  webviewPreload: pathToFileURL(path.join(__dirname, 'webview-preload.js')).href,
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  limparDados: (slot) => ipcRenderer.invoke('conta:limpar-dados', slot),   // reset da sessão de uma conta
});

// Twitch Presence
contextBridge.exposeInMainWorld('twitch', {
  checar: () => ipcRenderer.invoke('twitch:checar'),
  instalar: () => ipcRenderer.invoke('twitch:instalar'),
  iniciar: (slot, cfg) => ipcRenderer.invoke('twitch:iniciar', slot, cfg),
  parar: (slot) => ipcRenderer.invoke('twitch:parar', slot),
  pararTodas: () => ipcRenderer.invoke('twitch:parar-todas'),
  status: () => ipcRenderer.invoke('twitch:status'),
  aoMudar: (cb) => {
    const f = (_e, dados) => cb(dados);
    ipcRenderer.on('twitch:evento', f);
    return () => ipcRenderer.removeListener('twitch:evento', f);
  },
});
