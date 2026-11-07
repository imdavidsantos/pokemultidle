// Roda um script dentro da página do jogo (<webview>) e devolve o resultado.
// Rejeita se o webview ainda não carregou. Antes cada módulo (restock, rmt, depot) tinha a sua cópia.
export function executarNoWebview(webview, script) {
  if (typeof webview?.executeJavaScript !== 'function') return Promise.reject(new Error('Jogo ainda não carregou'));
  return webview.executeJavaScript(script, true);
}
