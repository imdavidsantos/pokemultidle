import React from 'react';
import { QTD_MAX } from '../../../../utils/restock/loja';
import { MAX_LIMITE } from './useAutoRestock';

const GOLD = { borderColor: '#f5b800', color: '#f5b800', background: 'rgba(245, 184, 0, 0.12)' };
const soDigitos = (texto, max) => {
  const d = String(texto).replace(/\D/g, '');
  return d === '' ? 0 : Math.min(Number(d), max);
};

function Campo({ rotulo, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, minWidth: 0 }}>
      {rotulo}
      {children}
    </label>
  );
}

function Linha({ g, atualizar }) {
  const { cfg, alvo, candidatos, estado } = g;
  const auto = !cfg.itemId;
  const cor = estado.situacao === 'erro' ? '#f87171' : estado.situacao === 'ok' ? '#86efac' : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, opacity: cfg.ativo ? 1 : 0.85 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <b>{g.titulo}</b>
        <button
          type="button"
          className="restock__addqtd"
          aria-pressed={cfg.ativo}
          onClick={() => atualizar(g.id, { ativo: !cfg.ativo })}
          title={cfg.ativo ? 'Clique para parar de reabastecer' : 'Clique para reabastecer sozinho'}
          style={{ whiteSpace: 'nowrap', fontWeight: 600, ...(cfg.ativo ? GOLD : null) }}
        >
          {cfg.ativo ? '● Automático ligado' : 'Automático desligado'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, alignItems: 'start' }}>
        <Campo rotulo="Item">
          <select
            className="restock__input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            value={cfg.itemId}
            onChange={(e) => atualizar(g.id, { itemId: e.target.value })}
          >
            <option value="">{`Auto: ${alvo ? alvo.nome : 'nenhum encontrado'}`}</option>
            {candidatos.map((i) => (
              <option key={i.id} value={i.id}>{`${i.nome} (${i.qtd.toLocaleString('pt-BR')})`}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Repor se tiver menos de">
          <input
            className="restock__input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            inputMode="numeric"
            value={cfg.limite || ''}
            placeholder="0"
            onChange={(e) => atualizar(g.id, { limite: soDigitos(e.target.value, MAX_LIMITE) })}
          />
        </Campo>
        <Campo rotulo="Comprar por vez">
          <input
            className="restock__input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            inputMode="numeric"
            value={cfg.compra || ''}
            placeholder="1"
            onChange={(e) => atualizar(g.id, { compra: soDigitos(e.target.value, QTD_MAX) })}
            onBlur={() => atualizar(g.id, { compra: Math.max(1, Number(cfg.compra) || 1) })}
          />
        </Campo>
      </div>

      <div style={{ fontSize: 12, opacity: 0.85, color: cor }}>
        {alvo ? `Tem ${alvo.qtd.toLocaleString('pt-BR')}${auto ? ' · item detectado automaticamente' : ''}` : 'Item não encontrado na loja.'}
        {estado.msg ? ` · ${estado.msg}` : ''}
      </div>
    </div>
  );
}

export default function AutoRestock({ grupos, atualizar }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0 12px' }} aria-label="Reabastecimento automático">
      <b>Reabastecimento automático</b>
      {grupos.map((g) => <Linha key={g.id} g={g} atualizar={atualizar} />)}
      <small style={{ opacity: 0.7 }}>
        Compra sozinho, sem confirmação, enquanto este painel estiver aberto. Se uma compra falhar, aquele item é desligado.
      </small>
    </section>
  );
}
