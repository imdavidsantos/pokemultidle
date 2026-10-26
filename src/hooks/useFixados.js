import { useSyncExternalStore } from 'react';

export const MAX_FIXADOS = 3;
const CHAVE = 'pokemultidle-helper-fixados';

function lerSalvo() {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE));
    return Array.isArray(v) ? v : null;   // null = sem escolha (usa o padrão)
  } catch {
    return null;
  }
}

let ids = lerSalvo();
const ouvintes = new Set();

const assinar = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const pegar = () => ids;

export function salvarFixados(novos) {
  ids = novos.slice(0, MAX_FIXADOS);
  try { localStorage.setItem(CHAVE, JSON.stringify(ids)); } catch { /* ignora */ }
  ouvintes.forEach((fn) => fn());
}

export default function useFixados() {
  return useSyncExternalStore(assinar, pegar);
}
