// Base dos gerenciadores de miner (presence/twitch.js e presence/kick.js): o que é comum aos dois fica aqui
// (rodar processos, achar a pasta do miner em mods/, ambiente do Python, limpeza de logs).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Pasta "mods": os miners da Twitch e da Kick ficam juntos. Em desenvolvimento é a pasta mods/ da raiz do projeto;
// no app instalado o electron-builder a copia para <resources>/mods (extraResources, ver package.json).
const NOME_MODS = 'mods';

// Roda um processo sem travar o processo principal do Electron (substitui o spawnSync).
function rodar(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let p;
    try { p = spawn(cmd, args, { windowsHide: true, timeout: 60000, ...opts }); } catch (e) { resolve({ status: -1, stdout: '', stderr: String(e.message) }); return; }
    p.stdout.on('data', (b) => { out += b; });
    p.stderr.on('data', (b) => { err += b; });
    p.on('error', (e) => resolve({ status: -1, stdout: out, stderr: err || String(e.message) }));
    p.on('close', (code) => resolve({ status: code, stdout: out, stderr: err }));
  });
}

// Procura a raiz do miner: a primeira pasta em que `isRaiz(pasta)` é verdadeiro.
// Aceita o zip extraído com pasta dentro de pasta (até 3 níveis).
function acharRaiz(base, isRaiz, nivel = 0) {
  try {
    if (!fs.statSync(base).isDirectory()) return null;
  } catch { return null; }
  if (isRaiz(base)) return base;
  if (nivel >= 3) return null;
  try {
    for (const nome of fs.readdirSync(base)) {
      if (nome === 'node_modules' || nome.startsWith('.') || nome === '__pycache__') continue;
      const r = acharRaiz(path.join(base, nome), isRaiz, nivel + 1);
      if (r) return r;
    }
  } catch { /* sem acesso */ }
  return null;
}

// Apaga os logs com mais de `dias` dias da pasta logs/ de uma conta. Segurança extra: o miner também
// limpa os próprios, mas se o nome do arquivo mudar a cada início os antigos ficariam para sempre.
function limparLogsAntigos(pasta, dias) {
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  let nomes;
  try { nomes = fs.readdirSync(pasta); } catch { return; }   // a pasta ainda não existe
  for (const nome of nomes) {
    if (!/\.log($|\.)/.test(nome)) continue;   // só logs (inclui os rotacionados, ex.: usuario.log.2026-11-04)
    const arq = path.join(pasta, nome);
    try {
      const st = fs.statSync(arq);
      if (st.isFile() && st.mtimeMs < limite) fs.unlinkSync(arq);
    } catch { /* em uso ou sem permissão: fica para a próxima */ }
  }
}

// Procura a pasta do miner. Ordem: caminho direto (pastaExtra), variável de ambiente do miner, MODS_DIR e depois
// <base>/mods/<nomeMiner> e <base>/mods em cada base conhecida.
function localizarPasta({ app, pastaExtra, envDir, nomeMiner, isRaiz }) {
  const bases = [
    app.getPath('userData'),
    path.join(__dirname, '..', '..'),   // dev: raiz do projeto (este arquivo fica em electron/presence/)
    path.dirname(app.getPath('exe')),
    app.getAppPath(),
    process.resourcesPath,              // app instalado: extraResources põe mods/ aqui
    process.cwd(),
  ].filter(Boolean);
  const candidatos = [
    pastaExtra && pastaExtra(),                                // caminho direto da pasta do miner
    envDir && process.env[envDir],                             // idem, por variável de ambiente
    process.env.MODS_DIR,                                      // caminho da pasta mods
    ...bases.map((b) => path.join(b, NOME_MODS, nomeMiner)),   // <base>/mods/<miner>
    ...bases.map((b) => path.join(b, NOME_MODS)),              // <base>/mods (fallback: procura dentro)
  ].filter(Boolean);
  for (const base of candidatos) {
    const raiz = acharRaiz(base, isRaiz);
    if (raiz) return { raiz, procurou: candidatos };
  }
  return { raiz: null, procurou: candidatos };
}

// Ambiente do processo Python do miner (`extra` acrescenta variáveis próprias de cada miner).
const envPython = (raiz, extra = {}) => ({
  ...process.env,
  PYTHONPATH: raiz + (process.env.PYTHONPATH ? path.delimiter + process.env.PYTHONPATH : ''),
  PYTHONUNBUFFERED: '1',
  PYTHONIOENCODING: 'utf-8',
  ...extra,
});

const textoCurto = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

module.exports = { NOME_MODS, rodar, acharRaiz, localizarPasta, envPython, limparLogsAntigos, textoCurto };
