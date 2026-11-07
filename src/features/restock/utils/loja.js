const QTD_MIN = 1;
const QTD_MAX = 9999;
const CONFIRMAR_ACIMA = 9999;
const ICONE_BASE = 'https://pokeidle.io/img/itens/';

const clampQtd = (v) => Math.min(QTD_MAX, Math.max(QTD_MIN, Math.floor(Number(v) || QTD_MIN)));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const urlIcone = (item) => item.icone || `${ICONE_BASE}${
  String(item.nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}.png`;

export { QTD_MAX, QTD_MIN, CONFIRMAR_ACIMA, ICONE_BASE, clampQtd, pausa, urlIcone };
