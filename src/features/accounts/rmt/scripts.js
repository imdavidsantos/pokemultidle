import { SEL } from './config';

// Código que roda DENTRO da página do jogo
const BASE = `
  const sel = ${JSON.stringify(SEL)};
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const esperar = async (fn, ms = 3000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await espera(50); }
    return null;
  };
  const q = (s, raiz = document) => (raiz ? raiz.querySelector(s) : null);
  const visivel = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
`;

// Leva o jogo até a página de anúncio do tipo escolhido (item, pokemon ou diamante)
export const scriptAbrirAnuncio = (tipo) => `
(async () => {
  ${BASE}
  const opcaoSel = sel.opcao.replace('{tipo}', ${JSON.stringify(tipo)});
  const achaOpcao = () => { const b = q(opcaoSel); return visivel(b) ? b : null; };
  const achaAnunciar = () => { const b = q(sel.anunciar); return visivel(b) ? b : null; };

  let opcao = achaOpcao();
  if (!opcao) {
    // 1. abre o market RMT (se o "+ Anunciar" ainda não estiver na tela)
    let anunciar = achaAnunciar();
    if (!anunciar) {
      const abrir = q(sel.abrirRmt);
      if (!abrir) throw new Error('Botão do market RMT não encontrado');
      abrir.click();
      anunciar = await esperar(achaAnunciar);
      if (!anunciar) throw new Error('O market RMT não abriu');
    }
    // 2. + Anunciar
    anunciar.click();
    opcao = await esperar(achaOpcao);
    if (!opcao) throw new Error('A tela de escolha do anúncio não abriu');
  }
  // 3. Um item / Um pokemon / Diamantes
  opcao.click();
  return true;
})()
`;
