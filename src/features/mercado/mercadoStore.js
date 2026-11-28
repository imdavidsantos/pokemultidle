import { createStore } from '../../shared/createStore';

// Dados do mercado (painel RMT), por conta. Tudo vem dos pacotes que o jogo já manda (ver webview-preload.js):
//   catalogo: [{ id, nome, icone, categoria }]      (welcome)
//   resumo:   { [itemId]: { anuncios, unidades, minGold, minOrb, em } }
//   especies: { moeda, lista: [...], em }
//   ofertas:  { itemId, moeda, linhas: [...], em }
//   pokemons: { moeda, linhas: [{ id, vendedor, preco, moeda, qtd, compravelEm, campos }], em }   (anúncios de Pokémon)
const VAZIO = Object.freeze({ catalogo: [], resumo: {}, especies: null, ofertas: null, pokemons: null });
const store = createStore({});

const enviadores = {};   // slot -> (pedido) => void   (o GameView registra: manda ao webview)

export function registrarEnviadorMercado(slot, fn) {
  enviadores[slot] = fn;
  return () => { if (enviadores[slot] === fn) delete enviadores[slot]; };
}

// Pedido de LEITURA ao jogo ({ t: 'market.itens' | 'market.item' | 'market.especies', ... }). Devolve false se a conta não está pronta.
export function pedirMercado(slot, msg) {
  const enviar = enviadores[slot];
  if (!enviar) return false;
  try { enviar({ acao: 'pedir', msg }); return true; } catch { return false; }
}

const atualizar = (slot, fn) => store.set((s) => ({ ...s, [slot]: fn(s[slot] || VAZIO) }));

// Chamado pelo GameView com cada evento que vem do jogo: { tipo, dados }
export function registrarMercado(slot, ev) {
  const { tipo, dados = {} } = ev || {};
  const em = Date.now();
  if (tipo === 'mercadoCatalogo') {
    atualizar(slot, (m) => ({ ...m, catalogo: dados.itens || [] }));
  } else if (tipo === 'mercadoItens') {
    atualizar(slot, (m) => {
      const resumo = { ...m.resumo };
      for (const [id, lin] of Object.entries(dados.resumo || {})) resumo[id] = { ...lin, em };
      return { ...m, resumo };
    });
  } else if (tipo === 'mercadoEspecies') {
    atualizar(slot, (m) => ({ ...m, especies: { moeda: dados.moeda, lista: dados.lista || [], em } }));
  } else if (tipo === 'mercadoPokemons') {
    atualizar(slot, (m) => ({ ...m, pokemons: { moeda: dados.moeda, linhas: dados.linhas || [], em } }));
  } else if (tipo === 'mercadoOfertas') {
    atualizar(slot, (m) => ({ ...m, ofertas: { itemId: dados.itemId, moeda: dados.moeda, linhas: dados.linhas || [], em } }));
  }
}

export const useMercado = (slot) => store.use((s) => s[slot] || VAZIO);
export const useMercadoTodos = () => store.use((s) => s);   // para escolher sozinho a conta que já recebeu o catálogo do jogo
