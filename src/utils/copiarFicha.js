// Tudo que depende do HTML interno do jogo para copiar a ficha fica aqui.
// Se o jogo mudar um id numa atualização, é só ajustar este arquivo.
const OPEN_SELECTOR = '#ativo-card';     // pokémon "Em campo"
const CLOSE_SELECTOR = '#ficha-fechar';  // botão × da ficha

// Roda dentro da página do jogo: abre a ficha do pokémon em campo (escondida),
// captura o texto que o jogo copiaria, e fecha a ficha.
const SCRIPT = `
(async ({ openSel, closeSel }) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const opener = document.querySelector(openSel);
  if (!opener) throw new Error('Pokémon em campo não encontrado na tela');

  // esconde a ficha enquanto copia, para não piscar
  const hide = document.createElement('style');
  hide.textContent = '#ficha { visibility: hidden !important; }';
  document.head.appendChild(hide);

  const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
  try {
    opener.click();
    await wait(200); // tempo da ficha montar
    const btn = document.getElementById('fi-gpt');
    if (!btn) throw new Error('Botão da ficha não encontrado');
    return await new Promise((resolve, reject) => {
      navigator.clipboard.writeText = async (t) => { resolve(t); };
      btn.click();
      setTimeout(() => reject(new Error('A ficha não foi gerada')), 3000);
    });
  } finally {
    navigator.clipboard.writeText = orig;
    const closeBtn = closeSel && document.querySelector(closeSel);
    if (closeBtn) closeBtn.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(100);
    hide.remove();
  }
})
`;

/**
 * Devolve o texto da ficha do pokémon em campo, sem precisar clicar nele antes.
 * @param {Electron.WebviewTag} webview o <webview> do jogo
 * @returns {Promise<string>}
 */
export function copiarFicha(webview) {
  if (!webview) return Promise.reject(new Error('Webview indisponível'));
  const args = JSON.stringify({ openSel: OPEN_SELECTOR, closeSel: CLOSE_SELECTOR });
  return webview.executeJavaScript(`(${SCRIPT})(${args})`, true);
}

export const REAPPLY_EVENTS = [
  'dom-ready',
  'did-finish-load',
  'did-navigate',
  'did-navigate-in-page',
  'did-frame-finish-load',
  'media-started-playing',
];
