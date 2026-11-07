import { createStore } from '../../../../shared/createStore';
import { lerJson, gravarJson } from '../../../../shared/storage';

export const MAX_FIXADOS = 3;
const CHAVE = 'pokemultidle-helper-fixados';

function lerSalvo() {
  const v = lerJson(CHAVE);
  return Array.isArray(v) ? v : null;   // null = sem escolha (usa o padrão)
}

const store = createStore(lerSalvo());

export function salvarFixados(novos) {
  const ids = novos.slice(0, MAX_FIXADOS);
  gravarJson(CHAVE, ids);
  store.set(ids);
}

export default function useFixados() {
  return store.use();
}
