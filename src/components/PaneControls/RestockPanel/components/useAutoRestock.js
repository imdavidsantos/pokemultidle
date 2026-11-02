import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clampQtd, pausa } from '../../../../utils/restock/loja';

// Reabastecimento automático: de tempos em tempos lê o estoque (via `carregar` do useRestock)
// e, se o item escolhido estiver abaixo do limite, compra sozinho com o mesmo `onBuy` do botão "Comprar".

const CHAVE = 'pokemultidle-restock-auto-v1';
const RESTAURAR_LIGADO = true;    // true: lembra o que estava ligado ao fechar/reabrir o painel
const INTERVALO_LISTA = 30 * 60 * 1000;   // 30 min: a cada quanto tempo relê o estoque (e verifica) enquanto algum grupo está ligado
const ESPERA_COMPRA = 20000;      // intervalo mínimo entre duas compras do mesmo grupo
export const MAX_LIMITE = 1000000;

// Como cada grupo é reconhecido (pelo NOME do item). Ajuste os padrões aqui se precisar.
export const GRUPOS = [
  { id: 'pokebola', titulo: 'Pokébola', casa: /ball/i, limite: 3000, compra: 3000 },
  { id: 'revive', titulo: 'Revive', casa: /revive/i, limite: 200, compra: 200 },
  { id: 'potion', titulo: 'Potion', casa: /potion/i, limite: 1000, compra: 1000 },
];

const padrao = () => Object.fromEntries(
  GRUPOS.map((g) => [g.id, { ativo: false, itemId: '', limite: g.limite, compra: g.compra }]),
);

function lerConfig(chave) {
  try {
    const bruto = JSON.parse(localStorage.getItem(`${CHAVE}:${chave}`) || '{}');
    const base = padrao();
    for (const g of GRUPOS) {
      const c = bruto[g.id] || {};
      base[g.id] = { ...base[g.id], ...c, ativo: RESTAURAR_LIGADO ? c.ativo === true : false };
    }
    return base;
  } catch {
    return padrao();
  }
}

// Item sem preço (preco == null, aparece "Preço: —" na loja) não dá para comprar.
export const temPreco = (item) => item.preco != null && Number(item.preco) > 0;

// O auto só mexe em item comprado com ouro.
const MOEDAS_OURO = ['ouro', 'gold', 'coin', 'coins'];
const compraComOuro = (item) => temPreco(item) && MOEDAS_OURO.includes(String(item.moeda || '').toLowerCase());

const candidatos = (grupo, itens) => (itens || []).filter(
  (i) => grupo.casa.test(String(i.nome || '')) && compraComOuro(i),
);

// Escolha manual -> usa ela. Automático -> o item cujo estoque mais caiu desde que o painel abriu
// (é o que você está gastando); sem queda ainda, o de maior estoque.
function resolver(grupo, cfgGrupo, itens, quedas) {
  const cands = candidatos(grupo, itens);
  if (!cands.length) return null;
  if (cfgGrupo.itemId) return cands.find((i) => String(i.id) === String(cfgGrupo.itemId)) || null;
  return [...cands].sort((a, b) => ((quedas[b.id] || 0) - (quedas[a.id] || 0)) || (b.qtd - a.qtd))[0];
}

export default function useAutoRestock({ itens, carregar, onBuy, chave = 'default' }) {
  const [cfg, setCfg] = useState(() => lerConfig(chave));
  const [estados, setEstados] = useState({});   // { [grupo]: { situacao, msg } }
  const [quedas, setQuedas] = useState({});     // { [itemId]: unidades gastas desde que abriu }

  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const itensRef = useRef(itens); itensRef.current = itens;
  const carregarRef = useRef(carregar); carregarRef.current = carregar;
  const onBuyRef = useRef(onBuy); onBuyRef.current = onBuy;
  const quedasRef = useRef({});
  const ultimo = useRef({});          // última quantidade vista de cada item
  const ultimaCompra = useRef({});    // grupo -> carimbo da última tentativa
  const ocupado = useRef(false);      // só uma compra por vez

  useEffect(() => {
    try { localStorage.setItem(`${CHAVE}:${chave}`, JSON.stringify(cfg)); } catch { /* sem espaço */ }
  }, [cfg, chave]);

  // acompanha o que está sendo gasto
  useEffect(() => {
    if (!itens) return;
    const q = { ...quedasRef.current };
    let mudou = false;
    for (const it of itens) {
      const ant = ultimo.current[it.id];
      if (ant !== undefined && it.qtd < ant) { q[it.id] = (q[it.id] || 0) + (ant - it.qtd); mudou = true; }
      ultimo.current[it.id] = it.qtd;
    }
    if (mudou) { quedasRef.current = q; setQuedas(q); }
  }, [itens]);

  const marcar = (id, patch) => setEstados((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const avaliar = useCallback(async () => {
    if (ocupado.current) return;
    const lista = itensRef.current;
    if (!lista) return;

    for (const g of GRUPOS) {
      const c = cfgRef.current[g.id];
      if (!c.ativo) continue;

      const alvo = resolver(g, c, lista, quedasRef.current);
      if (!alvo) { marcar(g.id, { situacao: 'erro', msg: 'Item não encontrado na loja.' }); continue; }

      const limite = Number(c.limite) || 0;
      if (limite <= 0 || alvo.qtd >= limite) { marcar(g.id, { situacao: 'ok', msg: '' }); continue; }
      if (Date.now() - (ultimaCompra.current[g.id] || 0) < ESPERA_COMPRA) continue;

      ocupado.current = true;
      ultimaCompra.current[g.id] = Date.now();
      const qtd = clampQtd(c.compra);
      marcar(g.id, { situacao: 'comprando', msg: `Comprando ${qtd.toLocaleString('pt-BR')} × ${alvo.nome}…` });
      try {
        const feito = await onBuyRef.current(alvo.id, qtd, { auto: true });
        if (feito === false) throw new Error('A compra foi recusada ou cancelada.');
        marcar(g.id, { situacao: 'ok', msg: `Comprou ${qtd.toLocaleString('pt-BR')} × ${alvo.nome}.` });
        await pausa(400);               // dá tempo do jogo atualizar o inventário
        await carregarRef.current();    // relê o estoque; isso dispara a próxima avaliação
      } catch (err) {
        console.warn('Auto-reabastecimento falhou:', err);
        // desliga só este grupo para não ficar tentando (e gastando) em loop
        setCfg((atual) => ({ ...atual, [g.id]: { ...atual[g.id], ativo: false } }));
        marcar(g.id, { situacao: 'erro', msg: `Parou: ${err?.message || 'erro desconhecido'}` });
      } finally {
        ocupado.current = false;
      }
      return;   // uma compra por avaliação; a releitura chama de novo para o próximo grupo
    }
  }, []);

  // só reavalia quando chega estoque novo ou quando liga/desliga/troca o item (não a cada tecla digitada)
  const gatilho = GRUPOS.map((g) => `${cfg[g.id].ativo}:${cfg[g.id].itemId}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { avaliar(); }, [itens, gatilho]);

  // mantém o estoque atualizado enquanto algum grupo estiver ligado
  useEffect(() => {
    if (!GRUPOS.some((g) => cfg[g.id].ativo)) return undefined;
    const t = setInterval(() => carregarRef.current(), INTERVALO_LISTA);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatilho]);

  const atualizar = useCallback((id, patch) => {
    setCfg((c) => ({ ...c, [id]: { ...c[id], ...patch } }));
  }, []);

  const grupos = useMemo(() => GRUPOS.map((g) => {
    const c = cfg[g.id];
    return {
      id: g.id,
      titulo: g.titulo,
      cfg: c,
      candidatos: candidatos(g, itens),
      alvo: resolver(g, c, itens, quedas),
      estado: estados[g.id] || {},
    };
  }), [cfg, itens, quedas, estados]);

  return { grupos, atualizar };
}
