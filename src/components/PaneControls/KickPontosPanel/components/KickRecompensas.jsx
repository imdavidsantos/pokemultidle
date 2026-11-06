import React, { useEffect, useState } from 'react';
import {
  buscarRecompensasKick, resgatarKick, useKickRecompensas, useKickResgate,
} from '../../../../utils/kick/kickStore';
import './KickRecompensas.css';

// Aba de um streamer: lista as recompensas (pedidas à Kick com o token) e deixa resgatar com os pontos da conta.
export default function KickRecompensas({ slot, slug, nome, pontos, onVoltar, onClose }) {
  const rec = useKickRecompensas(slot, slug);
  const res = useKickResgate(slot);
  const [textos, setTextos] = useState({});   // id da recompensa -> texto digitado

  useEffect(() => { buscarRecompensasKick(slot, slug); }, [slot, slug]);

  const lista = [...rec.lista].sort((a, b) => a.custo - b.custo);
  const saldo = Number.isFinite(pontos) ? pontos : null;

  const resgatar = (r) => {
    const texto = (textos[r.id] || '').trim();
    if (r.pedeTexto && !texto) return;
    if (!window.confirm(`Gastar ${r.custo.toLocaleString('pt-BR')} pontos em "${r.titulo}" (${nome})?`)) return;
    resgatarKick(slot, slug, r, texto);
  };

  return (
    <>
      <div className="kkrec__bar">
        <button className="kkrec__voltar" onClick={onVoltar} aria-label="Voltar">← Voltar</button>
        <button className="kkrec__close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="kkrec__titulo">
        <span className="kkrec__nome" title={slug}>{nome}</span>
        <span className="kkrec__saldo">{saldo === null ? '—' : `${saldo.toLocaleString('pt-BR')} pts`}</span>
      </div>

      {res.msg && <p className={`kkrec__msg ${res.ok ? 'is-ok' : 'is-erro'}`}>{res.msg}</p>}
      {rec.carregando && lista.length === 0 && <p className="kkrec__msg">Buscando recompensas…</p>}
      {!rec.carregando && rec.erro && <p className="kkrec__msg is-erro">{rec.erro}</p>}
      {!rec.carregando && !rec.erro && rec.t > 0 && lista.length === 0 && <p className="kkrec__msg">Este streamer não tem recompensas disponíveis.</p>}

      {lista.length > 0 && (
        <ul className="kkrec__lista">
          {lista.map((r) => {
            const semSaldo = saldo !== null && r.custo > saldo;
            const ocupado = !!res.id;
            const faltaTexto = r.pedeTexto && !(textos[r.id] || '').trim();
            const bloqueado = !r.ativo || semSaldo || ocupado || faltaTexto;
            let motivo = '';
            if (!r.ativo) motivo = 'Recompensa desativada ou pausada';
            else if (semSaldo) motivo = 'Pontos insuficientes';
            return (
              <li key={r.id} className={`kkrec__item ${r.ativo ? '' : 'is-off'}`} style={r.cor ? { borderLeft: `3px solid ${r.cor}` } : undefined}>
                <div className="kkrec__info">
                  <b className="kkrec__rotulo">{r.titulo}</b>
                  {r.descricao && <span className="kkrec__desc">{r.descricao}</span>}
                  {r.pedeTexto && (
                    <input
                      className="kkrec__input"
                      type="text"
                      maxLength={500}
                      placeholder="Digite sua mensagem"
                      value={textos[r.id] || ''}
                      onChange={(e) => setTextos((x) => ({ ...x, [r.id]: e.target.value }))}
                    />
                  )}
                </div>
                <span className="kkrec__custo">{r.custo.toLocaleString('pt-BR')}</span>
                <button className="kkrec__btn" disabled={bloqueado} title={motivo} onClick={() => resgatar(r)}>
                  {res.id === r.id ? '…' : 'Resgatar'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="kkrec__rodape">
        <small>Recompensas pedidas à Kick com o token. Resgatar gasta pontos de verdade.</small>
        <button className="kkrec__btn" disabled={rec.carregando} onClick={() => buscarRecompensasKick(slot, slug)}>Atualizar</button>
      </div>
    </>
  );
}
