import { SCRIPT_VENDER } from './scripts';
import { executarNoWebview as rodar } from '../../../shared/webview';


// Abre a aba Depot (se preciso) e aperta "Vender todo o Depot"; a confirmação é a do próprio jogo
export const venderDepot = (webview) => rodar(webview, SCRIPT_VENDER);
