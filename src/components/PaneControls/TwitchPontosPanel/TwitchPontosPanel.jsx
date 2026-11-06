import React, { useEffect, useState } from 'react';
import {
  limparSaldosTwitch, useTwitchConfig, useTwitchEstado, useTwitchSaldos,
} from '../../../utils/twitch/twitchStore';
import { ordenarCanais, tempoRelativo, textoPontos } from '../../../utils/twitch/formatos';
import './TwitchPontosPanel.css';

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

// Saldo de pontos desta conta em cada canal que o miner acompanha. Os dados vêm do log do miner
// (twitchStore): atualizam a cada ganho (~5 min) ou quando o canal fica online.
export default function TwitchPontosPanel({ slot, nome, onClose }) {
  const saldos = useTwitchSaldos(slot);
  const est = useTwitchEstado(slot);
  const cfg = useTwitchConfig(slot);
  const agora = useAgora();

  const canais = ordenarCanais(saldos);
  const rodando = est.estado === 'rodando';
  const semUsuario = !String(cfg.username || '').trim();

  let vazio = 'Nenhum saldo lido ainda.';
  if (semUsuario) vazio = 'Informe o usuário da Twitch desta conta no painel Twitch e ligue o miner.';
  else if (est.estado === 'parado') vazio = 'O miner desta conta está parado. Os saldos aparecem quando ele rodar.';
  else if (rodando || est.estado === 'iniciando') vazio = 'Aguardando o miner escrever o primeiro saldo…';

  return (
    <div className="twpontos" role="dialog" aria-label="Pontos da Twitch">
      <div className="twpontos__bar">
        <span>Pontos da Twitch{nome ? ` · ${nome}` : ''}</span>
        <button className="twpontos__close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="twpontos__sub">
        {cfg.username ? `Conta ${cfg.username} · ` : ''}
        <span className={`twpontos__estado twpontos__estado--${est.estado}`}>{ROTULO_ESTADO[est.estado] || est.estado}</span>
      </div>

      {canais.length === 0 && <p className="twpontos__msg">{vazio}</p>}

      {canais.length > 0 && (
        <ul className="twpontos__lista">
          {canais.map(([canal, d]) => (
            <li key={canal} className="twpontos__linha">
              <span className="twpontos__canal" title={canal}>
                {rodando && d.online !== undefined && (
                  <i className={`twpontos__dot ${d.online ? 'is-on' : ''}`} title={d.online ? 'Ao vivo' : 'Offline'} />
                )}
                {canal}
              </span>
              <b className="twpontos__pontos">{textoPontos(d)}</b>
              <span className={`twpontos__ganho ${d.ganho > 0 ? 'is-pos' : ''}`} title="Ganho nesta sessão do miner">
                {d.ganho > 0 ? `+${d.ganho.toLocaleString('pt-BR')}` : '—'}
              </span>
              <span className="twpontos__visto">{tempoRelativo(d.t, agora)}</span>
            </li>
          ))}
        </ul>
      )}

      {canais.length > 0 && (
        <div className="twpontos__rodape">
          <small>
            {rodando ? 'Atualiza a cada ganho de pontos.' : 'Último saldo lido (o miner não está rodando).'}
            {canais.some(([, d]) => d.aprox) ? ' ≈ = valor abreviado pelo miner.' : ''}
          </small>
          <button className="twpontos__limpar" onClick={() => limparSaldosTwitch(slot)}>Limpar</button>
        </div>
      )}
    </div>
  );
}
