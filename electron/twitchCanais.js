// PROCESSO PRINCIPAL. Guarda a lista de canais oficiais do Bônus Twitch (userData/twitch-canais.json).
// O webview-preload lê estado.twitch.oficiais e avisa aqui; todas as contas têm a mesma lista,
// então só a primeira mudança conta e as repetidas são ignoradas.

const { app, ipcMain, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const arquivo = () => path.join(app.getPath('userData'), 'twitch-canais.json');   // calculado na hora: o main.js troca o userData no dev
const LOGIN_VALIDO = /^[a-z0-9_]{1,25}$/;

function lerSalvo() {
  try {
    const d = JSON.parse(fs.readFileSync(arquivo(), 'utf8'));
    return Array.isArray(d.canais) ? d.canais.filter((c) => LOGIN_VALIDO.test(c)) : [];
  } catch { return []; }
}

function limpar(lista) {
  if (!Array.isArray(lista) || lista.length > 200) return null;
  const canais = [...new Set(lista.map((c) => String(c).trim().toLowerCase()).filter((c) => LOGIN_VALIDO.test(c)))].sort();
  return canais.length ? canais : null;   // lista vazia nunca apaga a salva
}

function registrarCanaisTwitch(log = console) {
  let canais = lerSalvo();

  ipcMain.handle('twitch:canais', () => canais);

  ipcMain.on('twitch:oficiais', (evento, dados) => {
    if (evento.sender.getType() !== 'webview') return;
    const novos = limpar(dados && dados.canais);
    if (!novos || novos.join(',') === canais.join(',')) return;

    const entraram = novos.filter((c) => !canais.includes(c));
    const sairam = canais.filter((c) => !novos.includes(c));
    canais = novos;
    try { fs.writeFileSync(arquivo(), JSON.stringify({ canais, atualizadoEm: Date.now() })); }
    catch (err) { log.warn('Não consegui gravar twitch-canais.json:', err); }
    log.info(`[twitch] canais oficiais: ${canais.length} (novos: ${entraram.join(', ') || '-'}; saíram: ${sairam.join(', ') || '-'})`);

    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('twitch:canais', canais);
    }
  });
}

module.exports = { registrarCanaisTwitch };
