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

// ---------------------------------------------------------------------------
// Estado versionado: o que fica no localStorage é { v, dados }.
// Para mudar o formato de uma config: suba a VERSAO do módulo e acrescente em `migrar` o passo da versão antiga
// para a nova ({ [versaoAntiga]: (dados) => dadosNovos }). Quem salvou na versão antiga é migrado ao abrir.
// O que foi salvo ANTES do versionamento (sem envelope) conta como versão `legado` (0).
// ---------------------------------------------------------------------------

export const ehEnvelope = (x) => !!x && typeof x === 'object' && !Array.isArray(x) && Number.isInteger(x.v) && 'dados' in x;

// Função pura (não toca no localStorage): devolve { dados, v, futuro }.
// futuro: true = foi salvo por uma versão MAIS NOVA do app; não dá para interpretar (dados vem null).
// Se um passo de migração lançar erro, o erro sobe: quem chama decide (ver lerVersionado).
export function migrarDados(bruto, { versao, migrar = {}, legado = 0 }) {
  let v = legado;
  let dados = bruto;
  if (ehEnvelope(bruto)) { v = bruto.v; dados = bruto.dados; }
  if (v > versao) return { dados: null, v, futuro: true };
  for (; v < versao; v += 1) {
    const passo = migrar[v];
    if (passo) dados = passo(dados);
  }
  return { dados, v, futuro: false };
}

export function gravarVersionado(chave, versao, dados) {
  return gravarJson(chave, { v: versao, dados });
}

// Lê e migra. Se não existir, estiver ilegível, for de versão futura ou a migração falhar, devolve `padrao`
// e guarda uma cópia do que estava salvo em `${chave}.bak` para recuperar à mão (nunca perde em silêncio).
export function lerVersionado(chave, { versao, migrar, legado, padrao = null }) {
  let texto = null;
  try { texto = localStorage.getItem(chave); } catch { return padrao; }
  if (texto === null) return padrao;

  const guardarCopia = (motivo, err) => {
    console.error(`[storage] ${chave}: ${motivo}; cópia mantida em ${chave}.bak`, err ?? '');
    try { localStorage.setItem(`${chave}.bak`, texto); } catch { /* sem espaço */ }
  };

  let bruto;
  try { bruto = JSON.parse(texto); } catch (err) { guardarCopia('JSON ilegível', err); return padrao; }

  try {
    const r = migrarDados(bruto, { versao, migrar, legado });
    if (r.futuro) { guardarCopia(`salvo por uma versão mais nova do app (v${r.v})`); return padrao; }
    return r.dados ?? padrao;
  } catch (err) {
    guardarCopia('falha ao migrar', err);
    return padrao;
  }
}
