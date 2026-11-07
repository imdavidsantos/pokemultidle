import { SEL } from './config';

// Código que roda DENTRO da página do jogo e é compartilhado pelos scripts.
export const HELPERS = `
  const sel = ${JSON.stringify(SEL)};
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const esperar = async (fn, ms = 3000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await espera(50); }
    return null;
  };
  const q = (s, raiz = document) => raiz.querySelector(s);
  const visivel = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const norm = (s) => String(s).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim().toLowerCase();
  // botões do market que não pertencem a um cartão de item (abas e categorias)
  const botoesDoMarket = () => [...document.querySelectorAll(sel.modal + ' button')].filter((b) => !b.closest('.mk-card'));
  const comTexto = (b, texto) => norm(b.textContent).startsWith(norm(texto));

  // Abre o market (se não estiver visível) e vai para a aba Comprar. Devolve true se abriu agora.
  const abrirMarketNaCompra = async () => {
    const abriuAgora = !visivel(q(sel.corpo));
    if (abriuAgora) {
      const abrir = q(sel.abrirMarket);
      if (!abrir) throw new Error('Botão do market não encontrado');
      abrir.click();
      if (!(await esperar(() => visivel(q(sel.corpo))))) throw new Error('O market não abriu');
    }
    if (q(sel.corpo).dataset.aba !== 'compra') {
      const aba = botoesDoMarket().find((b) => comTexto(b, sel.abaComprarTexto));
      if (!aba) throw new Error('Aba Comprar não encontrada');
      aba.click();
      if (!(await esperar(() => q(sel.corpo)?.dataset.aba === 'compra'))) throw new Error('A aba Comprar não abriu');
    }
    return abriuAgora;
  };
`;
