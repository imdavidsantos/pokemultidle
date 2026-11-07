import { CHAVE_PRECOS } from './config';
import { lerJson, gravarJson, removerChave } from '../../../shared/storage';

// Preços unitários guardados para sempre, no formato:
// { precos: { [id]: { unit, moeda } }, tentados: [ids já procurados no market] }
let precosMem = null;

const lerCachePrecos = () => {
  if (precosMem) return precosMem;
  const salvo = lerJson(CHAVE_PRECOS);
  if (salvo?.precos) precosMem = { precos: salvo.precos, tentados: salvo.tentados ?? [] };
  return precosMem;
};

const guardarPrecos = (cache) => {
  precosMem = cache;
  gravarJson(CHAVE_PRECOS, cache);
};

const limparPrecos = () => {
  precosMem = null;
  removerChave(CHAVE_PRECOS);
};

export { lerCachePrecos, guardarPrecos, limparPrecos };
