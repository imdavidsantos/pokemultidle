// Formatação dos saldos de pontos da Twitch (funções puras).

// Saldo como o miner informou: exato vira "1.234"; abreviado (ex.: 61.38k) vira "≈ 61.38k".
export function textoPontos({ pontos, texto, aprox }) {
  if (aprox) return `≈ ${texto}`;
  return Number(pontos).toLocaleString('pt-BR');
}

// "agora", "há 5 min", "há 2 h", "há 3 d".
export function tempoRelativo(t, agora = Date.now()) {
  const s = Math.max(0, Math.floor((agora - Number(t)) / 1000));
  if (!Number.isFinite(s)) return '';
  if (s < 60) return 'agora';
  const min = Math.floor(s / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

// [[canal, dados], ...] com o maior saldo primeiro (empate: ordem alfabética).
export function ordenarCanais(saldos) {
  return Object.entries(saldos || {}).sort(
    (a, b) => (b[1].pontos || 0) - (a[1].pontos || 0) || a[0].localeCompare(b[0]),
  );
}
