import { BLOQUEAR_SE_PRECO_DIFERENTE, COMPRA_DE_VERDADE, CONFIRMAR_ANTES_DE_COMPRAR } from './config';
import { SCRIPT_LISTAR, SCRIPT_PRECOS, scriptClicar, scriptPreparar } from './scripts';
import { guardarPrecos, lerCachePrecos, limparPrecos } from './precos';

const rodar = (webview, script) => {
  if (typeof webview?.executeJavaScript !== 'function') return Promise.reject(new Error('Jogo ainda não carregou'));
  return webview.executeJavaScript(script, true);
};

const numero = (t) => Number(String(t).replace(/[^\d]/g, '')) || 0;

const confirmarNoApp = ({ nome, qtd, custo }) =>
  window.confirm(`Comprar ${qtd.toLocaleString('pt-BR')}× ${nome}?\n\nO botão do jogo mostra: ${custo || '?'} de ouro.`);

// Itens do cofre, já com o preço unitário
export async function listarItens(webview) {
  const itens = await rodar(webview, SCRIPT_LISTAR);

  let cache = lerCachePrecos();
  // lê o market na primeira vez, ou quando aparece um item que nunca foi procurado
  const precisaLer = !cache || itens.some((it) => !cache.precos[it.id] && !cache.tentados.includes(it.id));
  if (precisaLer) {
    try {
      const precos = await rodar(webview, SCRIPT_PRECOS);
      const tentados = [...new Set([...(cache?.tentados ?? []), ...itens.map((it) => it.id)])];
      cache = { precos, tentados };
      guardarPrecos(cache);
    } catch (err) {
      console.warn('Não consegui ler os preços:', err);   // segue sem preços e tenta de novo na próxima abertura
    }
  }

  const precos = cache?.precos ?? {};
  return itens.map((it) => ({ ...it, preco: precos[it.id]?.unit ?? null, moeda: precos[it.id]?.moeda ?? 'ouro' }));
}

// Devolve true se comprou, false se você cancelou na confirmação
export async function comprarItem(webview, id, qtd) {
  const info = await rodar(webview, scriptPreparar(id, qtd));

  // o total do botão do jogo precisa bater com o que o painel mostrou
  const cache = lerCachePrecos();
  const preco = cache?.precos[id]?.unit;
  if (BLOQUEAR_SE_PRECO_DIFERENTE && preco) {
    const esperado = preco * info.qtd;
    const total = numero(info.custo);
    if (total !== esperado) {
      const novo = total / info.qtd;
      if (Number.isInteger(novo) && novo > 0) {
        cache.precos[id] = { ...cache.precos[id], unit: novo };   // atualiza só esse item
        guardarPrecos(cache);
      } else {
        limparPrecos();   // preço que não é linear: lê tudo de novo na próxima abertura
      }
      const erro = new Error(`O preço mudou: era ${preco.toLocaleString('pt-BR')}/un. e o jogo mostra ${info.custo} no total. Atualizei; confira o novo total e compre de novo.`);
      erro.precoAtualizado = true;
      throw erro;
    }
  }

  if (!COMPRA_DE_VERDADE) {
    throw new Error(`Modo teste: ${info.qtd}× ${info.nome} preenchido (botão mostra ${info.custo || '?'}), sem comprar`);
  }
  if (CONFIRMAR_ANTES_DE_COMPRAR && !confirmarNoApp(info)) return false;
  await rodar(webview, scriptClicar(id, info.qtd));
  return true;
}
