// Opções e seletores do jogo usados pelo Estoque.

const COMPRA_DE_VERDADE = true;              // false = modo teste: navega e preenche, mas NÃO clica em comprar
const CONFIRMAR_ANTES_DE_COMPRAR = false;    // true = pergunta (com o preço) antes de comprar
const BLOQUEAR_SE_PRECO_DIFERENTE = true;    // compra direta só se o total do jogo bater com o do painel
const CHAVE_PRECOS = 'pokemultidle-precos-v1';

// Seletores do HTML do jogo (se o jogo mudar, ajuste aqui)
const SEL = {
  abrirMarket: 'nav.menu-topo button[data-modal="market"]',
  modal: '#modal',
  corpo: '#mk-corpo',
  card: '#mk-corpo .mk-card[data-chave="{id}"]',
  input: '.mk-qtd input[type="number"]',
  botaoComprar: '.mk-pal-comprar',
  categoriasTexto: ['pokebolas', 'pocoes', 'revives', 'ovos'],
  abaComprarTexto: 'comprar',
  fechar: '#modal-fechar',
};

export { COMPRA_DE_VERDADE, CONFIRMAR_ANTES_DE_COMPRAR, BLOQUEAR_SE_PRECO_DIFERENTE, CHAVE_PRECOS, SEL };
