import React, { useEffect, useState } from 'react';
import {
  DEV, desligarTudo, limparLogs, salvarConfig,
  useSniperConfig, useSniperLogs, useSniperStatus,
} from '../sniperStore';
import GlobalRules from './components/GlobalRules';
import RulesShare from './components/RulesShare';
import SniperDiag from './components/SniperDiag';
import SniperLog from './components/SniperLog';
import RuleRow from './components/RuleRow';
import './SniperPanel.css';

const CHAVE_CENTRO = 'sniper:centralizado';

const CONFIRMA_REAL = 'Isto faz o app comprar DE VERDADE (gastando ouro/gemas) tudo que bater com as regras desta conta. Continuar?';

const fmtSaldo = (n) => (Number.isFinite(Number(n)) && Number(n) >= 0 ? Number(n).toLocaleString('pt-BR') : '—');

const MODO_TXT = {
  off: 'Desligado: nada é comprado.',
  sim: 'Simulação: só registra o que compraria. Nada é gasto.',
  real: 'Ligado: compra tudo que bater com as regras.',
};

export default function SniperPanel({ accounts, nomesPokemon = [], onClose }) {
  const [slot, setSlot] = useState(accounts[0]?.slot);
  // Painel grande no meio da tela. Lembra a última escolha entre aberturas.
  const [centro, setCentro] = useState(() => {
    try { return localStorage.getItem(CHAVE_CENTRO) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(CHAVE_CENTRO, centro ? '1' : '0'); } catch { /* sem storage */ }
  }, [centro]);

  // Esc fecha o painel (só quando está centralizado)
  useEffect(() => {
    if (!centro) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [centro, onClose]);
  const conta = accounts.find((a) => a.slot === slot) ?? accounts[0];
  const slotAtual = conta?.slot;

  const cfg = useSniperConfig(slotAtual);
  const status = useSniperStatus(slotAtual);
  const logs = useSniperLogs(slotAtual);

  // Fora do modo dev a simulação não existe: garante dryRun sempre false.
  const mudar = (patch) => salvarConfig(slotAtual, { ...cfg, ...patch, ...(DEV ? {} : { dryRun: false }) });

  const modo = !cfg.enabled ? 'off' : DEV && cfg.dryRun ? 'sim' : 'real';

  // Um único seletor substitui os dois checkboxes (Ligado + Modo simulação).
  const escolherModo = (novo) => {
    if (novo === modo) return;
    if (novo === 'off') return mudar({ enabled: false });
    if (novo === 'sim') return mudar({ enabled: true, dryRun: true });
    // novo === 'real'
    if (DEV && !window.confirm(CONFIRMA_REAL)) return;
    return mudar({ enabled: true, dryRun: false });
  };

  const MODOS = [
    { id: 'off', label: 'Desligado' },
    ...(DEV ? [{ id: 'sim', label: 'Simulação' }] : []),
    { id: 'real', label: 'Ligado' },
  ];

  const novaRegra = () => mudar({
    rules: [...cfg.rules, { id: `r${Date.now()}`, active: true, tipo: 'item', alvoNome: '', maxOuro: 0, maxGemas: 0, maxQtd: 1, infinito: false, comprados: 0 }],
  });
  const editarRegra = (id, patch) => mudar({ rules: cfg.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const removerRegra = (id) => mudar({ rules: cfg.rules.filter((r) => r.id !== id) });

  const saldo = status.saldo;

  return (
    <>
      {centro && <div className="sniper__fundo" onClick={onClose} aria-hidden="true" />}
      <div className={`sniper ${centro ? 'sniper--centro' : ''}`} role="dialog" aria-label="Sniper do mercado">
      <datalist id="sniper-pokemon">
        {nomesPokemon.map((n) => <option key={n} value={n} />)}
      </datalist>

      <div className="sniper__bar">
        <span className="sniper__titulo">Sniper do mercado</span>
        <div className="sniper__bar-acoes">
          <button
            className="sniper__btn"
            onClick={() => setCentro((c) => !c)}
            title={centro ? 'Voltar para o canto' : 'Abrir grande no meio da tela'}
          >
            {centro ? 'Reduzir' : 'Centralizar'}
          </button>
          <button className="sniper__btn sniper__btn--perigo" onClick={desligarTudo} title="Desliga o sniper em todas as contas">Parar todas</button>
          <button className="sniper__fechar" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
      </div>

      {accounts.length === 0 && <p className="sniper__vazio">Nenhuma conta aberta. Abra uma conta para configurar o sniper.</p>}

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

          {/* Topo fixo: sempre visível, mesmo rolando as regras */}
          <div className="sniper__topo">
            <div className="sniper__seg" role="radiogroup" aria-label="Modo do sniper">
              {MODOS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={modo === m.id}
                  className={`sniper__seg-btn sniper__seg-btn--${m.id} ${modo === m.id ? 'is-on' : ''}`}
                  onClick={() => escolherModo(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className={`sniper__modo sniper__modo--${modo}`}>{MODO_TXT[modo]}</div>

            {status.socket
              ? (
                <div className="sniper__status">
                  <span className="sniper__dot" aria-hidden="true" />
                  <span>Conectado</span>
                  {saldo && (
                    <span className="sniper__saldo">
                      <span>Ouro {fmtSaldo(saldo.gold)}</span>
                      <span>Gemas {fmtSaldo(saldo.gemas)}</span>
                    </span>
                  )}
                </div>
              )
              : <SniperDiag status={status} />}
          </div>

          <div className="sniper__body">
            <div className="sniper__area-share">
              <RulesShare
                key={slotAtual}
                cfg={cfg}
                nomeConta={conta?.name}
                onAplicar={(rules, global) => mudar({ rules, global: { ...cfg.global, ...global } })}
              />
            </div>

            <section className="sniper__area-regras">
              <div className="sniper__titulo-sec">
                <h3>
                  Regras por alvo
                  <span className="sniper__contador">{cfg.rules.length}</span>
                </h3>
                <button className="sniper__btn sniper__btn--primario" onClick={novaRegra}>+ Adicionar regra</button>
              </div>
              {cfg.rules.length === 0 && <p className="sniper__vazio">Nenhuma regra ainda. Clique em “Adicionar regra” para escolher o que comprar.</p>}
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

            <div className="sniper__area-extra">
              <section>
                <div className="sniper__titulo-sec"><h3>Qualquer pokémon que for…</h3></div>
                <GlobalRules global={cfg.global} scan={status.varredura?.pokemon} ligado={cfg.enabled} onChange={(g) => mudar({ global: g })} />
              </section>

              <SniperLog logs={logs} onLimpar={() => limparLogs(slotAtual)} />
            </div>
          </div>
        </>
      )}
      </div>
    </>
  );
}
