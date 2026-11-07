// Leitura/gravação de JSON no localStorage sem derrubar o app (JSON ilegível, cota cheia, storage bloqueado).

export function lerJson(chave, padrao = null) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto === null ? padrao : JSON.parse(bruto);
  } catch {
    return padrao;
  }
}

// true se gravou; false se não coube ou o storage está indisponível.
export function gravarJson(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function removerChave(chave) {
  try { localStorage.removeItem(chave); } catch { /* ignora */ }
}
