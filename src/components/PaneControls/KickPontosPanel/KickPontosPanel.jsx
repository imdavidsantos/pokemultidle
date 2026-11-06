import React, { useEffect, useState } from 'react';
import {
  buscarPontosKick, limparSaldosKick, useKickConfig, useKickEstado, useKickParceiros, useKickPontosStatus, useKickSaldos,
} from '../../../utils/kick/kickStore';
import KickRecompensas from './components/KickRecompensas';
import './KickPontosPanel.css';

const INTERVALO_MS = 60000;   // reconsulta os saldos enquanto o painel está aberto

const ROTULO_ESTADO = {
  parado: 'Miner parado', iniciando: 'Miner iniciando…', login: 'Aguardando login', rodando: 'Miner rodando', erro: 'Miner com erro',
};

// Faz o "há X min" se atualizar sozinho.
function useAgora(ms = 30000) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return agora;
}

const textoPontos = (d) => Number(d.pontos).toLocaleString('pt-BR');
const ordenarCanais = (saldos) => Object.entries(saldos).sort((a, b) => (b[1].pontos || 0) - (a[1].pontos || 0));
function tempoRelativo(t, agora) {
  const s = Math.max(0, Math.floor((agora - t) / 1000));
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

// Os streamers vêm da lista de canais parceiros (estado.kick.oficiais do jogo).
// Os saldos vêm de uma requisição à Kick com o token da conta (kickStore.buscarPontosKick):
// consulta ao abrir e a cada 60 s, e funciona mesmo com o miner parado.
// Parceiro sem saldo lido ainda aparece com "—"; saldos de canais que não são mais parceiros não são mostrados.
export default function KickPontosPanel({ slot, nome, onClose }) {
  const saldos = useKickSaldos(slot);
  const est = useKickEstado(slot);
  const cfg = useKickConfig(slot);
  const parc = useKickParceiros();
  const st = useKickPontosStatus(slot);
  const agora = useAgora();
  const [aberto, setAberto] = useState(null);   // slug do streamer cuja aba de recompensas está aberta

  const token = String(cfg.token || '').trim();
  const qtdParceiros = parc.lista.length;

  useEffect(() => {
    if (!token || !qtdParceiros) return undefined;
    buscarPontosKick(slot);
    const t = setInterval(() => buscarPontosKick(slot), INTERVALO_MS);
    return () => clearInterval(t);
  }, [slot, token, qtdParceiros]);

  const nomeDe = Object.fromEntries(parc.lista.map((p) => [p.slug, p.nome]));
  const off = new Set(cfg.desativados || []);
  const comSaldo = ordenarCanais(saldos).filter(([canal]) => canal.toLowerCase() in nomeDe);   // maior saldo primeiro
  const lidos = new Set(comSaldo.map(([canal]) => canal.toLowerCase()));
  const semSaldo = parc.lista
    .filter((p) => !lidos.has(p.slug))
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((p) => [p.slug, undefined]);
  const canais = [...comSaldo, ...semSaldo];
  const rodando = est.estado === 'rodando';

  let vazio = 'Nenhum saldo lido ainda.';
  if (!qtdParceiros) vazio = 'Ainda não recebi a lista de parceiros (abra uma conta do jogo e espere carregar).';
  else if (!token) vazio = 'Cole o token da Kick desta conta no painel Kick para ver os pontos.';
  else if (st.carregando) vazio = 'Consultando os saldos na Kick…';
  else if (st.erro) vazio = st.erro;

  if (aberto) {
    return (
      <div className="kkpontos" role="dialog" aria-label="Recompensas da Kick">
        <KickRecompensas
          slot={slot}
          slug={aberto}
          nome={nomeDe[aberto] || aberto}
          pontos={saldos[aberto]?.pontos}
          onVoltar={() => setAberto(null)}
          onClose={onClose}
        />
      </div>
    );
  }

  return (
    <div className="kkpontos" role="dialog" aria-label="Pontos da Kick">
      <div className="kkpontos__bar">
        <span>Pontos da Kick{nome ? ` · ${nome}` : ''}</span>
        <button className="kkpontos__close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="kkpontos__sub">
        {st.carregando ? 'Consultando…' : st.t ? `Consultado ${tempoRelativo(st.t, agora)}` : 'Ainda não consultado'}
        {' · '}
        <span className={`kkpontos__estado kkpontos__estado--${est.estado}`}>{ROTULO_ESTADO[est.estado] || est.estado}</span>
      </div>

      {comSaldo.length === 0 && <p className="kkpontos__msg">{vazio}</p>}
      {comSaldo.length > 0 && st.erro && <p className="kkpontos__msg kkpontos__msg--erro">{st.erro}</p>}

      {canais.length > 0 && (
        <ul className="kkpontos__lista">
          {canais.map(([canal, d]) => (
            <li
              key={canal}
              className="kkpontos__linha"
              style={off.has(canal.toLowerCase()) ? { opacity: 0.45 } : undefined}
              title={off.has(canal.toLowerCase()) ? 'Desativado nesta conta' : undefined}
            >
              <span className="kkpontos__canal" title={canal}>
                {rodando && d && d.online !== undefined && (
                  <i className={`kkpontos__dot ${d.online ? 'is-on' : ''}`} title={d.online ? 'Ao vivo' : 'Offline'} />
                )}
                <button
                  type="button"
                  className="kkpontos__canalbtn"
                  title="Ver recompensas para resgatar"
                  onClick={() => setAberto(canal.toLowerCase())}
                >
                  {nomeDe[canal.toLowerCase()] || canal}
                </button>
              </span>
              <b className="kkpontos__pontos">{d ? textoPontos(d) : '—'}</b>
              <span className={`kkpontos__ganho ${d && d.ganho > 0 ? 'is-pos' : ''}`} title="Alta vista desde que o app começou a acompanhar (Limpar zera)">
                {d && d.ganho > 0 ? `+${d.ganho.toLocaleString('pt-BR')}` : '—'}
              </span>
              <span className="kkpontos__visto">{d ? tempoRelativo(d.t, agora) : ''}</span>
            </li>
          ))}
        </ul>
      )}

      {(comSaldo.length > 0 || token) && (
        <div className="kkpontos__rodape">
          <small>Saldo consultado na Kick com o token, a cada 60 s.</small>
          <div className="kkpontos__acoes">
            <button className="kkpontos__limpar" disabled={st.carregando || !token} onClick={() => buscarPontosKick(slot)}>Atualizar</button>
            {comSaldo.length > 0 && <button className="kkpontos__limpar" onClick={() => limparSaldosKick(slot)}>Limpar</button>}
          </div>
        </div>
      )}
    </div>
  );
}
