import React, { useEffect, useMemo, useState } from 'react';
import { useSniperStatus } from '../../sniper/sniperStore';
import { pedirMercado, useMercado, useMercadoTodos } from '../mercadoStore';
import {
  BANDAS_NOTA, ORDENS, corPotencia, TIPOS_POKEMON, buscar, buscarSufixo, categoriasDoCatalogo, faixaNota, fmtDecimal, fmtGemas, fmtOuro, fmtPreco, norm, rotuloCategoria, rotuloItem,
  textoIdade, textoLiberacao, urlIcone, vivo,
} from '../mercadoUtils';
import '../../sniper/SniperPanel/SniperPanel.css';   // mesma aparência do Sniper (moldura, abas, botões, inputs)
import './MercadoPanel.css';

const CHAVE_CENTRO = 'rmt:centralizado';
const INTERVALO_MS = 3000;       // Igual o sniper; só roda com este painel aberto
const ESCALONAR_MS = 250;        // "Todas": uma categoria por vez, sem mandar tudo no mesmo instante

// Mesmo pedido que o próprio jogo manda ao abrir a aba Pokemon (a lista sai do catálogo de espécies do servidor)
const PEDIDO_ESPECIES = {
  t: 'market.especies', tipo: 'pokemon', busca: '', ordem: 'recentes', criterios: [], elementos: [], tiposUnidos: true, categoria: '',
  soShiny: false, soP5: false, soMega: false, soLendario: false, soTmElemental: false, soTmAoe: false, semOutland: false, nivelMin: '', nivelMax: '',
};

const FILTROS_PADRAO = { soShiny: false, soP5: false, soMega: false, soLendario: false, soTmElemental: false, soTmAoe: false, semOutland: false };
const RARIDADE = [
  ['soShiny', 'Só shiny'], ['soP5', 'Apenas P5'], ['soMega', 'Mega Evolução'], ['soLendario', 'Lendários'],
  ['soTmElemental', 'Possui Z-Move'], ['soTmAoe', 'Possui TM AoE'],
];

function useAtraso(valor, ms) {
  const [v, setV] = useState(valor);
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t); }, [valor, ms]);
  return v;
}

const Ouro = () => <span className="merc__moeda merc__moeda--ouro" aria-label="ouro" />;
const Gema = () => <span className="merc__moeda merc__moeda--gema" aria-label="gemas" />;

function Icone({ src, nome }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [src]);
  if (!src || falhou) return <span className="merc__ico merc__ico--vazio" aria-hidden="true">{String(nome || '?').charAt(0)}</span>;
  return <img className="merc__ico" src={src} alt="" loading="lazy" draggable={false} onError={() => setFalhou(true)} />;
}

function CardItem({ item, onOfertas }) {
  const lin = item.lin;
  return (
    <div className="merc__card">
      <div className="merc__card-ico"><Icone src={urlIcone(item.icone)} nome={item.nome} /></div>
      <div className="merc__card-nome" title={item.nome}>{item.nome}</div>
      <div className="merc__card-info">
        {rotuloItem(item.categoria)}
        {lin ? ` · ${lin.anuncios} anúncio(s) · ${lin.unidades} unidade(s)` : ' · sem anúncios'}
      </div>
      <div className="merc__precos">
        <div><span>A partir de:</span><b><Ouro />{fmtOuro(lin?.minGold)}</b></div>
        <div><span>A partir de:</span><b className="merc__gemas"><Gema />{fmtGemas(lin?.minOrb)}</b></div>
      </div>
      <button type="button" className="merc__ofertas" disabled={!lin} onClick={() => onOfertas(item)}>Ver ofertas</button>
    </div>
  );
}

function CardEspecie({ e, moeda, onAbrir }) {
  return (
    <div className="merc__card merc__card--clicavel" onClick={() => onAbrir(e)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') onAbrir(e); }}>
      <div className="merc__card-ico merc__card-ico--poke"><span className="merc__dex">#{e.speciesId}</span></div>
      <div className="merc__card-nome" title={e.nome}>{e.nome}</div>
      <div className="merc__tipos">
        {e.tipos.map((t) => <span key={t} className={`merc__tipo merc__tipo--${String(t).toLowerCase()}`}>{t}</span>)}
      </div>
      <div className="merc__card-info">
        {e.anuncios} anúncio(s){e.shinys > 0 ? ` · ${e.shinys} shiny` : ''}
      </div>
      <div className="merc__flags">
        {e.temP5 && <span className="merc__pot" style={{ '--cp': corPotencia(5) }}>P5</span>}
        {e.temTmElemental && <span>TM elemental</span>}
        {e.temTmAoe && <span>TM AoE</span>}
      </div>
      <div className="merc__precos">
        <div><span>A partir de:</span><b className={moeda === 'orb' ? 'merc__gemas' : ''}>{moeda === 'orb' ? <Gema /> : <Ouro />}{moeda === 'orb' ? fmtGemas(e.minOrb) : fmtOuro(e.minGold)}</b></div>
      </div>
      <button type="button" className="merc__ofertas" onClick={(ev) => { ev.stopPropagation(); onAbrir(e); }}>Ver anúncios</button>
    </div>
  );
}

const IVS = [['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['spAtk', 'SpA'], ['spDef', 'SpD'], ['speed', 'SPD']];

// Nota de 0 a 10 em 10 barrinhas (uma por ponto): as já alcançadas acesas, a atual preenchida até a fração
function Nota({ nota }) {
  const n = Math.max(0, Math.min(10, Number(nota) || 0));
  const faixa = faixaNota(n);
  const frac = n >= 10 ? 1 : n - Math.floor(n);
  return (
    <span className="merc__nota" style={{ '--cor': BANDAS_NOTA[faixa] }} title={`Nota ${fmtDecimal(n)} de 10`}>
      <b>{fmtDecimal(n)}</b>
      <span className="merc__nota-bar" aria-hidden="true">
        {BANDAS_NOTA.map((cor, i) => (
          <i key={cor} style={i < faixa ? { background: cor } : i === faixa ? { background: `linear-gradient(90deg, ${cor} ${frac * 100}%, rgba(255,255,255,.12) ${frac * 100}%)` } : undefined} />
        ))}
      </span>
    </span>
  );
}

// Um anúncio de Pokémon: em cima nome, nível, P, nota, vendedor e preço; embaixo só IVs, quality, IV total e tipos.
function LinhaPokemon({ l, moeda, agora }) {
  const c = l.campos || {};
  const nome = buscar(c, ['nome', 'pokemonNome']) ?? '?';
  const nivel = buscar(c, ['level', 'nivel']);
  const pot = buscar(c, ['potencia']);
  const nota = buscar(c, ['nota']);
  const shiny = !!buscar(c, ['shiny', 'isShiny']);
  const lib = textoLiberacao(l.compravelEm, agora);
  const ivs = IVS.map(([k, rot]) => [rot, buscarSufixo(c, `ivs.${k}`)]).filter(([, v]) => v != null);
  const ivTotal = buscar(c, ['ivTotal']);
  const quality = buscar(c, ['quality']);
  const tipos = String(buscar(c, ['tipos']) ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const faixa = nota != null ? faixaNota(nota) : null;
  return (
    <div className="merc__poke" style={faixa != null ? { '--cor': BANDAS_NOTA[faixa] } : undefined}>
      <div className="merc__poke-topo">
        <b className="merc__poke-nome">{shiny && <span className="merc__shiny">★</span>}{nome}</b>
        {nivel != null && <span className="merc__chip">Nv {Number(nivel).toLocaleString('pt-BR')}</span>}
        {pot != null && <span className="merc__pot" style={{ '--cp': corPotencia(pot) }}>P{pot}</span>}
        {nota != null && <Nota nota={nota} />}
        {lib && <span className="merc__poke-lib">{lib}</span>}
        <span className="merc__poke-vend" title={l.vendedor}>{l.vendedor}</span>
        <b className={`merc__poke-preco ${moeda === 'orb' ? 'merc__gemas' : ''}`}>{moeda === 'orb' ? <Gema /> : <Ouro />}{fmtPreco(l.preco, moeda)}</b>
      </div>
      {(ivs.length > 0 || ivTotal != null || quality != null || tipos.length > 0) && (
        <div className="merc__poke-det">
          {ivs.map(([rot, v]) => <span key={rot} className="merc__iv"><i>{rot}</i><b className={Number(v) < 16 ? 'merc__iv-n merc__iv-n--baixo' : 'merc__iv-n merc__iv-n--alto'}>{v}</b></span>)}
          {ivTotal != null && <span className="merc__poke-dest"><i>IV total</i>{ivTotal}</span>}
          {quality != null && <span className="merc__poke-dest"><i>Quality</i>{fmtDecimal(quality)}</span>}
          {tipos.length > 0 && (
            <span className="merc__tipos">
              {tipos.map((t) => <span key={t} className={`merc__tipo merc__tipo--${t.toLowerCase()}`}>{t}</span>)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Ofertas({ oferta, dados, desde, agora, onTrocarMoeda, onVoltar }) {
  const linhas = dados && dados.itemId === oferta.itemId && dados.em >= desde ? dados.linhas : null;
  return (
    <div className="merc__ofertas-vista">
      <div className="merc__ofertas-topo">
        <button type="button" className="sniper__btn" onClick={onVoltar}>← Voltar</button>
        <Icone src={urlIcone(oferta.icone)} nome={oferta.nome} />
        <b>{oferta.nome}</b>
        <div className="merc__seg" role="radiogroup" aria-label="Moeda">
          {[['gold', 'Ouro'], ['orb', 'Gemas']].map(([id, rot]) => (
            <button key={id} type="button" role="radio" aria-checked={oferta.moeda === id} className={`merc__seg-btn ${oferta.moeda === id ? 'is-on' : ''}`} onClick={() => onTrocarMoeda(id)}>{rot}</button>
          ))}
        </div>
      </div>

      {linhas === null && <p className="sniper__vazio">Carregando ofertas…</p>}
      {linhas && linhas.length === 0 && <p className="sniper__vazio">Nenhuma oferta nesta moeda.</p>}
      {linhas && linhas.length > 0 && (
        <div className="merc__tabela" role="table">
          <div className="merc__linha merc__linha--cab" role="row">
            <span>Vendedor</span><span>Qtd</span><span>Preço</span><span>Detalhe</span>
          </div>
          {linhas.map((l) => {
            const lib = textoLiberacao(l.compravelEm, agora);
            const det = [l.ficha?.numero != null ? `#${l.ficha.numero}` : '', l.ficha?.casaRaridade || '', lib].filter(Boolean).join(' · ');
            return (
              <div key={l.id} className="merc__linha" role="row">
                <span title={l.vendedor}>{l.vendedor}</span>
                <span>{Number(l.qtd).toLocaleString('pt-BR')}</span>
                <b>{oferta.moeda === 'orb' ? <Gema /> : <Ouro />}{fmtPreco(l.preco, oferta.moeda)}</b>
                <span className="merc__det">{det}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MercadoPanel({ accounts, onClose }) {
  const [tipo, setTipo] = useState('itens');           // 'itens' | 'pokemon'
  const [categoria, setCategoria] = useState('');      // '' = todas
  const [busca, setBusca] = useState('');
  const [ocultar, setOcultar] = useState(true);        // ocultar sem estoque
  const [moedaPoke, setMoedaPoke] = useState('gold');
  const [filtros, setFiltros] = useState(FILTROS_PADRAO);   // só shiny, P5, mega…
  const [elementos, setElementos] = useState([]);            // tipos escolhidos
  const [nivel, setNivel] = useState({ min: '', max: '' });
  const [ordem, setOrdem] = useState('recentes');
  const [agregar, setAgregar] = useState(true);              // agrupar por espécie (desligado = lista de anúncios)
  const [especie, setEspecie] = useState(null);              // { speciesId, nome } aberta em "Ver anúncios"
  const [oferta, setOferta] = useState(null);          // { itemId, nome, icone, moeda } | null
  const [agora, setAgora] = useState(() => Date.now());
  const [desde, setDesde] = useState(0);              // só vale resposta pedida depois da última troca de filtro
  const [centro, setCentro] = useState(() => {
    try { return localStorage.getItem(CHAVE_CENTRO) !== '0'; } catch { return true; }
  });

  // Sem seletor de conta: o mercado é o mesmo para todas, então lê da primeira que já recebeu o catálogo do jogo (logada)
  const todos = useMercadoTodos();
  const conta = accounts.find((a) => todos[a.slot]?.catalogo?.length) ?? accounts[0];
  const slotAtual = conta?.slot;
  const status = useSniperStatus(slotAtual);
  const conectado = !!status.socket;
  const merc = useMercado(slotAtual);
  const nivelAplicado = useAtraso(nivel, 600);   // espera parar de digitar antes de pedir de novo
  const buscaAplicada = useAtraso(busca, 600);
  const categorias = useMemo(() => categoriasDoCatalogo(merc.catalogo), [merc.catalogo]);

  useEffect(() => {
    try { localStorage.setItem(CHAVE_CENTRO, centro ? '1' : '0'); } catch { /* sem storage */ }
  }, [centro]);

  useEffect(() => {
    if (!centro) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [centro, onClose]);

  // relógio só para esconder dados velhos e mostrar "atualizado há Ns"
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Leitura: ao abrir/mudar de filtro pede na hora e depois a cada 3 s, só enquanto este painel estiver aberto.
  const chaveCats = categorias.join('|');
  const chaveFiltros = JSON.stringify([filtros, elementos, nivelAplicado, ordem, agregar, especie?.speciesId ?? null, agregar && !especie ? '' : buscaAplicada]);
  useEffect(() => {
    if (!slotAtual || !conectado) return undefined;
    const timers = [];
    setDesde(Date.now());
    const pedir = () => {
      if (oferta) {
        pedirMercado(slotAtual, { t: 'market.item', itemId: oferta.itemId, moeda: oferta.moeda });
      } else if (tipo === 'pokemon') {
        const f = { ...filtros, elementos, tiposUnidos: true, nivelMin: nivelAplicado.min, nivelMax: nivelAplicado.max };
        if (especie || !agregar) {
          // anúncios de verdade (mesmo pedido que o sniper usa), acrescido dos filtros
          pedirMercado(slotAtual, {
            ...f, t: 'market.listar', tipo: 'pokemon', ordem, moeda: moedaPoke, criterios: [], elemento: elementos[0] || '',
            busca: especie ? especie.nome : buscaAplicada, speciesId: especie ? especie.speciesId : undefined,
          });
        } else {
          pedirMercado(slotAtual, { ...PEDIDO_ESPECIES, ...f, ordem, moeda: moedaPoke });
        }
      } else {
        const lista = categoria ? [categoria] : (categorias.length ? categorias : ['']);
        lista.forEach((cat, i) => {
          timers.push(setTimeout(() => pedirMercado(slotAtual, { t: 'market.itens', elementos: [], categoria: cat }), i * ESCALONAR_MS));
        });
      }
    };
    pedir();
    const t = setInterval(pedir, INTERVALO_MS);
    return () => { clearInterval(t); timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotAtual, conectado, tipo, categoria, oferta, moedaPoke, chaveCats, chaveFiltros]);

  const itens = useMemo(() => {
    const q = norm(busca);
    return merc.catalogo
      .filter((i) => !categoria || i.categoria === categoria)
      .map((i) => ({ ...i, lin: vivo(merc.resumo[i.id], agora) }))
      .filter((i) => (!ocultar || i.lin) && (!q || norm(i.nome).includes(q)));
  }, [merc.catalogo, merc.resumo, categoria, busca, ocultar, agora]);

  const especies = useMemo(() => {
    const e = merc.especies;
    if (!e || e.em < desde || agora - e.em > 12000) return null;
    const q = norm(busca);
    return e.lista.filter((x) => !q || norm(x.nome).includes(q));
  }, [merc.especies, desde, busca, agora]);

  // Sem resposta útil 5 s depois de pedir = o jogo não achou nada nesse filtro (ele nem sempre manda a lista vazia): avisa em vez de ficar "Carregando"
  const semResposta = agora - desde > 5000;
  const mostraAnuncios = tipo === 'pokemon' && (!!especie || !agregar);
  const anuncios = useMemo(() => {
    const d = merc.pokemons;
    if (!d || d.em < desde || agora - d.em > 12000) return null;
    const q = norm(busca);
    return d.linhas.filter((l) => {
      const c = l.campos || {};
      const nm = buscar(c, ['nome', 'pokemonNome']);
      if (especie) {                      // só a espécie aberta (também descarta respostas de outro pedido, como as do sniper)
        const sid = buscar(c, ['speciesId']);
        if (sid != null ? Number(sid) !== Number(especie.speciesId) : norm(nm) !== norm(especie.nome)) return false;
      } else if (q && !norm(nm).includes(q)) return false;
      const nv = buscar(c, ['level', 'nivel']);   // reserva caso o servidor ignore o filtro de nível
      if (nv != null) {
        if (nivelAplicado.min !== '' && Number(nv) < Number(nivelAplicado.min)) return false;
        if (nivelAplicado.max !== '' && Number(nv) > Number(nivelAplicado.max)) return false;
      }
      return true;
    });
  }, [merc.pokemons, desde, busca, especie, nivelAplicado, agora]);

  const ultimaAtualizacao = oferta ? merc.ofertas?.em : tipo === 'pokemon' ? (mostraAnuncios ? merc.pokemons?.em : merc.especies?.em)
    : Math.max(0, ...itens.map((i) => i.lin?.em || 0)) || null;

  const escolherTipo = (t) => { setTipo(t); setOferta(null); setEspecie(null); setCategoria(''); };
  const limparFiltros = () => {
    setCategoria(''); setBusca(''); setOcultar(true); setOferta(null); setEspecie(null);
    setFiltros(FILTROS_PADRAO); setElementos([]); setNivel({ min: '', max: '' }); setOrdem('recentes'); setAgregar(true);
  };
  const alternar = (k) => setFiltros((f) => ({ ...f, [k]: !f[k] }));
  const alternarTipo = (t) => setElementos((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]));

  return (
    <>
      {centro && <div className="sniper__fundo" onClick={onClose} aria-hidden="true" />}
      <div className={`sniper merc ${centro ? 'sniper--centro' : ''}`} role="dialog" aria-label="RMT: mercado da comunidade">
        <div className="sniper__bar">
          <span className="sniper__titulo">RMT · Mercado da comunidade</span>
          <div className="sniper__bar-acoes">
            <button className="sniper__btn" onClick={() => setCentro((c) => !c)} title={centro ? 'Voltar para o canto' : 'Abrir grande no meio da tela'}>
              {centro ? 'Reduzir' : 'Centralizar'}
            </button>
            <button className="sniper__fechar" onClick={onClose} aria-label="Fechar">✕</button>
          </div>
        </div>

        {accounts.length === 0 && <p className="sniper__vazio">Nenhuma conta aberta. Abra uma conta para ver o mercado.</p>}

        {accounts.length > 0 && (
          <>
            <div className="merc__topo">
              {conectado
                ? <div className="sniper__status"><span className="sniper__dot" aria-hidden="true" /><span>Lendo da {conta?.name} · atualiza a cada 3 s · {textoIdade(ultimaAtualizacao, agora)}</span></div>
                : <div className="sniper__status">Esta conta ainda não está conectada ao jogo. Faça login nela para ler o mercado.</div>}
              <input className="sniper__input merc__busca" placeholder="buscar anúncio…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
            </div>

            <div className="merc__corpo">
              <aside className="merc__lado">
                <div className="merc__sec">Tipo</div>
                <button type="button" className={`merc__filtro ${tipo === 'pokemon' ? 'is-on' : ''}`} onClick={() => escolherTipo('pokemon')}>Pokemon</button>
                <button type="button" className={`merc__filtro ${tipo === 'itens' ? 'is-on' : ''}`} onClick={() => escolherTipo('itens')}>Itens</button>

                {tipo === 'itens' && (
                  <>
                    <div className="merc__sec">Categoria</div>
                    <button type="button" className={`merc__filtro ${categoria === '' ? 'is-on' : ''}`} onClick={() => { setCategoria(''); setOferta(null); }}>Todas</button>
                    {categorias.map((c) => (
                      <button key={c} type="button" className={`merc__filtro ${categoria === c ? 'is-on' : ''}`} onClick={() => { setCategoria(c); setOferta(null); }}>{rotuloCategoria(c)}</button>
                    ))}
                    <button type="button" className={`merc__filtro merc__filtro--opc ${ocultar ? 'is-on' : ''}`} aria-pressed={ocultar} onClick={() => setOcultar((o) => !o)}>Ocultar sem estoque</button>
                  </>
                )}

                {tipo === 'pokemon' && (
                  <>
                    <div className="merc__sec">Moeda</div>
                    <div className="merc__duo">
                      <button type="button" className={`merc__filtro ${moedaPoke === 'gold' ? 'is-on' : ''}`} onClick={() => setMoedaPoke('gold')}>Ouro</button>
                      <button type="button" className={`merc__filtro ${moedaPoke === 'orb' ? 'is-on' : ''}`} onClick={() => setMoedaPoke('orb')}>Gemas</button>
                    </div>

                    <div className="merc__sec">Raridade</div>
                    {RARIDADE.map(([k, rot]) => (
                      <button key={k} type="button" className={`merc__filtro merc__filtro--opc ${filtros[k] ? 'is-on' : ''}`} aria-pressed={filtros[k]} onClick={() => alternar(k)}>{rot}</button>
                    ))}

                    <div className="merc__sec">Espécie</div>
                    <button type="button" className={`merc__filtro merc__filtro--opc ${agregar ? 'is-on' : ''}`} aria-pressed={agregar} onClick={() => { setAgregar((v) => !v); setEspecie(null); }}>Agregar espécies</button>
                    <button type="button" className={`merc__filtro merc__filtro--opc ${filtros.semOutland ? 'is-on' : ''}`} aria-pressed={filtros.semOutland} onClick={() => alternar('semOutland')}>Omitir Pokémon de Outland</button>

                    <div className="merc__sec">Tipo do Pokémon</div>
                    <div className="merc__tipos-grade">
                      {TIPOS_POKEMON.map((t) => (
                        <button key={t} type="button" className={`merc__tipo merc__tipo--${t.toLowerCase()} merc__tipo--btn ${elementos.includes(t) ? 'is-on' : ''}`} aria-pressed={elementos.includes(t)} onClick={() => alternarTipo(t)}>{t}</button>
                      ))}
                    </div>

                    <div className="merc__sec">Nível</div>
                    <div className="merc__faixa">
                      <input className="sniper__input" inputMode="numeric" placeholder="mín" value={nivel.min} onChange={(e) => setNivel((n) => ({ ...n, min: e.target.value.replace(/\D/g, '') }))} aria-label="Nível mínimo" />
                      <span>–</span>
                      <input className="sniper__input" inputMode="numeric" placeholder="máx" value={nivel.max} onChange={(e) => setNivel((n) => ({ ...n, max: e.target.value.replace(/\D/g, '') }))} aria-label="Nível máximo" />
                    </div>
                  </>
                )}

                <button type="button" className="sniper__btn merc__limpar" onClick={limparFiltros}>Limpar filtros</button>
              </aside>

              <section className="merc__conteudo">
                {oferta && (
                  <Ofertas
                    oferta={oferta}
                    dados={merc.ofertas}
                    desde={desde}
                    agora={agora}
                    onTrocarMoeda={(m) => setOferta((o) => ({ ...o, moeda: m }))}
                    onVoltar={() => setOferta(null)}
                  />
                )}

                {!oferta && tipo === 'itens' && (
                  <>
                    {merc.catalogo.length === 0 && <p className="sniper__vazio">Aguardando o jogo enviar o catálogo do mercado (ele chega ao logar). Se você já estava logado, recarregue esta conta.</p>}
                    {merc.catalogo.length > 0 && itens.length === 0 && <p className="sniper__vazio">{conectado ? 'Nenhum item com estoque nesse filtro.' : 'Sem conexão com o jogo.'}</p>}
                    <div className="merc__grade">
                      {itens.map((i) => (
                        <CardItem key={i.id} item={i} onOfertas={(it) => setOferta({ itemId: it.id, nome: it.nome, icone: it.icone, moeda: it.lin?.minGold ? 'gold' : 'orb' })} />
                      ))}
                    </div>
                  </>
                )}

                {!oferta && tipo === 'pokemon' && (
                  <>
                    <div className="merc__barra">
                      {especie
                        ? <button type="button" className="sniper__btn" onClick={() => setEspecie(null)}>← Voltar</button>
                        : <span className="merc__contagem">{mostraAnuncios ? (anuncios ? `${anuncios.length} anúncio(s)` : '') : (especies ? `${especies.length} espécie(s)` : '')}</span>}
                      {especie && <b className="merc__barra-nome">{especie.nome}</b>}
                      <label className="merc__ordem">
                        Ordenar por
                        <select className="sniper__input" value={ordem} onChange={(e) => setOrdem(e.target.value)}>
                          {ORDENS.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                        </select>
                      </label>
                    </div>

                    {mostraAnuncios ? (
                      <>
                        {anuncios === null && <p className="sniper__vazio">{!conectado ? 'Sem conexão com o jogo.' : semResposta ? 'Nenhum Pokémon encontrado com esses filtros.' : 'Carregando anúncios…'}</p>}
                        {anuncios && anuncios.length === 0 && <p className="sniper__vazio">Nenhum Pokémon encontrado com esses filtros.</p>}
                        <div className="merc__lista">
                          {(anuncios || []).map((l) => <LinhaPokemon key={l.id} l={l} moeda={moedaPoke} agora={agora} />)}
                        </div>
                      </>
                    ) : (
                      <>
                        {especies === null && <p className="sniper__vazio">{!conectado ? 'Sem conexão com o jogo.' : semResposta ? 'Nenhum Pokémon encontrado com esses filtros.' : 'Carregando Pokémon à venda…'}</p>}
                        {especies && especies.length === 0 && <p className="sniper__vazio">Nenhum Pokémon encontrado com esses filtros.</p>}
                        <div className="merc__grade">
                          {(especies || []).map((e) => <CardEspecie key={e.speciesId} e={e} moeda={moedaPoke} onAbrir={(x) => setEspecie({ speciesId: x.speciesId, nome: x.nome })} />)}
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}
