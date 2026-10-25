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
  const norm = (s) => String(s).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim().toLowerCase();
  const numero = (t) => Number(String(t).replace(/[^\\d]/g, '')) || 0;

  const abaDepot = () => [...document.querySelectorAll(sel.abas)].find((b) => norm(b.textContent).startsWith('depot'));

  // Garante que a aba Depot está aberta (clica nela se não estiver)
  const irParaDepot = async () => {
    const aba = abaDepot();
    if (!aba) throw new Error('Aba Depot não encontrada');
    if (!aba.classList.contains('on')) {
      aba.click();
      if (!(await esperar(() => abaDepot()?.classList.contains('on')))) throw new Error('A aba Depot não abriu');
    }
  };

  // Acha o painel "vender tudo" visível: quantos pokémon há e o botão
  const lerInfo = () => {
    const caixa = [...document.querySelectorAll(sel.venderTudo)].find(visivel);
    if (!caixa) return null;
    return {
      botao: q('button.mk-acao', caixa),
      qtd: numero((q('.mk-vt-info', caixa)?.textContent ?? '').match(/(\\d[\\d.]*)\\s*para vender/i)?.[1] ?? ''),
    };
  };
`;

// Abre a aba Depot (se preciso) e clica em "Vender todo o Depot". O jogo pede a confirmação.
export const SCRIPT_VENDER = `
(async () => {
  ${BASE}
  await irParaDepot();
  const info = await esperar(lerInfo, 3000);
  if (!info) throw new Error('Painel de vender do Depot não encontrado');
  if (!info.qtd) throw new Error('O Depot está vazio');
  if (!info.botao) throw new Error('Botão de vender o Depot não encontrado');
  info.botao.click();
  return true;
})()
`;
