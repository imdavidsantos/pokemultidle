import React, { useEffect, useState } from 'react';
import {
  checarTwitch, iniciarTodasTwitch, iniciarPonteTwitch, iniciarTwitch, instalarTwitch,
  pararTodasTwitch, pararTwitch, salvarTwitch, twitchDisponivel,
  useTwitchChecagem, useTwitchConfig, useTwitchEstado, useTwitchPip, useTwitchParceiros, streamersDaConta,
  definirAutoIniciar, useTwitchAutoIniciar,
  prioridadeDaConta, alternarStreamerTwitch, definirTodosTwitch, alternarPrioridadeTwitch, moverPrioridadeTwitch, useTwitchSaldos
} from '../../adapters/twitch';
import ResumoFarm from '../../ResumoFarm/ResumoFarm';
import '../../../sniper/SniperPanel/SniperPanel.css';

const ROXO = { borderColor: '#9146FF', color: '#9146FF', background: 'rgba(145, 70, 255, 0.12)' };
const CARD = { display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8 };
const CAMPO = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, minWidth: 0 };
const INPUT = { width: '100%', boxSizing: 'border-box' };

const haQuanto = (t) => {
  if (!t) return 'nunca';
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
};

const ROTULO_ESTADO = {
  parado: 'Parado', iniciando: 'Iniciando…', login: 'Aguardando login', rodando: 'Rodando', erro: 'Erro',
};
const COR_ESTADO = { rodando: '#86efac', erro: '#f87171', login: '#f5b800' };

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
  const parc = useTwitchParceiros();
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
        <Interruptor rotulo="Ativar todos" valor={todosAtivos} onChange={(v) => definirTodosTwitch(slot, v)} />
      </div>

      {lista.length === 0 ? (
        <small style={{ opacity: 0.75 }}>Ainda não recebi a lista de parceiros (abra uma conta do jogo e espere carregar).</small>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 4, maxHeight: 190, overflow: 'auto', padding: 2 }}>
          {lista.map((p) => (
            <div key={p.slug} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, fontSize: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <input type="checkbox" checked={!off.has(p.slug)} onChange={(e) => alternarStreamerTwitch(slot, p.slug, e.target.checked)} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
              </label>
              <button
                type="button"
                className="sniper__btn"
                style={{ ...BTN_MINI, ...(prio.includes(p.slug) ? ROXO : null) }}
                title={prio.includes(p.slug) ? 'Tirar da lista de prioridades' : 'Adicionar à lista de prioridades'}
                onClick={() => alternarPrioridadeTwitch(slot, p.slug)}
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
              <button type="button" className="sniper__btn" style={BTN_MINI} disabled={i === 0} onClick={() => moverPrioridadeTwitch(slot, slug, -1)} aria-label="Subir">▲</button>
              <button type="button" className="sniper__btn" style={BTN_MINI} disabled={i === prio.length - 1} onClick={() => moverPrioridadeTwitch(slot, slug, 1)} aria-label="Descer">▼</button>
              <button type="button" className="sniper__btn" style={BTN_MINI} onClick={() => alternarPrioridadeTwitch(slot, slug)} aria-label="Remover">✕</button>
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
  const saldos = useTwitchSaldos(slot);
  const cfg = useTwitchConfig(slot);
  const est = useTwitchEstado(slot);
  const [verToken, setVerToken] = useState(false);
  const ativo = est.estado === 'rodando' || est.estado === 'iniciando' || est.estado === 'login';
  const mudar = (patch) => salvarTwitch(slot, patch);

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <b>{nome}</b>
        <span style={{ fontSize: 12, color: COR_ESTADO[est.estado] }}>{ROTULO_ESTADO[est.estado] || est.estado}</span>
        <button
          type="button"
          className="sniper__btn"
          style={{ whiteSpace: 'nowrap', fontWeight: 600, ...(ativo ? ROXO : null) }}
          onClick={() => (ativo ? pararTwitch(slot) : iniciarTwitch(slot))}
        >
          {ativo ? '■ Parar' : '▶ Iniciar'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, alignItems: 'start' }}>
        <label style={CAMPO}>
          Usuário da Twitch
          <input className="sniper__input" style={INPUT} value={cfg.username} placeholder="seu_usuario" disabled={ativo}
            onChange={(e) => mudar({ username: e.target.value.trim() })} />
        </label>
        <label style={CAMPO}>
          Presença no chat
          <select className="sniper__input" style={INPUT} value={cfg.chat} onChange={(e) => mudar({ chat: e.target.value })}>
            <option value="ONLINE">Só com a live no ar</option>
            <option value="ALWAYS">Sempre</option>
            <option value="OFFLINE">Só com a live offline</option>
            <option value="NEVER">Nunca</option>
          </select>
        </label>
        <label style={CAMPO}>
          Lives ao mesmo tempo
          <select className="sniper__input" style={INPUT} value={cfg.assistidos} disabled={ativo}
            onChange={(e) => mudar({ assistidos: Number(e.target.value) })}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
      </div>

      <label style={CAMPO}>
        Token da Twitch (opcional)
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="sniper__input"
            style={INPUT}
            type={verToken ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={cfg.token || ''}
            placeholder="cookie auth-token do twitch.tv"
            onChange={(e) => mudar({ token: e.target.value.trim() })}
          />
          <button type="button" className="sniper__btn" onClick={() => setVerToken((v) => !v)}>
            {verToken ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        <small style={{ opacity: 0.7 }}>
          Não precisa preencher. Serve só para ver os pontos e resgatar recompensas pelo app, mesmo com o miner parado (o miner não usa este token).
          Para pegar: twitch.tv logado → F12 → Application → Cookies → twitch.tv → copie o valor de <i>auth-token</i>. Fica salvo só neste computador.
        </small>
      </label>

      <Streamers slot={slot} cfg={cfg} ativo={ativo} />

      {est.estado === 'login' && est.codigo && (
        <div style={{ padding: 8, borderRadius: 6, ...ROXO, border: '1px solid #f5b800' }}>
          Entre em <b>twitch.tv/activate</b> e digite o código <b style={{ fontSize: 16, letterSpacing: 2 }}>{est.codigo}</b>
          {' '}(a página já foi aberta no navegador). Só é preciso uma vez por conta.
        </div>
      )}
      {est.mensagem && <div style={{ fontSize: 12, color: COR_ESTADO[est.estado] }}>{est.mensagem}</div>}
      {est.linhas.length > 0 && (<ResumoFarm saldos={saldos} cor="#9146FF" />)}
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

export default function TwitchPanel({ accounts = [], onClose }) {
  const chk = useTwitchChecagem();
  const pip = useTwitchPip();
  const auto = useTwitchAutoIniciar();
  const parc = useTwitchParceiros();

  useEffect(() => { iniciarPonteTwitch(); }, []);

  const slots = accounts.map((a) => a.slot);

  return (
    <div className="sniper" role="dialog" aria-label="Twitch Presence">
      <div className="sniper__bar">
        <span className="sniper__titulo">Twitch Presence</span>
        <div className="sniper__bar-acoes">
          <button className="sniper__btn" onClick={() => iniciarTodasTwitch(slots)} disabled={!chk?.ok}>▶ Iniciar todas</button>
          <button className="sniper__btn sniper__btn--perigo" onClick={pararTodasTwitch}>■ Parar todas</button>
          <button className="sniper__fechar" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
      </div>

      <div className="sniper__body">
        {!twitchDisponivel() && <p className="sniper__vazio">Disponível só no app desktop (a ponte "window.twitch" não foi encontrada).</p>}

        {twitchDisponivel() && (
          <div style={{ ...CARD, borderColor: chk?.ok ? '#4ade80' : '#f5b800' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>
                {chk == null ? 'Verificando a pasta mods…' : `${chk.ok ? '✓' : '✗'} ${chk.mensagem}`}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="sniper__btn" onClick={checarTwitch}>Verificar de novo</button>
                {chk?.etapa === 'dependencias' && <button className="sniper__btn" onClick={instalarTwitch}>Instalar dependências</button>}
              </div>
            </div>
            {chk && !chk.ok && chk.etapa === 'pasta' && chk.procurou && (
              <small style={{ opacity: 0.75 }}>
                Coloque a pasta em um destes lugares: <br />{chk.procurou.slice(0, 4).join('\n')}
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
          Cada conta roda em um processo separado, com login e registros próprios. As apostas (predictions) ficam sempre desligadas.
        </small>
      </div>
    </div>
  );
}
