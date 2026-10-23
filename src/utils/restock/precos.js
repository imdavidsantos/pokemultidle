import { CHAVE_PRECOS } from './config';

// Preços unitários guardados para sempre, no formato:
// { precos: { [id]: { unit, moeda } }, tentados: [ids já procurados no market] }
let precosMem = null;

const lerCachePrecos = () => {
  if (precosMem) return precosMem;
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_PRECOS));
    if (salvo?.precos) precosMem = { precos: salvo.precos, tentados: salvo.tentados ?? [] };
  } catch { /* sem cache */ }
  return precosMem;
};

const guardarPrecos = (cache) => {
  precosMem = cache;
  try { localStorage.setItem(CHAVE_PRECOS, JSON.stringify(cache)); } catch { /* ignora */ }
};

const limparPrecos = () => {
  precosMem = null;
  try { localStorage.removeItem(CHAVE_PRECOS); } catch { /* ignora */ }
};

export { lerCachePrecos, guardarPrecos, limparPrecos };
