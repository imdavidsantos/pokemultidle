import React from 'react';

const fmt = (n) => (Number(n) > 0 ? Number(n).toLocaleString('pt-BR') : '—');
const hora = (t) => new Date(t).toLocaleTimeString('pt-BR');

// O que o último scan do mercado viu para esta regra (é como você confere se está funcionando).
export default function ScanInfo({ info, ligado }) {
  if (!ligado) return null;
  if (!info) return <div className="sniper__scan">Aguardando o primeiro scan do mercado (a cada 3 s)…</div>;

  const precos = `Menor preço agora: ${fmt(info.minOuro)} ouro · ${fmt(info.minGemas)} gemas.`;
  const textos = {
    'sem-id': 'Item não identificado: escolha na lista.',
    limite: 'Limite de quantidade atingido (use "zerar").',
    'fora-do-mercado': 'Nenhum anúncio deste item no mercado agora.',
    'sem-teto': 'Defina um teto de preço.',
    acima: `${precos} Acima do teto.`,
    dentro: `${precos} Dentro do teto, buscando vendedores.`,
  };
  const velho = Date.now() - info.t > 15000;

  return (
    <div className={`sniper__scan sniper__scan--${velho ? 'velho' : info.situacao}`}>
      Scan {hora(info.t)}: {velho ? 'sem atualização há mais de 15 s.' : (textos[info.situacao] || info.situacao)}
    </div>
  );
}
