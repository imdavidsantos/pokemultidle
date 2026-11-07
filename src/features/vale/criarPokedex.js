import { norm } from "./pokeInfo";

// cria uma Pokédex para buscar criaturas pelo ID ou pelo nome normalizado
export function criarPokedex(json) {
  const lista = json.creatures ?? json;
  const porId = new Map();
  const porNome = new Map();
  for (const c of lista) {
    porId.set(c.pokeId, c);
    porNome.set(norm(c.name), c);
  }
  return { porId, porNome };
}
