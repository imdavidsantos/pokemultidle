import { createStore } from '../../shared/createStore';
import { lerCachePrecos } from './utils/precos';

// Inventário de cada conta, lido dos pacotes do jogo (estado.items / estado.balls) pelo webview-preload.
// Não depende da tela em que a conta está: o jogo manda esses dados sozinho.
//   slot -> { items: { [id]: qtd }, balls: { [id]: qtd }, nomes: { [id]: { nome, icone } }, bolas: [...], auto: { revive, potion }, em }
const store = createStore({});

// Onde o jogo guarda os ícones (conferido no F12): bolas em .../ui/ball-ultra.png, itens do market em .../markitems/max_revive.png
const ORIGEM = 'https://pokeidle.io';
const iconeBola = (nome) => {
  const nm = String(nome || '').toLowerCase().replace(/\s*ball$/, '').trim().replace(/\s+/g, '-');
  return nm ? `${ORIGEM}/assets/site/assets/ui/ball-${nm}.png` : null;
};
const iconeMarket = (nome) => (nome && !/^Item #/.test(nome)
  ? `${ORIGEM}/assets/site/assets/markitems/${String(nome).toLowerCase().trim().replace(/\s+/g, '_')}.png`
  : null);

export function registrarInventario(slot, d) {
  if (!d || typeof d !== 'object') return;
  store.set((s) => {
    const ant = s[slot] || {};
    return {
      ...s,
      [slot]: {
        items: d.items || {},
        balls: d.balls || {},
        nomes: { ...(ant.nomes || {}), ...(d.nomes || {}) },   // nomes só chegam para o que você tem: guarda os já vistos
        bolas: d.bolas || ant.bolas || [],
        auto: d.auto || ant.auto || { revive: [], potion: [] },
        em: Date.now(),
      },
    };
  });
}

export const lerInventario = (slot) => store.get()[slot] || null;
export const useInventario = (slot) => store.use((s) => s[slot] || null);

// Itens no mesmo formato que o restock sempre usou: { id: 'b4' | 'i205', nome, qtd, icone, preco, moeda, compravel, grupo }.
// Devolve null enquanto o jogo ainda não mandou o inventário (quem chama pode usar a leitura pela tela).
export function listarDoSocket(slot) {
  const inv = lerInventario(slot);
  if (!inv) return null;
  const precos = lerCachePrecos()?.precos ?? {};
  const lista = [];

  for (const [id, qtd] of Object.entries(inv.balls)) {
    const cat = inv.bolas.find((b) => String(b.id) === String(id));
    const preco = cat?.priceGold ?? null;
    const compravel = !!cat?.compravel && preco > 0;
    lista.push({
      id: `b${id}`,
      nome: cat?.nome || `Ball #${id}`,
      qtd,
      icone: cat?.icone || iconeBola(cat?.nome),   // a Beast Ball vem com ícone do jogo; as outras seguem ball-<nome>.png
      preco,
      moeda: 'ouro',
      compravel,
      grupo: compravel ? 'pokebola' : null,
    });
  }

  for (const [id, qtd] of Object.entries(inv.items)) {
    const num = Number(id);
    const grupo = inv.auto.revive.includes(num) ? 'revive' : inv.auto.potion.includes(num) ? 'potion' : null;
    const p = precos[`i${id}`];   // preço lido do market no passado (se houver); revive/potion compram sem ele
    const nome = inv.nomes[id]?.nome || `Item #${id}`;
    lista.push({
      id: `i${id}`,
      nome,
      qtd,
      icone: inv.nomes[id]?.icone || iconeMarket(nome),
      preco: p?.unit ?? null,
      moeda: p?.moeda ?? 'ouro',
      compravel: p?.unit != null || grupo != null,
      grupo,
    });
  }
  return lista;
}