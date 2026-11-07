import React, { useEffect, useState } from 'react';
import {
  buscarRecompensasTwitch, resgatarTwitch, useTwitchRecompensas, useTwitchResgate,
} from '../../../../utils/twitch/twitchStore';
import './TwitchRecompensas.css';

// Aba de um streamer: lista as recompensas (pedidas à Twitch com o token) e deixa resgatar com os pontos da conta.
export default function TwitchRecompensas({ slot, slug, nome, pontos, onVoltar, onClose }) {
  const rec = useTwitchRecompensas(slot, slug);
  const res = useTwitchResgate(slot);
  const [textos, setTextos] = useState({});   // id da recompensa -> texto digitado

  useEffect(() => { buscarRecompensasTwitch(slot, slug); }, [slot, slug]);

  const lista = [...rec.lista].sort((a, b) => a.custo - b.custo);
  const saldo = Number.isFinite(pontos) ? pontos : null;

  const resgatar = (r) => {
    const texto = (textos[r.id] || '').trim();
    if (r.pedeTexto && !texto) return;
    if (!window.confirm(`Gastar ${r.custo.toLocaleString('pt-BR')} pontos em "${r.titulo}" (${nome})?`)) return;
    resgatarTwitch(slot, slug, r, texto);
  };

  return (
    <>
      <div className="twrec__bar">
        <button className="twrec__voltar" onClick={onVoltar} aria-label="Voltar">← Voltar</button>
        <button className="twrec__close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="twrec__titulo">
        <span className="twrec__nome" title={slug}>{nome}</span>
        <span className="twrec__saldo">{saldo === null ? '—' : `${saldo.toLocaleString('pt-BR')} pts`}</span>
      </div>

      {res.msg && <p className={`twrec__msg ${res.ok ? 'is-ok' : 'is-erro'}`}>{res.msg}</p>}
      {rec.carregando && lista.length === 0 && <p className="twrec__msg">Buscando recompensas…</p>}
      {!rec.carregando && rec.erro && <p className="twrec__msg is-erro">{rec.erro}</p>}
      {!rec.carregando && !rec.erro && rec.t > 0 && lista.length === 0 && <p className="twrec__msg">Este streamer não tem recompensas disponíveis.</p>}

      {lista.length > 0 && (
        <ul className="twrec__lista">
          {lista.map((r) => {
            const semSaldo = saldo !== null && r.custo > saldo;
            const ocupado = !!res.id;
            const faltaTexto = r.pedeTexto && !(textos[r.id] || '').trim();
            const bloqueado = !r.ativo || semSaldo || ocupado || faltaTexto;
            let motivo = '';
            if (!r.ativo) motivo = 'Recompensa desativada ou pausada';
            else if (semSaldo) motivo = 'Pontos insuficientes';
            return (
              <li key={r.id} className={`twrec__item ${r.ativo ? '' : 'is-off'}`} style={r.cor ? { borderLeft: `3px solid ${r.cor}` } : undefined}>
                <div className="twrec__info">
                  <b className="twrec__rotulo">{r.titulo}</b>
                  {r.descricao && <span className="twrec__desc">{r.descricao}</span>}
                  {r.pedeTexto && (
                    <input
                      className="twrec__input"
                      type="text"
                      maxLength={500}
                      placeholder="Digite sua mensagem"
                      value={textos[r.id] || ''}
                      onChange={(e) => setTextos((x) => ({ ...x, [r.id]: e.target.value }))}
                    />
                  )}
                </div>
                <span className="twrec__custo">{r.custo.toLocaleString('pt-BR')}</span>
                <button className="twrec__btn" disabled={bloqueado} title={motivo} onClick={() => resgatar(r)}>
                  {res.id === r.id ? '…' : 'Resgatar'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="twrec__rodape">
        <small>Recompensas pedidas à Twitch com o token. Resgatar gasta pontos de verdade.</small>
        <button className="twrec__btn" disabled={rec.carregando} onClick={() => buscarRecompensasTwitch(slot, slug)}>Atualizar</button>
      </div>
    </>
  );
}