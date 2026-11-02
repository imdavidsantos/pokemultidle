import React, { useState } from 'react';
import {
  DEV, desligarTudo, limparLogs, salvarConfig,
  useSniperConfig, useSniperLogs, useSniperStatus,
} from '../../utils/sniper/sniperStore';
import RuleRow from './components/RuleRow';
import GlobalRules from './components/GlobalRules';
import SniperLog from './components/SniperLog';
import SniperDiag from './components/SniperDiag';
import './SniperPanel.css';

const CONFIRMA_REAL = 'Desligar a simulação faz o app comprar DE VERDADE (gastando ouro/orbs) tudo que bater com as regras desta conta. Continuar?';

const fmtSaldo = (n) => (Number.isFinite(Number(n)) && Number(n) >= 0 ? Number(n).toLocaleString('pt-BR') : '—');

export default function SniperPanel({ accounts, nomesPokemon = [], onClose }) {
  const [slot, setSlot] = useState(accounts[0]?.slot);
  const conta = accounts.find((a) => a.slot === slot) ?? accounts[0];
  const slotAtual = conta?.slot;

  const cfg = useSniperConfig(slotAtual);
  const status = useSniperStatus(slotAtual);
  const logs = useSniperLogs(slotAtual);

  // Fora do modo dev a simulação não existe: garante dryRun sempre false.
  const mudar = (patch) => salvarConfig(slotAtual, { ...cfg, ...patch, ...(DEV ? {} : { dryRun: false }) });
  const trocarSimulacao = (simular) => {
    if (!DEV) return;
    if (!simular && !window.confirm(CONFIRMA_REAL)) return;
    mudar({ dryRun: simular });
  };

  const novaRegra = () => mudar({
    rules: [...cfg.rules, { id: `r${Date.now()}`, active: true, tipo: 'item', alvoNome: '', maxOuro: 0, maxGemas: 0, maxQtd: 1, infinito: false, comprados: 0 }],
  });
  const editarRegra = (id, patch) => mudar({ rules: cfg.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const removerRegra = (id) => mudar({ rules: cfg.rules.filter((r) => r.id !== id) });

  const modo = !cfg.enabled ? 'off' : DEV && cfg.dryRun ? 'sim' : 'real';
  const MODO_TXT = {
    off: 'Desligado: compra automatica não está ativa.',
    sim: 'Simulação: só registra o que compraria. Nada é gasto.',
    real: 'Compra automatica ativa.',
  };
  const saldo = status.saldo;

  return (
    <div className="sniper" role="dialog" aria-label="Sniper do mercado">
      <datalist id="sniper-pokemon">
        {nomesPokemon.map((n) => <option key={n} value={n} />)}
      </datalist>
      <div className="sniper__bar">
        <span className="sniper__titulo">Sniper do mercado</span>
        <div className="sniper__bar-acoes">
          <button className="sniper__btn sniper__btn--perigo" onClick={desligarTudo} title="Desliga o sniper em todas as contas">Parar todas</button>
          <button className="sniper__fechar" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
      </div>

      {accounts.length === 0 && <p className="sniper__vazio">Nenhuma conta aberta.</p>}

      {accounts.length > 0 && (
        <>
          <div className="sniper__abas" role="tablist">
            {accounts.map((a) => (
              <button
                key={a.slot}
                role="tab"
                aria-selected={a.slot === slotAtual}
                className={`sniper__aba ${a.slot === slotAtual ? 'is-active' : ''}`}
                onClick={() => setSlot(a.slot)}
              >
                {a.name}
              </button>
            ))}
          </div>

          <div className="sniper__body">
            <div className="sniper__chaves">
              <label className="sniper__check">
                <input type="checkbox" checked={cfg.enabled} onChange={(e) => mudar({ enabled: e.target.checked })} />
                <b>Ligado</b>
              </label>
              {DEV && (
                <label className="sniper__check">
                  <input type="checkbox" checked={cfg.dryRun} onChange={(e) => trocarSimulacao(e.target.checked)} />
                  <b>Modo simulação</b>
                </label>
              )}
            </div>

            <div className={`sniper__modo sniper__modo--${modo}`}>{MODO_TXT[modo]}</div>

            {status.socket
              ? (
                <div className="sniper__status">
                  Conectado{saldo ? ` · ouro ${fmtSaldo(saldo.gold)} · gemas ${fmtSaldo(saldo.gemas)}` : ''}
                </div>
              )
              : <SniperDiag status={status} />}

            <section>
              <div className="sniper__titulo-sec">
                <h3>Regras por alvo</h3>
                <button className="sniper__btn" onClick={novaRegra}>+ Adicionar regra</button>
              </div>
              {cfg.rules.length === 0 && <p className="sniper__vazio">Nenhuma regra. Adicione uma para começar.</p>}
              {cfg.rules.map((r) => (
                <RuleRow
                  key={r.id}
                  regra={r}
                  scan={status.varredura?.[r.id]}
                  ligado={cfg.enabled}
                  onChange={(p) => editarRegra(r.id, p)}
                  onRemove={() => removerRegra(r.id)}
                />
              ))}
            </section>

            <section>
              <div className="sniper__titulo-sec"><h3>Qualquer pokémon que for…</h3></div>
              <GlobalRules global={cfg.global} scan={status.varredura?.pokemon} ligado={cfg.enabled} onChange={(g) => mudar({ global: g })} />
            </section>

            <SniperLog logs={logs} onLimpar={() => limparLogs(slotAtual)} />
          </div>
        </>
      )}
    </div>
  );
}
