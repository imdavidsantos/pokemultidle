import React, { useEffect, useState } from 'react';
import {
  twitch, buscarPontosTwitch, limparSaldosTwitch, useTwitchConfig, useTwitchEstado, useTwitchParceiros, useTwitchPontosStatus, useTwitchSaldos,
} from '../../adapters/twitch';
import StreamRecompensas from '../../StreamRecompensas/StreamRecompensas';
import '../StreamPontos.css';

const INTERVALO_MS = 60000;   // com token: reconsulta os saldos enquanto o painel está aberto

// Formatação local (não depende mais do utils/twitch/formatos.js).
// "≈ 1.08k" quando o miner abreviou o saldo; senão o número exato em pt-BR.
const textoPontos = (d) => (d.aprox ? `≈ ${d.texto}` : Number(d.pontos).toLocaleString('pt-BR'));
const ordenarCanais = (saldos) => Object.entries(saldos).sort((a, b) => (b[1].pontos || 0) - (a[1].pontos || 0));   // maior saldo primeiro
function tempoRelativo(t, agora) {
  const s = Math.max(0, Math.floor((agora - t) / 1000));
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

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

// Os streamers vem da lista de canais parceiros.
// Os saldos vêm do log do miner (twitchStore): atualizam a cada ganho (~5 min) ou quando o canal fica online.
// Se a conta tiver o token (opcional, painel Twitch), os saldos também são consultados na Twitch ao abrir e a cada 60 s,
// mesmo com o miner parado, e o nome do streamer abre a aba de recompensas para resgatar.
// Parceiro sem saldo lido ainda aparece com "—"; saldos de canais que não são mais parceiros não são mostrados.
export default function TwitchPontosPanel({ slot, nome, onClose }) {
  const saldos = useTwitchSaldos(slot);
  const est = useTwitchEstado(slot);
  const cfg = useTwitchConfig(slot);
  const parc = useTwitchParceiros();
  const st = useTwitchPontosStatus(slot);
  const agora = useAgora();
  const [aberto, setAberto] = useState(null);   // login do streamer cuja aba de recompensas está aberta

  const token = String(cfg.token || '').trim();
  const qtdParceiros = parc.lista.length;

  useEffect(() => {
    if (!token || !qtdParceiros) return undefined;
    buscarPontosTwitch(slot);
    const t = setInterval(() => buscarPontosTwitch(slot), INTERVALO_MS);
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
  const semUsuario = !String(cfg.username || '').trim();

  let vazio = 'Nenhum saldo lido ainda.';
  if (!parc.lista.length) vazio = 'Ainda não recebi a lista de parceiros (abra uma conta do jogo e espere carregar).';
  else if (token && st.carregando) vazio = 'Consultando os saldos na Twitch…';
  else if (token && st.erro) vazio = st.erro;
  else if (!token && semUsuario) vazio = 'Informe o usuário da Twitch desta conta no painel Twitch e ligue o miner (ou cole o token, opcional, para ver os pontos sem o miner).';
  else if (!token && est.estado === 'parado') vazio = 'O miner desta conta está parado. Os saldos aparecem quando ele rodar (ou cole o token no painel Twitch).';
  else if (rodando || est.estado === 'iniciando') vazio = 'Aguardando o miner escrever o primeiro saldo…';

  if (aberto) {
    return (
      <div className="streampontos" role="dialog" aria-label="Recompensas da Twitch">
        <StreamRecompensas
          plataforma={twitch}
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
    <div className="streampontos" role="dialog" aria-label="Pontos da Twitch">
      <div className="streampontos__bar">
        <span>Pontos da Twitch{nome ? ` · ${nome}` : ''}</span>
        <button className="streampontos__close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="streampontos__sub">
        {cfg.username ? `Conta ${cfg.username} · ` : ''}
        {token && (st.carregando ? 'Consultando… · ' : st.t ? `Consultado ${tempoRelativo(st.t, agora)} · ` : '')}
        <span className={`streampontos__estado streampontos__estado--${est.estado}`}>{ROTULO_ESTADO[est.estado] || est.estado}</span>
      </div>

      {comSaldo.length === 0 && <p className="streampontos__msg">{vazio}</p>}
      {comSaldo.length > 0 && token && st.erro && <p className="streampontos__msg streampontos__msg--erro">{st.erro}</p>}

      {canais.length > 0 && (
        <ul className="streampontos__lista">
          {canais.map(([canal, d]) => (
            <li
              key={canal}
              className="streampontos__linha"
              style={off.has(canal.toLowerCase()) ? { opacity: 0.45 } : undefined}
              title={off.has(canal.toLowerCase()) ? 'Desativado nesta conta' : undefined}
            >
              <span className="streampontos__canal" title={canal}>
                {rodando && d && d.online !== undefined && (
                  <i className={`streampontos__dot ${d.online ? 'is-on' : ''}`} title={d.online ? 'Ao vivo' : 'Offline'} />
                )}
                <button
                  type="button"
                  className="streampontos__canalbtn"
                  title="Ver recompensas para resgatar"
                  onClick={() => setAberto(canal.toLowerCase())}
                >
                  {nomeDe[canal.toLowerCase()] || canal}
                </button>
              </span>
              <b className="streampontos__pontos">{d ? textoPontos(d) : '—'}</b>
              <span className={`streampontos__ganho ${d && d.ganho > 0 ? 'is-pos' : ''}`} title="Ganho visto nesta sessão (Limpar zera)">
                {d && d.ganho > 0 ? `+${d.ganho.toLocaleString('pt-BR')}` : '—'}
              </span>
              <span className="streampontos__visto">{d ? tempoRelativo(d.t, agora) : ''}</span>
            </li>
          ))}
        </ul>
      )}

      {(comSaldo.length > 0 || token) && (
        <div className="streampontos__rodape">
          <small>
            {token
              ? 'Saldo consultado na Twitch com o token, a cada 60 s.'
              : (rodando ? 'Atualiza a cada ganho de pontos.' : 'Último saldo lido (o miner não está rodando).')}
            {comSaldo.some(([, d]) => d.aprox) ? ' ≈ = valor abreviado pelo miner.' : ''}
          </small>
          <div className="streampontos__acoes">
            {token && <button className="streampontos__limpar" disabled={st.carregando} onClick={() => buscarPontosTwitch(slot)}>Atualizar</button>}
            {comSaldo.length > 0 && <button className="streampontos__limpar" onClick={() => limparSaldosTwitch(slot)}>Limpar</button>}
          </div>
        </div>
      )}
    </div>
  );
}
