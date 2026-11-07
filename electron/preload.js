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
  // pontos/recompensas/resgatar recebem o número da conta (slot): o token vem do cofre no processo principal
  pontos: (slot, slugs) => ipcRenderer.invoke('twitch:pontos', slot, slugs),
  recompensas: (slot, slug) => ipcRenderer.invoke('twitch:recompensas', slot, slug),
  resgatar: (slot, slug, id, texto, canalId, custo, titulo) => ipcRenderer.invoke('twitch:resgatar', slot, slug, id, texto, canalId, custo, titulo),
  aoMudar: (cb) => {
    const f = (_e, dados) => cb(dados);
    ipcRenderer.on('twitch:evento', f);
    return () => ipcRenderer.removeListener('twitch:evento', f);
  },
});

// Kick Presence
contextBridge.exposeInMainWorld('kick', {
  checar: () => ipcRenderer.invoke('kick:checar'),
  instalar: () => ipcRenderer.invoke('kick:instalar'),
  iniciar: (slot, cfg) => ipcRenderer.invoke('kick:iniciar', slot, cfg),
  parar: (slot) => ipcRenderer.invoke('kick:parar', slot),
  pararTodas: () => ipcRenderer.invoke('kick:parar-todas'),
  status: () => ipcRenderer.invoke('kick:status'),
  pontos: (slot, slugs) => ipcRenderer.invoke('kick:pontos', slot, slugs),
  recompensas: (slot, slug) => ipcRenderer.invoke('kick:recompensas', slot, slug),
  resgatar: (slot, slug, id, texto) => ipcRenderer.invoke('kick:resgatar', slot, slug, id, texto),
  aoMudar: (cb) => {
    const f = (_e, dados) => cb(dados);
    ipcRenderer.on('kick:evento', f);
    return () => ipcRenderer.removeListener('kick:evento', f);
  },
});

// Cofre de tokens (Twitch/Kick). Só dá para guardar, remover e saber QUAIS contas têm token:
// o valor do token nunca volta para a interface.
contextBridge.exposeInMainWorld('tokens', {
  estado: () => ipcRenderer.invoke('token:estado'),                              // { persistente }
  lista: (plataforma) => ipcRenderer.invoke('token:lista', plataforma),          // ['1', '3']
  salvar: (plataforma, slot, valor) => ipcRenderer.invoke('token:salvar', plataforma, slot, valor),
  remover: (plataforma, slot) => ipcRenderer.invoke('token:remover', plataforma, slot),
});
