import { comprarLojaSocket } from '../sniper/sniperStore';

// Mensagem do jogo: {"t":"shop.buy","kind":"ball"|"item","id":N,"qty":N}
//
// A chave de cada item no cofre/loja é "letra + número": "b4" = pokébola #4, "i206" = item #206.
// Isso bate com tudo que a captura descobriu (Ultra Ball b4, Max Revive i206, Revive i205,
// Golden Potion i70070), então o alvo sai direto da chave: não precisa de tabela por nome
// e vale também para os itens que você ainda não capturou (ex.: Beast Ball = b5).
// CONFIRA cada item novo comprando 1 unidade antes de ligar o auto.

// Só para item que NÃO segue esse padrão (ou que você queira forçar), pelo nome:
//   { casa: /^nome do item$/i, kind: 'item', id: 123 }
export const EXCECOES = [];

export function alvoDaCompra(itemId, nome) {
  const excecao = EXCECOES.find((e) => e.casa.test(String(nome || '').trim()));
  if (excecao) return { kind: excecao.kind, id: excecao.id };
  const m = /^([bi])(\d+)$/.exec(String(itemId || '').trim());
  if (!m) return null;
  return { kind: m[1] === 'b' ? 'ball' : 'item', id: Number(m[2]) };
}

// Cria o `onBuy` do RestockPanel. Item sem alvo conhecido usa o `onBuyAntigo` (cliques na tela), se houver.
//   const onBuy = criarOnBuy(slot, onBuyAntigo);   // onBuyAntigo é opcional
export const criarOnBuy = (slot, onBuyAntigo) => async (itemId, qtd, opcoes = {}) => {
  const alvo = alvoDaCompra(itemId, opcoes.item && opcoes.item.nome);
  if (!alvo) {
    if (onBuyAntigo) return onBuyAntigo(itemId, qtd, opcoes);
    throw new Error('Este item ainda não tem compra rápida configurada.');
  }
  const r = await comprarLojaSocket(slot, { kind: alvo.kind, id: alvo.id, qty: qtd });
  if (r && r.semResposta) {
    // a compra saiu, mas o jogo não mandou uma resposta reconhecida; estes são os pacotes que chegaram
    console.info(`[loja] ${itemId} x${qtd}: sem resposta reconhecida. Pacotes vistos:`, r.vistos);
  }
  return true;
};
