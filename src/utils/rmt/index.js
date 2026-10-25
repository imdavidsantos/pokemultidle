import { TIPOS } from './config';
import { scriptAbrirAnuncio } from './scripts';

const rodar = (webview, script) => {
  if (typeof webview?.executeJavaScript !== 'function') return Promise.reject(new Error('Jogo ainda não carregou'));
  return webview.executeJavaScript(script, true);
};

// tipo: 'item' | 'pokemon' | 'diamante'
export function abrirAnuncioRmt(webview, tipo) {
  if (!TIPOS.includes(tipo)) return Promise.reject(new Error('Tipo de anúncio inválido'));
  return rodar(webview, scriptAbrirAnuncio(tipo));
}
