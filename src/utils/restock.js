const rodar = (webview, script) => {
  if (typeof webview?.executeJavaScript !== 'function') return Promise.reject(new Error('Jogo ainda não carregou'));
  return webview.executeJavaScript(script, true);
};

// Lê os itens do cofre (mochila) e quanto você tem de cada um
const SCRIPT_LISTAR = `
(() => {
  const cofre = document.querySelector('#eco-cofre');
  if (!cofre) throw new Error('Cofre não encontrado na tela do jogo');
  return [...cofre.querySelectorAll('.eco-grade-itens button.eco-item')].map((el) => ({
    id: el.dataset.chave,
    nome: el.title || el.dataset.chave,
    qtd: Number((el.querySelector('.eco-item-q')?.textContent ?? '').replace(/[^\\d]/g, '')) || 0,
  }));
})()
`;

export function listarItens(webview) {
  return rodar(webview, SCRIPT_LISTAR);
}

// A compra depende de como o jogo faz isso: falta implementar.
// Enquanto isso, falha de propósito: nada de ✓ falso sem ter comprado.
export async function comprarItem() {
  throw new Error('Compra ainda não implementada (veja restock.js)');
}
