import { useSyncExternalStore } from 'react';

// Store mínimo (publicar/assinar) usado pelos módulos que guardam estado fora do React.
// - get/set: estado simples (set aceita valor ou função; não avisa se o valor não mudou).
// - subscribe/emit: para quem mantém o próprio estado (sniper, stream) e só precisa avisar quem assina.
// - use(seletor): hook; o valor só muda de referência quando o seletor devolve algo diferente.
export function createStore(inicial) {
  let estado = inicial;
  const ouvintes = new Set();

  const emit = () => ouvintes.forEach((f) => f());
  const subscribe = (f) => { ouvintes.add(f); return () => ouvintes.delete(f); };
  const get = () => estado;
  const set = (prox) => {
    const novo = typeof prox === 'function' ? prox(estado) : prox;
    if (Object.is(novo, estado)) return;
    estado = novo;
    emit();
  };
  const use = (seletor = (s) => s) => useSyncExternalStore(subscribe, () => seletor(estado));

  return { get, set, subscribe, emit, use };
}
