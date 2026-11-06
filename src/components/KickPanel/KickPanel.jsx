import React, { useEffect, useState } from 'react';
import {
  checarKick, iniciarTodasKick, iniciarPonteKick, iniciarKick, instalarKick,
  pararTodasKick, pararKick, salvarKick, kickDisponivel,
  useKickChecagem, useKickConfig, useKickEstado, useKickPip, useKickParceiros, streamersDaConta,
  definirAutoIniciar, useKickAutoIniciar,
  prioridadeDaConta, alternarStreamerKick, definirTodosKick, alternarPrioridadeKick, moverPrioridadeKick,
} from '../../utils/kick/kickStore';

const VERDE = { borderColor: '#53fc18', color: '#53fc18', background: 'rgba(83, 252, 24, 0.12)' };   // verde da Kick
const AVISO = '#f5b800';
const CARD = { display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', overflowWrap: 'anywhere' };
const CAMPO = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, minWidth: 0 };
const INPUT = { width: '100%', boxSizing: 'border-box' };

const ROTULO_ESTADO = {
  parado: 'Parado', iniciando: 'Iniciando…', login: 'Aguardando login', rodando: 'Rodando', erro: 'Erro',
};
const COR_ESTADO = { rodando: '#86efac', erro: '#f87171', login: AVISO };

const haQuanto = (t) => {
  if (!t) return 'nunca';
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
};

function Interruptor({ rotulo, valor, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <input type="checkbox" checked={!!valor} onChange={(e) => onChange(e.target.checked)} />
      {rotulo}
    </label>
  );
}

const BTN_MINI = { padding: '0 6px', lineHeight: '20px', minWidth: 24 };

function Streamers({ slot, cfg, ativo }) {
  const parc = useKickParceiros();
  const off = new Set(cfg.desativados);
  const lista = parc.lista;
  const todosAtivos = lista.length > 0 && lista.every((p) => !off.has(p.slug));
  const nomeDe = Object.fromEntries(lista.map((p) => [p.slug, p.nome]));
  const prio = prioridadeDaConta(cfg);
  const total = streamersDaConta(cfg).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <b style={{ fontSize: 13 }}>Streamers</b>
        <Interruptor rotulo="Ativar todos" valor={todosAtivos} onChange={(v) => definirTodosKick(slot, v)} />
      </div>

      {lista.length === 0 ? (
        <small style={{ opacity: 0.75 }}>Ainda não recebi a lista de parceiros (abra uma conta do jogo e espere carregar).</small>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 4, maxHeight: 190, overflow: 'auto', padding: 2 }}>
          {lista.map((p) => (
            <div key={p.slug} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, fontSize: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <input type="checkbox" checked={!off.has(p.slug)} onChange={(e) => alternarStreamerKick(slot, p.slug, e.target.checked)} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
              </label>
              <button
                type="button"
                className="sniper__btn"
                style={{ ...BTN_MINI, ...(prio.includes(p.slug) ? VERDE : null) }}
                title={prio.includes(p.slug) ? 'Tirar da lista de prioridades' : 'Adicionar à lista de prioridades'}
                onClick={() => alternarPrioridadeKick(slot, p.slug)}
              >
                {prio.includes(p.slug) ? '★' : '☆'}
              </button>
            </div>
          ))}
        </div>
      )}

      {lista.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12 }}>
            Prioridades {prio.length ? '(o de cima é assistido primeiro)' : '— nenhuma: segue a ordem da lista. Use a ☆ para escolher.'}
          </span>
          {prio.map((slug, i) => (
            <div key={slug} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: off.has(slug) ? 0.45 : 1 }}>
              <span style={{ width: 18, textAlign: 'right' }}>{i + 1}.</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {nomeDe[slug]}{off.has(slug) ? ' (desativado)' : ''}
              </span>
              <button type="button" className="sniper__btn" style={BTN_MINI} disabled={i === 0} onClick={() => moverPrioridadeKick(slot, slug, -1)} aria-label="Subir">▲</button>
              <button type="button" className="sniper__btn" style={BTN_MINI} disabled={i === prio.length - 1} onClick={() => moverPrioridadeKick(slot, slug, 1)} aria-label="Descer">▼</button>
              <button type="button" className="sniper__btn" style={BTN_MINI} onClick={() => alternarPrioridadeKick(slot, slug)} aria-label="Remover">✕</button>
            </div>
          ))}
        </div>
      )}

      <small style={{ opacity: 0.75 }}>
        Enviado ao miner: {total} canais (prioridades primeiro, depois os outros ativados).
        {ativo ? ' Mudanças reiniciam o miner sozinho em alguns segundos.' : ''}
      </small>
    </div>
  );
}

function Conta({ slot, nome }) {
  const cfg = useKickConfig(slot);
  const est = useKickEstado(slot);
  const [verToken, setVerToken] = useState(false);
  const ativo = est.estado === 'rodando' || est.estado === 'iniciando' || est.estado === 'login';
  const mudar = (patch) => salvarKick(slot, patch);

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <b>{nome}</b>
        <span style={{ fontSize: 12, color: COR_ESTADO[est.estado] }}>{ROTULO_ESTADO[est.estado] || est.estado}</span>
        <button
          type="button"
          className="sniper__btn"
          style={{ whiteSpace: 'nowrap', fontWeight: 600, ...(ativo ? VERDE : null) }}
          onClick={() => (ativo ? pararKick(slot) : iniciarKick(slot))}
        >
          {ativo ? '■ Parar' : '▶ Iniciar'}
        </button>
      </div>

      <label style={CAMPO}>
        Token da Kick (só o texto depois de “Bearer”)
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="sniper__input"
            style={INPUT}
            type={verToken ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={cfg.token}
            placeholder="123456789|xxxxxxxx…"
            disabled={ativo}
            onChange={(e) => mudar({ token: e.target.value.trim() })}
          />
          <button type="button" className="sniper__btn" onClick={() => setVerToken((v) => !v)}>
            {verToken ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, alignItems: 'start' }}>
        <label style={CAMPO}>
          Lives ao mesmo tempo
          <select className="sniper__input" style={INPUT} value={cfg.assistidos} disabled={ativo}
            onChange={(e) => mudar({ assistidos: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label style={CAMPO}>
          Proxy (opcional)
          <input className="sniper__input" style={INPUT} value={cfg.proxy} placeholder="socks5://usuario:senha@host:porta"
            disabled={ativo} onChange={(e) => mudar({ proxy: e.target.value.trim() })} />
        </label>
      </div>

      <Streamers slot={slot} cfg={cfg} ativo={ativo} />

      {est.mensagem && <div style={{ fontSize: 12, color: COR_ESTADO[est.estado] || AVISO }}>{est.mensagem}</div>}
      {est.linhas.length > 0 && (
        <details>
          <summary style={{ fontSize: 12, cursor: 'pointer' }}>Registro ({est.linhas.length})</summary>
          <pre style={{ fontSize: 11, margin: '6px 0 0', maxHeight: 140, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {est.linhas.slice(-12).join('\n')}
          </pre>
        </details>
      )}
    </div>
  );
}

export default function KickPanel({ accounts = [], onClose }) {
  const chk = useKickChecagem();
  const pip = useKickPip();
  const auto = useKickAutoIniciar();
  const parc = useKickParceiros();

  useEffect(() => { iniciarPonteKick(); }, []);

  const slots = accounts.map((a) => a.slot);

  return (
    <div className="sniper" role="dialog" aria-label="Kick Presence">
      <div className="sniper__bar">
        <span className="sniper__titulo">Kick Presence</span>
        <div className="sniper__bar-acoes">
          <button className="sniper__btn" onClick={() => iniciarTodasKick(slots)} disabled={!chk?.ok}>▶ Iniciar todas</button>
          <button className="sniper__btn sniper__btn--perigo" onClick={pararTodasKick}>■ Parar todas</button>
          <button className="sniper__fechar" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
      </div>

      <div className="sniper__body">
        {!kickDisponivel() && <p className="sniper__vazio">Disponível só no app desktop (a ponte "window.kick" não foi encontrada).</p>}

        {kickDisponivel() && (
          <div style={{ ...CARD, borderColor: chk?.ok ? '#4ade80' : AVISO }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, flex: '1 1 200px', minWidth: 0 }}>
                {chk == null ? 'Verificando a pasta mods…' : `${chk.ok ? '✓' : '✗'} ${chk.mensagem}`}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="sniper__btn" onClick={checarKick}>Verificar de novo</button>
                {chk?.etapa === 'dependencias' && <button className="sniper__btn" onClick={instalarKick}>Instalar dependências</button>}
              </div>
            </div>
            {chk && !chk.ok && chk.etapa === 'pasta' && chk.procurou && (
              <small style={{ opacity: 0.75, whiteSpace: 'pre-line', overflowWrap: 'anywhere', wordBreak: 'break-all' }}>
                Coloque a pasta em um destes lugares:{'\n'}{chk.procurou.slice(0, 4).join('\n')}
              </small>
            )}
            {pip.length > 0 && (
              <pre style={{ fontSize: 11, margin: 0, maxHeight: 100, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{pip.slice(-8).join('\n')}</pre>
            )}
          </div>
        )}

        <div style={CARD}>
          <span style={{ fontSize: 13 }}>
            {parc.lista.length
              ? `Canais parceiros: ${parc.lista.length} (confirmado ${haQuanto(parc.checadoEm)}, última mudança ${haQuanto(parc.atualizadoEm)})`
              : 'Canais parceiros: ainda não recebi a lista (abra uma conta do jogo e espere carregar).'}
          </span>
          {parc.novos.length > 0 && (
            <span style={{ fontSize: 12, color: '#86efac' }}>Novo(s) na última mudança: {parc.novos.join(', ')}</span>
          )}
          {parc.lista.length > 0 && (
            <details>
              <summary style={{ fontSize: 12, cursor: 'pointer' }}>Ver lista</summary>
              <div style={{ fontSize: 11, marginTop: 6 }}>{parc.lista.map((p) => p.nome).join(', ')}</div>
            </details>
          )}
        </div>

        <Interruptor rotulo="Iniciar as contas sozinho ao abrir o app" valor={auto} onChange={definirAutoIniciar} />

        {accounts.length === 0 && <p className="sniper__vazio">Nenhuma conta aberta.</p>}
        {accounts.map((a) => <Conta key={a.slot} slot={a.slot} nome={a.name} />)}

        <small style={{ opacity: 0.7 }}>
          Para pegar o token: entre na kick.com, aperte F12 → aba Network → recarregue a página → clique em uma requisição →
          Headers → copie o que vem depois de “Bearer” em <i>authorization</i>. O token fica salvo só neste computador; se a Kick
          deslogar a conta, é preciso colar um novo. Cada conta roda em um processo separado, com configuração e registros próprios.
        </small>
      </div>
    </div>
  );
}
