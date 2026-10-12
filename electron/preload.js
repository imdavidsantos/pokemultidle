const { contextBridge } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// Caminho do preload que será injetado em cada <webview> (controle de volume)
contextBridge.exposeInMainWorld('pokemultidle', {
  webviewPreload: pathToFileURL(path.join(__dirname, 'webview-preload.js')).href,
});
