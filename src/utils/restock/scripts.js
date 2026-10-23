import { HELPERS } from './paginaHelpers';

// Lê os itens do cofre (mochila) e quanto você tem de cada um
const SCRIPT_LISTAR = `
(() => {
  const cofre = document.querySelector('#eco-cofre');
  if (!cofre) throw new Error('Cofre não encontrado na tela do jogo');
  return [...cofre.querySelectorAll('.eco-grade-itens button.eco-item')].map((el) => ({
    id: el.dataset.chave,
    nome: el.title || el.dataset.chave,
    qtd: Number((el.querySelector('.eco-item-q')?.textContent ?? '').replace(/[^\\d]/g, '')) || 0,
    icone: el.querySelector('.eco-item-ico img')?.src || null,
  }));
})()
`;

// Passa por cada categoria do market lendo o preço unitário de cada item
const SCRIPT_PRECOS = `
(async () => {
  ${HELPERS}
  const abriuAgora = await abrirMarketNaCompra();

  const precos = {};
  const ler = () => {
    for (const card of document.querySelectorAll(sel.corpo + ' .mk-card[data-chave]')) {
      const id = card.dataset.chave;
      const el = q('.mk-pal-preco', card);
      const unit = Number(((el?.textContent ?? '').match(/[\\d.]+/)?.[0] ?? '').replace(/\\./g, ''));
      if (id && unit > 0) precos[id] = { unit, moeda: q('img', el)?.alt || 'ouro' };
    }
  };

  const cats = botoesDoMarket().filter((b) => sel.categoriasTexto.some((t) => comTexto(b, t)));
  if (!cats.length) throw new Error('Botões de categoria não encontrados');
  for (const cat of cats) {
    const antes = q(sel.corpo)?.dataset.tela;
    cat.click();
    await esperar(() => q(sel.corpo)?.dataset.tela !== antes, 1000);
    await espera(200);
    ler();
  }

  if (abriuAgora && sel.fechar) q(sel.fechar)?.click();
  return precos;
})()
`;

// Passo 1 da compra: abre o market, acha o item, preenche a quantidade e lê o custo
const scriptPreparar = (id, qtd) => `
(async () => {
  ${HELPERS}
  const id = ${JSON.stringify(String(id))};
  const qtd = ${Number(qtd)};
  const cardSel = sel.card.replace('{id}', id);

  await abrirMarketNaCompra();

  // procura o item na categoria atual e, se não achar, nas outras
  let card = q(cardSel);
  if (!card) {
    const cats = botoesDoMarket().filter((b) => sel.categoriasTexto.some((t) => comTexto(b, t)));
    if (!cats.length) throw new Error('Botões de categoria não encontrados');
    for (const cat of cats) {
      cat.click();
      card = await esperar(() => q(cardSel), 1200);
      if (card) break;
    }
  }
  if (!card) throw new Error('Item não encontrado em nenhuma categoria do market');
  const nome = q('.mk-nome', card)?.title || id;

  // quantidade (o jogo pode redesenhar o cartão, então busca de novo)
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const campo = q(sel.input, card);
  if (!campo) throw new Error('Campo de quantidade não encontrado');
  setter.call(campo, String(qtd));
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  campo.dispatchEvent(new Event('change', { bubbles: true }));
  await espera(150);
  card = q(cardSel);
  const valor = Number(q(sel.input, card)?.value);
  if (valor !== qtd) throw new Error('O jogo não aceitou a quantidade (campo ficou em ' + valor + ')');

  // custo mostrado no botão de comprar (é o total)
  const botao = q(sel.botaoComprar, card);
  if (!botao) throw new Error('Botão de comprar não encontrado');
  const custo = q('.mk-moeda', botao)?.textContent.trim() ?? '';
  return { nome, qtd, custo };
})()
`;

// Passo 2 da compra: clica em comprar (confere de novo a quantidade) e fecha o market
const scriptClicar = (id, qtd) => `
(async () => {
  ${HELPERS}
  const card = q(sel.card.replace('{id}', ${JSON.stringify(String(id))}));
  const botao = card && q(sel.botaoComprar, card);
  if (!botao) throw new Error('Botão de comprar não encontrado');
  if (Number(q(sel.input, card)?.value) !== ${Number(qtd)}) throw new Error('A quantidade mudou; compra cancelada');
  botao.click();
  await espera(400);
  if (sel.fechar) q(sel.fechar)?.click();
  return true;
})()
`;

export { scriptClicar, scriptPreparar, SCRIPT_LISTAR, SCRIPT_PRECOS };
