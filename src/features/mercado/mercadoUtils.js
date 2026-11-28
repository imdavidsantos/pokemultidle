// Funções puras do painel RMT (formatação, categorias, busca).

export const ORIGEM = 'https://pokeidle.io';

export const urlIcone = (u) => {
  if (!u) return null;
  if (/^https?:/i.test(u)) return u;
  return ORIGEM + (u.startsWith('/') ? u : `/${u}`);
};

const num = (n, casas) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: casas });

// Ouro abreviado como no jogo: 1,12B · 437M · 28,5M · 820K
export function fmtOuro(n) {
  const v = Number(n);
  if (!(v > 0)) return '—';
  for (const [limite, sufixo] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (v >= limite) {
      const x = v / limite;
      return num(x, x >= 100 ? 0 : x >= 10 ? 1 : 2) + sufixo;
    }
  }
  return num(v, 0);
}

export const fmtGemas = (n) => (Number(n) > 0 ? Number(n).toLocaleString('pt-BR') : '—');
export const fmtPreco = (n, moeda) => (moeda === 'orb' ? fmtGemas(n) : Number(n) > 0 ? Number(n).toLocaleString('pt-BR') : '—');

// ---- categorias (a chave vem do catálogo do jogo: casa, bicicleta, fragment…) ----
const ORDEM = ['casa', 'bicicleta', 'fragment', 'stone', 'pedra', 'boss', 'ticket'];
const PLURAL = { casa: 'Casas', bicicleta: 'Bicicletas', fragment: 'Fragmentos', stone: 'Pedras', pedra: 'Pedras', boss: 'Boss Tokens', ticket: 'Tickets' };
const SINGULAR = { casa: 'Casa', bicicleta: 'Bicicleta', fragment: 'Fragmento', stone: 'Pedra', pedra: 'Pedra', boss: 'Ficha de boss', ticket: 'Ticket' };
const capitalizar = (k) => (k ? k.charAt(0).toUpperCase() + k.slice(1) : '');

export const rotuloCategoria = (k) => PLURAL[k] || capitalizar(k);
export const rotuloItem = (k) => SINGULAR[k] || capitalizar(k);

export function categoriasDoCatalogo(catalogo) {
  const chaves = [...new Set((catalogo || []).map((i) => i.categoria).filter(Boolean))];
  const pos = (k) => { const i = ORDEM.indexOf(k); return i === -1 ? ORDEM.length : i; };
  return chaves.sort((a, b) => pos(a) - pos(b));
}

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Dados de uma linha só valem enquanto o painel está recebendo respostas novas (some sozinha se o estoque zerar)
export const VALIDADE_MS = 12000;
export const vivo = (lin, agora) => (lin && agora - lin.em < VALIDADE_MS ? lin : null);

export function textoIdade(em, agora) {
  if (!em) return '—';
  const s = Math.max(0, Math.round((agora - em) / 1000));
  return s < 2 ? 'agora' : `há ${s}s`;
}

// "daqui a 3 min" para a data em que o anúncio pode ser comprado (compravelEm); vazio se já passou
export function textoLiberacao(compravelEm, agora) {
  const ms = Number(compravelEm) - agora;
  if (!(ms > 0)) return '';
  const min = Math.ceil(ms / 60000);
  return min < 60 ? `libera em ${min} min` : `libera em ${Math.ceil(min / 60)} h`;
}

// ---- Pokémon ----
export const TIPOS_POKEMON = ['NORMAL', 'FIRE', 'WATER', 'ELECTRIC', 'GRASS', 'ICE', 'FIGHTING', 'POISON', 'GROUND', 'FLYING', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DRAGON', 'DARK', 'STEEL', 'FAIRY'];

// Valores de `ordem` que o jogo envia (capturados do market do próprio jogo): 'caros' = maior preço, 'baratos' = menor preço.
export const ORDENS = [
  { id: 'recentes', rotulo: 'Adicionados recentemente' },
  { id: 'baratos', rotulo: 'Menor preço' },
  { id: 'caros', rotulo: 'Maior preço' },
];

// "Filtrar por": vários critérios, a prioridade é a ordem em que foram clicados; o "Ordenar por" desempata.
// Na ordem em que o jogo mostra (2 colunas). Só o id 'iv' (Maior IV Somado) foi confirmado por captura;
// os outros seguem os nomes dos campos de filtro do próprio pedido (notaMin, qualidadeMin, ivHpMin…) — se algum não
// ordenar, capture o pedido do jogo ao escolher aquele critério e corrija o id aqui.
export const CRITERIOS = [
  { id: 'nota', rotulo: 'Maior Nota Calculadora' },
  { id: 'iv', rotulo: 'Maior IV Somado' },
  { id: 'qualidade', rotulo: 'Maior Qualidade' },
  { id: 'potencia', rotulo: 'Maior Potência' },
  { id: 'nivel', rotulo: 'Maior nível' },
  { id: 'refino', rotulo: 'Maior refino' },
  { id: 'ivHp', rotulo: 'Maior IV HP' },
  { id: 'ivAtk', rotulo: 'Maior IV ATK' },
  { id: 'ivDef', rotulo: 'Maior IV DEF' },
  { id: 'ivSpAtk', rotulo: 'Maior IV Sp.ATK' },
  { id: 'ivSpDef', rotulo: 'Maior IV Sp.DEF' },
  { id: 'ivSpd', rotulo: 'Maior IV SPD' },
];

// Os anúncios chegam com os campos achatados (ficha.nome, ficha.level…). Acha o primeiro que bate com algum dos nomes (último trecho da chave).
export function buscar(campos, nomes) {
  if (!campos) return undefined;
  for (const nome of nomes) {
    if (campos[nome] !== undefined) return campos[nome];
    const k = Object.keys(campos).find((c) => c.split('.').pop() === nome);
    if (k !== undefined) return campos[k];
  }
  return undefined;
}

// Campos que o painel já mostra de outro jeito (não repetir na lista de detalhes)
const JA_MOSTRADOS = new Set(['id', 'vendedor', 'vendedorId', 'preco', 'moeda', 'qtd', 'tipo', 'estado', 'compravelEm', 'criadoEm', 'expiraEm', 'dias', 'comprador', 'favoritos', 'itemId', 'pokemonId', 'npc', 'speciesId', 'level', 'nivel', 'potencia', 'nota', 'shiny', 'isShiny']);
export function detalhesPokemon(campos) {
  return Object.entries(campos || {})
    .filter(([k, v]) => !JA_MOSTRADOS.has(k.split('.').pop()) && !/(^|\.)(nome|icone|icon|sprite|looktype)$/i.test(k) && v !== '' && v !== false)
    .slice(0, 24);
}

// Acha um campo pelo final do caminho (ex.: 'ivs.hp' casa com 'ficha.ivs.hp' mas não com 'stats.hp' nem 'maxHp')
export function buscarSufixo(campos, sufixo) {
  if (!campos) return undefined;
  if (campos[sufixo] !== undefined) return campos[sufixo];
  const k = Object.keys(campos).find((c) => c.endsWith(`.${sufixo}`));
  return k !== undefined ? campos[k] : undefined;
}

// Escala da nota (0 a 10): uma barrinha por ponto, nas cores do jogo (cinza, vermelho, laranja, verdes, roxos, rosas)
export const BANDAS_NOTA = ['#9a9aa6', '#d24b3f', '#ec8a2c', '#2f9d50', '#86e6a6', '#27e87c', '#c4a6ff', '#a866f2', '#f3aedc', '#f46ac9'];
export const faixaNota = (nota) => Math.max(0, Math.min(9, Math.floor(Number(nota) || 0)));
export const fmtDecimal = (n, casas = 3) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: casas });

// Cores da potência (P1 a P5), como na tela "A potência deste Pokémon" do jogo
export const COR_POTENCIA = { 1: '#c9a8b4', 2: '#6ccb6a', 3: '#1fa6f5', 4: '#bb63ff', 5: '#ffc425' };
export const corPotencia = (p) => COR_POTENCIA[Math.max(1, Math.min(5, Math.round(Number(p) || 1)))];
