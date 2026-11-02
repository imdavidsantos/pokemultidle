import React from 'react';

const CLASSE = {
  CONFIRMADO: 'ok',
  AGENDADO: 'info',
  SIMULADO: 'sim',
  PERDIDO: 'warn',
  SALDO_INSUFICIENTE: 'warn',
  SEM_CONEXAO: 'erro',
};

// Status que são só ruído interno: não aparecem no registro.
const OCULTOS = new Set(['REFORCO', 'DISPARADO']);

const MOEDA = { gold: 'ouro', orb: 'gemas', orbs: 'gemas' };
const hora = (t) => new Date(t).toLocaleTimeString('pt-BR');

export default function SniperLog({ logs, onLimpar }) {
  const visiveis = logs.filter((l) => !OCULTOS.has(l.status));

  return (
    <div>
      <div className="sniper__titulo-sec">
        <h3>Registro</h3>
        {visiveis.length > 0 && <button className="sniper__btn" onClick={onLimpar}>limpar</button>}
      </div>
      {visiveis.length === 0 && <p className="sniper__vazio">Nada ainda.</p>}
      <div className="sniper__log">
        {visiveis.map((l, i) => (
          <div key={`${l.t}-${l.id}-${i}`} className="sniper__log-item">
            <span className="sniper__hora">{hora(l.t)}</span>
            <span className={`sniper__selo sniper__selo--${CLASSE[l.status] || 'info'}`}>{l.status}</span>
            <span className="sniper__log-txt">
              {l.nome ? <b>{l.nome}</b> : null}
              {l.qtd ? ` ×${l.qtd}` : ''}
              {l.preco ? ` · ${Number(l.preco).toLocaleString('pt-BR')} ${MOEDA[l.moeda] || l.moeda || ''}/un.` : ''}
              {l.detalhe ? ` · ${l.detalhe}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
