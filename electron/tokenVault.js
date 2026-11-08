// Cofre de tokens (Twitch e Kick), no processo principal.
//
// Por que existe: o token da Twitch (cookie auth-token) e o da Kick (Bearer) dão acesso à conta sem senha e sem 2FA.
// Antes ficavam em texto puro no localStorage da interface. Agora:
//   - ficam em disco CRIPTOGRAFADOS com o safeStorage do Electron (DPAPI no Windows, Keychain no macOS, libsecret/kwallet no Linux);
//   - só este processo descriptografa; a interface nunca recebe o token de volta (só sabe "tem" ou "não tem");
//   - as consultas à Twitch/Kick e o início do miner da Kick buscam o token aqui, pelo número da conta (slot).
//
// Se o sistema não tiver cofre (ex.: Linux sem gerenciador de senhas), o token NÃO vai para o disco:
// fica só em memória e some ao fechar o app. Isso é avisado à interface (`persistente: false`).

const fs = require('fs');
const path = require('path');

const PLATAFORMAS = ['twitch', 'kick'];
const MAX_SLOT = 99;
const MAX_TOKEN = 2000;

const slotValido = (slot) => {
  const n = Number(slot);
  return Number.isInteger(n) && n >= 1 && n <= MAX_SLOT ? String(n) : null;
};
const chaveDe = (plat, slot) => `${plat}:${slot}`;

// Validação mínima quando a plataforma não manda a sua (as de verdade ficam em twitchPresence/kickPresence).
const validarGenerico = ({ token }) => {
  const t = String(token ?? '').trim();
  if (!t) return { erro: 'Token vazio.' };
  // eslint-disable-next-line no-control-regex -- de propósito: token não pode ter espaço nem caractere de controle
  if (t.length > MAX_TOKEN || /[\s\x00-\x1f]/.test(t)) return { erro: 'Token com formato inválido.' };
  return { token: t };
};

/**
 * @param {object} op
 * @param {object} op.app          app do Electron (para userData)
 * @param {object} op.safeStorage  safeStorage do Electron (injetável para teste)
 * @param {object} op.log          { info, warn, error }
 * @param {object} [op.validar]    { twitch: ({token}) => ({token}|{erro}), kick: ... } (também normaliza: tira "Bearer", etc.)
 * @param {string} [op.arquivo]    caminho do arquivo (padrão: <userData>/tokens.enc.json)
 */
function criarCofre({ app, safeStorage, log, validar = {}, arquivo }) {
  const arq = arquivo || path.join(app.getPath('userData'), 'tokens.enc.json');
  const cifrados = new Map();   // "plat:slot" -> base64 do token criptografado (o que vai para o disco)
  const memoria = new Map();    // "plat:slot" -> token em claro, só quando não há cofre do sistema (nunca vai para o disco)
  const avisados = new Set();

  // O cofre do sistema existe e é de verdade? (no Linux, "basic_text" é texto puro disfarçado: não vale)
  function persistente() {
    try {
      if (!safeStorage.isEncryptionAvailable()) return false;
      const backend = typeof safeStorage.getSelectedStorageBackend === 'function' ? safeStorage.getSelectedStorageBackend() : null;
      return backend !== 'basic_text';
    } catch { return false; }
  }

  function carregar() {
    let bruto;
    try { bruto = fs.readFileSync(arq, 'utf8'); } catch { return; }   // ainda não existe
    try {
      const dados = JSON.parse(bruto);
      const itens = dados && typeof dados === 'object' ? dados.itens : null;
      if (!itens || typeof itens !== 'object') throw new Error('formato inesperado');
      for (const [chave, valor] of Object.entries(itens)) {
        const [plat, slot] = chave.split(':');
        if (PLATAFORMAS.includes(plat) && slotValido(slot) && typeof valor === 'string' && valor) cifrados.set(chave, valor);
      }
    } catch (e) {
      // ilegível: guarda uma cópia para recuperar à mão e começa vazio
      const copia = `${arq}.corrompido-${Date.now()}`;
      try { fs.renameSync(arq, copia); } catch { /* sem permissão */ }
      log.error(`Cofre de tokens ilegível (${e.message}); cópia em ${copia}`);
    }
  }

  // Grava de forma atômica: escreve num temporário e troca, para uma queda no meio não corromper o cofre.
  function gravar() {
    const tmp = `${arq}.tmp`;
    const json = JSON.stringify({ v: 1, itens: Object.fromEntries(cifrados) });
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(tmp, json, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, arq);
  }

  function salvar(plat, slotBruto, valor) {
    const slot = slotValido(slotBruto);
    if (!PLATAFORMAS.includes(plat) || !slot) return { ok: false, motivo: 'invalido', mensagem: 'Conta inválida.' };
    const v = (validar[plat] || validarGenerico)({ token: valor });
    if (v.erro) return { ok: false, motivo: 'invalido', mensagem: v.erro };

    const chave = chaveDe(plat, slot);
    if (persistente()) {
      const antes = cifrados.get(chave);
      try {
        cifrados.set(chave, safeStorage.encryptString(v.token).toString('base64'));
        gravar();
        memoria.delete(chave);
        return { ok: true, persistente: true };
      } catch (e) {
        if (antes === undefined) cifrados.delete(chave); else cifrados.set(chave, antes);   // desfaz
        log.error(`Não consegui gravar o token (${plat} conta ${slot}): ${e.message}`);
        return { ok: false, motivo: 'gravacao', mensagem: 'Não consegui gravar o token com segurança neste computador.' };
      }
    }
    // sem cofre do sistema: só em memória
    memoria.set(chave, v.token);
    log.warn(`Sem cofre do sistema: token (${plat} conta ${slot}) ficará só em memória.`);
    return { ok: true, persistente: false, mensagem: 'Este computador não tem cofre de senhas do sistema: o token fica só na memória e some ao fechar o app.' };
  }

  // Só para uso interno do processo principal. Nunca é exposto por IPC.
  function obter(plat, slotBruto) {
    const slot = slotValido(slotBruto);
    if (!PLATAFORMAS.includes(plat) || !slot) return null;
    const chave = chaveDe(plat, slot);
    if (memoria.has(chave)) return memoria.get(chave);
    const b64 = cifrados.get(chave);
    if (!b64) return null;
    try {
      return safeStorage.decryptString(Buffer.from(b64, 'base64'));
    } catch (e) {
      // ex.: o arquivo veio de outro usuário/computador: não dá para ler, o usuário precisa colar de novo
      if (!avisados.has(chave)) { avisados.add(chave); log.warn(`Não consegui descriptografar o token (${plat} conta ${slot}): ${e.message}`); }
      return null;
    }
  }

  function remover(plat, slotBruto) {
    const slot = slotValido(slotBruto);
    if (!PLATAFORMAS.includes(plat) || !slot) return { ok: false, mensagem: 'Conta inválida.' };
    const chave = chaveDe(plat, slot);
    memoria.delete(chave);
    if (cifrados.delete(chave)) {
      try { gravar(); } catch (e) { log.error(`Não consegui atualizar o cofre ao remover: ${e.message}`); return { ok: false, mensagem: 'Não consegui remover o token.' }; }
    }
    return { ok: true };
  }

  // Contas (slots) que têm token, sem revelar o valor.
  function lista(plat) {
    if (!PLATAFORMAS.includes(plat)) return [];
    const prefixo = `${plat}:`;
    const slots = new Set();
    for (const chave of [...cifrados.keys(), ...memoria.keys()]) if (chave.startsWith(prefixo)) slots.add(chave.slice(prefixo.length));
    return [...slots].sort((a, b) => Number(a) - Number(b));
  }

  carregar();
  return { persistente, salvar, obter, remover, lista };
}

// Registra os canais IPC. Chame uma vez no main.js (depois do app "ready"). Devolve o cofre para o main usar.
function setupTokenVault({ app, ipcMain, safeStorage, log, validar }) {
  const cofre = criarCofre({ app, safeStorage, log, validar });
  ipcMain.handle('token:estado', () => ({ persistente: cofre.persistente() }));
  ipcMain.handle('token:lista', (_e, plat) => cofre.lista(plat));
  ipcMain.handle('token:salvar', (_e, plat, slot, valor) => cofre.salvar(plat, slot, valor));
  ipcMain.handle('token:remover', (_e, plat, slot) => cofre.remover(plat, slot));
  // Não existe 'token:obter': o valor nunca sai do processo principal.
  return cofre;
}

module.exports = { criarCofre, setupTokenVault };
