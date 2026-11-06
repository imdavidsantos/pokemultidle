import React, { useEffect, useState } from 'react';
import {
  limparSaldosTwitch, useTwitchConfig, useTwitchEstado, useTwitchParceiros, useTwitchSaldos,
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

// Os streamers vem da lista de canais parceiros.
// Os saldos vêm do log do miner (twitchStore): atualizam a cada ganho (~5 min) ou quando o canal fica online.
// Parceiro sem saldo lido ainda aparece com "—"; saldos de canais que não são mais parceiros não são mostrados.
export default function TwitchPontosPanel({ slot, nome, onClose }) {
  const saldos = useTwitchSaldos(slot);
  const est = useTwitchEstado(slot);
  const cfg = useTwitchConfig(slot);
  const parc = useTwitchParceiros();
  const agora = useAgora();

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
  else if (semUsuario) vazio = 'Informe o usuário da Twitch desta conta no painel Twitch e ligue o miner.';
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

      {comSaldo.length === 0 && <p className="twpontos__msg">{vazio}</p>}

      {canais.length > 0 && (
        <ul className="twpontos__lista">
          {canais.map(([canal, d]) => (
            <li
              key={canal}
              className="twpontos__linha"
              style={off.has(canal.toLowerCase()) ? { opacity: 0.45 } : undefined}
              title={off.has(canal.toLowerCase()) ? 'Desativado nesta conta' : undefined}
            >
              <span className="twpontos__canal" title={canal}>
                {rodando && d && d.online !== undefined && (
                  <i className={`twpontos__dot ${d.online ? 'is-on' : ''}`} title={d.online ? 'Ao vivo' : 'Offline'} />
                )}
                {nomeDe[canal.toLowerCase()] || canal}
              </span>
              <b className="twpontos__pontos">{d ? textoPontos(d) : '—'}</b>
              <span className={`twpontos__ganho ${d && d.ganho > 0 ? 'is-pos' : ''}`} title="Ganho nesta sessão do miner">
                {d && d.ganho > 0 ? `+${d.ganho.toLocaleString('pt-BR')}` : '—'}
              </span>
              <span className="twpontos__visto">{d ? tempoRelativo(d.t, agora) : ''}</span>
            </li>
          ))}
        </ul>
      )}

      {comSaldo.length > 0 && (
        <div className="twpontos__rodape">
          <small>
            {rodando ? 'Atualiza a cada ganho de pontos.' : 'Último saldo lido (o miner não está rodando).'}
            {comSaldo.some(([, d]) => d.aprox) ? ' ≈ = valor abreviado pelo miner.' : ''}
          </small>
          <button className="twpontos__limpar" onClick={() => limparSaldosTwitch(slot)}>Limpar</button>
        </div>
      )}
    </div>
  );
}
