import React, { useEffect, useState } from 'react';
import './StreamRecompensas.css';

// Aba de um streamer: lista as recompensas (pedidas à plataforma com o token) e deixa resgatar com os pontos da conta.
// `plataforma` é o store da plataforma (adapters/kick.js ou adapters/twitch.js).
export default function StreamRecompensas({ plataforma, slot, slug, nome, pontos, onVoltar, onClose }) {
  const { nome: nomePlataforma, useRecompensas, useResgate, buscarRecompensas, resgatar: resgatarNaPlataforma } = plataforma;
  const rec = useRecompensas(slot, slug);
  const res = useResgate(slot);
  const [textos, setTextos] = useState({});   // id da recompensa -> texto digitado

  useEffect(() => { buscarRecompensas(slot, slug); }, [slot, slug]);

  const lista = [...rec.lista].sort((a, b) => a.custo - b.custo);
  const saldo = Number.isFinite(pontos) ? pontos : null;

  const resgatar = (r) => {
    const texto = (textos[r.id] || '').trim();
    if (r.pedeTexto && !texto) return;
    if (!window.confirm(`Gastar ${r.custo.toLocaleString('pt-BR')} pontos em "${r.titulo}" (${nome})?`)) return;
    resgatarNaPlataforma(slot, slug, r, texto);
  };

  return (
    <>
      <div className="streamrec__bar">
        <button className="streamrec__voltar" onClick={onVoltar} aria-label="Voltar">← Voltar</button>
        <button className="streamrec__close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="streamrec__titulo">
        <span className="streamrec__nome" title={slug}>{nome}</span>
        <span className="streamrec__saldo">{saldo === null ? '—' : `${saldo.toLocaleString('pt-BR')} pts`}</span>
      </div>

      {res.msg && <p className={`streamrec__msg ${res.ok ? 'is-ok' : 'is-erro'}`}>{res.msg}</p>}
      {rec.carregando && lista.length === 0 && <p className="streamrec__msg">Buscando recompensas…</p>}
      {!rec.carregando && rec.erro && <p className="streamrec__msg is-erro">{rec.erro}</p>}
      {!rec.carregando && !rec.erro && rec.t > 0 && lista.length === 0 && <p className="streamrec__msg">Este streamer não tem recompensas disponíveis.</p>}

      {lista.length > 0 && (
        <ul className="streamrec__lista">
          {lista.map((r) => {
            const semSaldo = saldo !== null && r.custo > saldo;
            const ocupado = !!res.id;
            const faltaTexto = r.pedeTexto && !(textos[r.id] || '').trim();
            const bloqueado = !r.ativo || semSaldo || ocupado || faltaTexto;
            let motivo = '';
            if (!r.ativo) motivo = 'Recompensa desativada ou pausada';
            else if (semSaldo) motivo = 'Pontos insuficientes';
            return (
              <li key={r.id} className={`streamrec__item ${r.ativo ? '' : 'is-off'}`} style={r.cor ? { borderLeft: `3px solid ${r.cor}` } : undefined}>
                <div className="streamrec__info">
                  <b className="streamrec__rotulo">{r.titulo}</b>
                  {r.descricao && <span className="streamrec__desc">{r.descricao}</span>}
                  {r.pedeTexto && (
                    <input
                      className="streamrec__input"
                      type="text"
                      maxLength={500}
                      placeholder="Digite sua mensagem"
                      value={textos[r.id] || ''}
                      onChange={(e) => setTextos((x) => ({ ...x, [r.id]: e.target.value }))}
                    />
                  )}
                </div>
                <span className="streamrec__custo">{r.custo.toLocaleString('pt-BR')}</span>
                <button className="streamrec__btn" disabled={bloqueado} title={motivo} onClick={() => resgatar(r)}>
                  {res.id === r.id ? '…' : 'Resgatar'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="streamrec__rodape">
        <small>Recompensas pedidas à {nomePlataforma} com o token. Resgatar gasta pontos de verdade.</small>
        <button className="streamrec__btn" disabled={rec.carregando} onClick={() => buscarRecompensas(slot, slug)}>Atualizar</button>
      </div>
    </>
  );
}
