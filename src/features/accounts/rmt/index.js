import { TIPOS } from './config';
import { scriptAbrirAnuncio } from './scripts';
import { executarNoWebview as rodar } from '../../../shared/webview';


// tipo: 'item' | 'pokemon' | 'diamante'
export function abrirAnuncioRmt(webview, tipo) {
  if (!TIPOS.includes(tipo)) return Promise.reject(new Error('Tipo de anúncio inválido'));
  return rodar(webview, scriptAbrirAnuncio(tipo));
}
