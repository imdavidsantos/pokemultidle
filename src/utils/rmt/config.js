import { GAME_ORIGIN } from '../../config';

export const TIPOS = ['item', 'pokemon', 'diamante'];

// Seletores do HTML do jogo (se o jogo mudar, ajuste aqui)
export const SEL = {
  abrirRmt: 'nav.menu-topo button[data-modal="community"]',
  anunciar: '#cm-anunciar',
  opcao: '.cm-escolha button.cm-grande[data-tipo="{tipo}"]',
};

// Imagens do próprio jogo
export const IMG = {
  gema: `${GAME_ORIGIN}/img/menu-gema.png`,
  item: `${GAME_ORIGIN}/assets/site/assets/ui/menu-bolsa.png`,
  pokemon: `${GAME_ORIGIN}/assets/site/assets/ui/ball-poke.png`,
  diamante: `${GAME_ORIGIN}/img/moeda-diamante.png`,
};
