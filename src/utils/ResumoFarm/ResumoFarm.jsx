import React from 'react';

const RECENTE_MS = 10 * 60 * 1000;   // ganho nos últimos 10 min = "farmando agora" (●)

const haQuanto = (t) => {
  if (!t) return 'nunca';
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
};

// Fechado por padrão (igual ao "Registro"). Mostra só os canais cujos pontos aumentaram (ganho > 0).
// `tGanho` = quando o saldo subiu pela última vez (a Kick grava); sem ele, cai para `t`.
export default function ResumoFarm({ saldos, cor }) {
  const agora = Date.now();
  const quando = (d) => d.tGanho || d.t || 0;
  const lista = Object.entries(saldos || {})
    .filter(([, d]) => d.ganho > 0)
    .sort((a, b) => quando(b[1]) - quando(a[1]));
  const total = lista.reduce((soma, [, d]) => soma + (d.ganho || 0), 0);

  return (
    <details>
      <summary style={{ fontSize: 12, cursor: 'pointer' }}>Farmando ({lista.length})</summary>

      {lista.length === 0 ? (
        <small style={{ display: 'block', marginTop: 6, opacity: 0.75 }}>Nenhum canal ganhou pontos ainda.</small>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginTop: 6 }}>
          {lista.map(([canal, d]) => {
            const farmando = agora - quando(d) < RECENTE_MS;
            return (
              <div key={canal} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, opacity: farmando ? 1 : 0.5 }}>
                <span style={{ color: farmando ? cor : undefined }}>{farmando ? '●' : '○'} {canal}</span>
                <span>+{d.ganho} · saldo {d.texto || d.pontos} · {haQuanto(quando(d))}</span>
              </div>
            );
          })}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 4, display: 'flex', justifyContent: 'space-between' }}>
            <b>Total ganho</b><b>+{total}</b>
          </div>
        </div>
      )}
    </details>
  );
}
