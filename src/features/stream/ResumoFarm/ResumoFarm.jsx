import React from 'react';
import './ResumoFarm.css';

const RECENTE_MS = 10 * 60 * 1000;   // sem `ativos` (Twitch): ganho/visto nos últimos 10 min = "farmando agora"

const num = (n) => Number(n).toLocaleString('pt-BR');

const ha = (t) => {
  if (!t) return 'nunca';
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
};

// "≈ 1.08k" quando o miner abreviou o saldo; senão o número exato em pt-BR.
const textoSaldo = (d) => {
  if (d.aprox && d.texto) return `≈ ${d.texto}`;
  const n = Number(d.pontos);
  return Number.isFinite(n) ? num(n) : (d.texto ?? '—');
};

// Fechado por padrão (igual ao "Registro"). Lista só os canais cujos pontos aumentaram (ganho > 0).
// Verde (cor) = sendo farmado agora. Se vier `ativos` (lista de canais que o miner assiste neste momento, como na Kick),
// só esses ficam destacados; sem `ativos` (Twitch), vale a regra dos últimos 10 min.
// O total ganho fica no resumo, visível mesmo com a lista fechada.
export default function ResumoFarm({ saldos, cor = '#53fc18', ativos }) {
  const agora = Date.now();
  const quando = (d) => d.tGanho || d.t || 0;
  const noAr = ativos ? new Set(ativos.map((c) => String(c).toLowerCase())) : null;
  const estaFarmando = (canal, d) => (noAr ? noAr.has(canal.toLowerCase()) : agora - quando(d) < RECENTE_MS);

  const lista = Object.entries(saldos || {})
    .filter(([, d]) => d.ganho > 0)
    .map(([canal, d]) => [canal, d, estaFarmando(canal, d)])
    .sort((a, b) => (b[2] - a[2]) || (quando(b[1]) - quando(a[1])));   // quem está farmando primeiro
  const total = lista.reduce((soma, [, d]) => soma + (d.ganho || 0), 0);
  const nAtivos = lista.filter(([, , f]) => f).length;
  const nParados = lista.length - nAtivos;

  const linha = ([canal, d, farmando]) => (
    <div key={canal} className={`rf__linha ${farmando ? 'is-on' : 'is-off'}`} title={`${canal} · último ganho ${ha(quando(d))}`}>
      <i className="rf__dot" aria-label={farmando ? 'Farmando agora' : 'Parado'} />
      <span className="rf__nome">{canal}</span>
      <span className="rf__num rf__ganho">+{num(d.ganho)}</span>
      <span className="rf__num rf__saldo">{textoSaldo(d)}</span>
      <span className="rf__num rf__quando">{ha(quando(d))}</span>
    </div>
  );

  return (
    <details className="rf" style={{ '--rf-cor': cor }}>
      <summary>
        <span className="rf__chev" aria-hidden="true">▸</span>
        <span className="rf__titulo">Farmando</span>
        <span className={`rf__pill ${nAtivos > 0 ? 'is-on' : ''}`}>{nAtivos}/{lista.length}</span>
        {lista.length > 0 && <span className="rf__total" title="Total ganho nesta sessão">+{num(total)}</span>}
      </summary>

      {lista.length === 0 ? (
        <small className="rf__vazio">Nenhum canal ganhou pontos ainda.</small>
      ) : (
        <div className="rf__corpo">
          <div className="rf__cab">
            <span />
            <span />
            <span className="rf__num">ganho</span>
            <span className="rf__num">saldo</span>
            <span className="rf__num">último</span>
          </div>
          {lista.filter(([, , f]) => f).map(linha)}
          {nAtivos > 0 && nParados > 0 && <div className="rf__sep" />}
          {lista.filter(([, , f]) => !f).map(linha)}
        </div>
      )}
    </details>
  );
}
