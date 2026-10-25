import { SCRIPT_VENDER } from './scripts';

const rodar = (webview, script) => {
  if (typeof webview?.executeJavaScript !== 'function') return Promise.reject(new Error('Jogo ainda não carregou'));
  return webview.executeJavaScript(script, true);
};

// Abre a aba Depot (se preciso) e aperta "Vender todo o Depot"; a confirmação é a do próprio jogo
export const venderDepot = (webview) => rodar(webview, SCRIPT_VENDER);
