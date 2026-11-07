import React from 'react';

// Mostra em qual etapa a ligação com o jogo está parada.
export default function SniperDiag({ status }) {
  const t = status.trafego;
  const passos = [
    { ok: !!status.preload, txt: 'Preload do jogo carregou',
      dica: 'Nada chegou do webview. Confira se o webview-preload.js chama instalarGameTap() (veja o try/catch abaixo) e se o GameView escuta o "ipc-message".' },
    { ok: !!status.instalado, txt: 'Leitor instalado na página do jogo',
      dica: 'O preload carregou, mas o leitor não subiu na página. Veja a mensagem de erro abaixo.' },
    { ok: !!status.pronto, txt: 'Configuração entregue ao jogo',
      dica: 'A config ainda não chegou. Ela é enviada quando o jogo avisa que está pronto.' },
    { ok: !!status.socket, txt: 'Conexão do jogo encontrada',
      dica: t && t.total > 0
        ? 'O jogo envia pacotes, mas nenhum "welcome" ou "estado" apareceu ainda. Mande a lista de tipos abaixo para ajustar.'
        : 'Nenhum pacote do jogo foi lido ainda (ele pode estar na tela de login).' },
  ];
  const primeiroPendente = passos.findIndex((p) => !p.ok);

  return (
    <div className="sniper__diag">
      <div className="sniper__diag-titulo">Aguardando o jogo desta conta…</div>
      {passos.map((p, i) => (
        <div key={p.txt} className={`sniper__diag-passo ${p.ok ? 'is-ok' : i === primeiroPendente ? 'is-falha' : ''}`}>
          <span>{p.ok ? '✅' : i === primeiroPendente ? '❌' : '⏳'} {p.txt}</span>
          {i === primeiroPendente && <small>{p.dica}</small>}
        </div>
      ))}
      {t && (
        <div className="sniper__diag-trafego">
          Pacotes lidos: <b>{t.total}</b>{t.tipos.length > 0 && <> · tipos: {t.tipos.join(', ')}</>}
        </div>
      )}
      {status.erro && (
        <div className="sniper__diag-erro">Erro ({status.erro.etapa}): {status.erro.msg}</div>
      )}
    </div>
  );
}
