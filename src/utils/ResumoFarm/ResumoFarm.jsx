import React from 'react';

const RECENTE_MS = 10 * 60 * 1000;   // canal com ganho nos últimos 10 min conta como "farmando"

const haQuanto = (t) => {
  if (!t) return 'nunca';
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
};

// Fechado por padrão (igual ao "Registro"): só abre quando o usuário clica em "Farmando".
export default function ResumoFarm({ saldos, cor }) {
  const agora = Date.now();
  const lista = Object.entries(saldos || {})
    .filter(([, d]) => d.ganho > 0 || agora - (d.t || 0) < RECENTE_MS)
    .sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
  const total = lista.reduce((soma, [, d]) => soma + (d.ganho || 0), 0);

  return (
    <details>
      <summary style={{ fontSize: 12, cursor: 'pointer' }}>Farmando ({lista.length})</summary>

      {lista.length === 0 ? (
        <small style={{ display: 'block', marginTop: 6, opacity: 0.75 }}>Ainda sem pontos ganhos.</small>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginTop: 6 }}>
          {lista.map(([canal, d]) => {
            const farmando = agora - (d.t || 0) < RECENTE_MS;
            return (
              <div key={canal} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, opacity: farmando ? 1 : 0.5 }}>
                <span style={{ color: farmando ? cor : undefined }}>{farmando ? '●' : '○'} {canal}</span>
                <span>+{d.ganho || 0} · saldo {d.texto || d.pontos} · {haQuanto(d.t)}</span>
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
