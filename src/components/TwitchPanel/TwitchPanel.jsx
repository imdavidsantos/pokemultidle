import React, { useEffect } from 'react';
import {
  checarTwitch, iniciarTodasTwitch, iniciarPonteTwitch, iniciarTwitch, instalarTwitch,
  pararTodasTwitch, pararTwitch, salvarTwitch, twitchDisponivel,
  useTwitchChecagem, useTwitchConfig, useTwitchEstado, useTwitchPip,
  definirAutoIniciar, useTwitchAutoIniciar
} from '../../utils/twitch/twitchStore';

const GOLD = { borderColor: '#f5b800', color: '#f5b800', background: 'rgba(245, 184, 0, 0.12)' };
const CARD = { display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8 };
const CAMPO = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, minWidth: 0 };
const INPUT = { width: '100%', boxSizing: 'border-box' };

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

function Conta({ slot, nome }) {
  const cfg = useTwitchConfig(slot);
  const est = useTwitchEstado(slot);
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
          style={{ whiteSpace: 'nowrap', fontWeight: 600, ...(ativo ? GOLD : null) }}
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
        Streamers (um por linha ou separados por vírgula)
        <textarea className="sniper__input" style={{ ...INPUT, minHeight: 56, resize: 'vertical' }} value={cfg.streamers}
          placeholder={'streamer1\nstreamer2'} onChange={(e) => mudar({ streamers: e.target.value })} />
      </label>

      {est.estado === 'login' && est.codigo && (
        <div style={{ padding: 8, borderRadius: 6, ...GOLD, border: '1px solid #f5b800' }}>
          Entre em <b>twitch.tv/activate</b> e digite o código <b style={{ fontSize: 16, letterSpacing: 2 }}>{est.codigo}</b>
          {' '}(a página já foi aberta no navegador). Só é preciso uma vez por conta.
        </div>
      )}
      {est.mensagem && <div style={{ fontSize: 12, color: COR_ESTADO[est.estado] }}>{est.mensagem}</div>}
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
