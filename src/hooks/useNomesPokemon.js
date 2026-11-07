import { useEffect, useState } from 'react';

// A pokédex tem ~3,6 MB: só é baixada do bundle quando alguém precisa dos nomes (painel do sniper),
// em vez de entrar no pacote inicial do app.
let cache = null;
let promessa = null;

const carregar = () => {
  if (!promessa) {
    promessa = import('../data/pokedex.json').then((m) => {
      const dados = m.default ?? m;
      cache = (dados.creatures || []).map((c) => c.name);
      return cache;
    });
  }
  return promessa;
};

export default function useNomesPokemon(ativo) {
  const [nomes, setNomes] = useState(cache ?? []);

  useEffect(() => {
    if (!ativo) return undefined;
    if (cache) { setNomes(cache); return undefined; }
    let vivo = true;
    carregar().then((n) => { if (vivo) setNomes(n); }).catch(() => { promessa = null; });
    return () => { vivo = false; };
  }, [ativo]);

  return nomes;
}
