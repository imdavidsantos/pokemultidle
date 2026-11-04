// Roda DENTRO de cada conta (webview), antes do jogo carregar, a cada página/navegação.
// 1) Leitor do WebSocket do jogo + compra automática (sniper)
// 2) Controle de volume para WebAudio e <audio>/<video>
//
// OBS.: este preload roda em sandbox, onde `require('./arquivo.js')` não funciona.
// Por isso o código do sniper fica aqui dentro, no mesmo arquivo.
const { ipcRenderer, webFrame } = require('electron');

// ====================== SNIPER (leitor do jogo + compra automática) ======================
// Este código é serializado e roda DENTRO da página do jogo (mundo principal).
// Precisa ser autossuficiente: nada de imports nem variáveis de fora.
function dentroDaPagina() {
  const WS = window.WebSocket;
  const originalSend = WS.prototype.send;
  const emitir = (tipo, dados) => window.postMessage({ source: 'PM_TAP', tipo, dados }, '*');

  // MODO DESCOBERTA: manda ao app o que o PRÓPRIO jogo envia ao servidor (e a 1ª mensagem de cada tipo
  // recebido, mais as que parecem de loja/inventário) para descobrir como a loja de itens funciona.
  // Depois de descobrir, troque para false. As mensagens do sniper (enviar) não entram aqui.
  const CAPTURA = false;
  const tiposCapturados = {};
  const capturar = (dir, bruto) => {
    if (!CAPTURA || typeof bruto !== 'string') return;
    emitir('captura', { dir, t: Date.now(), msg: bruto.slice(0, 1500) });
  };

  let cfg = { enabled: false, dryRun: true, rules: [], global: {} };
  let jogoWs = null;
  const saldo = { gold: -1, gemas: -1, diamonds: -1 };
  const doPacote = { gold: false, gemas: false, diamonds: false };   // o pacote já trouxe este saldo? (senão lê da tela)
  let desvio = 0;                       // Date.now() - servidorAgora
  const agoraSrv = () => Date.now() - desvio;
  const catalogo = {};                  // itemId -> { id, name, cat, neg } (aprendido do jogo)
  const bloqueado = {};                 // idOferta -> ignorar até (ms)
  const timers = {};                    // idOferta -> [timeouts]
  const confirmada = {};                // idOferta -> true
  const usado = {};                     // chave da regra -> unidades já disparadas
  const zerouEm = {};                   // chave da regra -> último carimbo "zerarEm" aplicado
  let ultimaCompra = null;
  const infoCompra = {};                // idOferta -> dados da compra (nome, preço, qtd) para o registro
  let ciclo = 0;
  let ultimoSaldo = '';
  let ultimoSaldoEm = 0;

  const ehOuro = (m) => ['gold', 'coins', 'coin'].includes(m);
  const ehGema = (m) => ['orb', 'orbs', 'gemas', 'gema', 'gems'].includes(m);
  const log = (status, dados) => emitir('log', Object.assign({ t: Date.now(), status }, dados));

  function enviar(obj) {
    if (!jogoWs || jogoWs.readyState !== 1) return false;
    try { originalSend.call(jogoWs, JSON.stringify(obj)); return true; } catch (_) { return false; }
  }

  // ---------- leitura do WebSocket ----------
  let totalPacotes = 0;
  const tiposVistos = {};
  let ultimoTrafego = 0;
  // diagnóstico: quantos pacotes chegam e de quais tipos (o app mostra isso no painel)
  function contar(p) {
    totalPacotes++;
    const t = typeof p.t === 'string' ? p.t : '(sem t)';
    if (!tiposVistos[t] && Object.keys(tiposVistos).length < 15) tiposVistos[t] = true;
    const agora = Date.now();
    if (agora - ultimoTrafego > 2000) {
      ultimoTrafego = agora;
      emitir('trafego', { total: totalPacotes, tipos: Object.keys(tiposVistos) });
    }
  }

  function observar(sock) {
    if (sock.__pmTap) return;
    sock.__pmTap = true;
    sock.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return;
      let p;
      try { p = JSON.parse(ev.data); } catch (_) { return; }
      if (!p || typeof p !== 'object') return;
      contar(p);
      if (CAPTURA) {
        const tp = typeof p.t === 'string' ? p.t : '(sem t)';
        const interessa = /loja|shop|store|inv|bag|compr|buy/i.test(tp) && !/^market\./.test(tp); // para loja
        // const interessa = (/twitch|b[oô]nus|bonus|canal|canais/i.test(tp)
        //   || /pokeidlebot|guaxilol1|patopapao/i.test(ev.data.slice(0, 4000))) && !/^market\./.test(tp);
        if (!tiposCapturados[tp] || interessa) { tiposCapturados[tp] = true; capturar('entrada', ev.data); }
      }
      // o socket do jogo é o que recebe welcome/estado (evita enviar para outro socket da página)
      if (p.t === 'welcome' || p.t === 'estado' || p.estado) {
        if (jogoWs !== sock) {
          jogoWs = sock;
          emitir('conectado', { url: String(sock.url || '') });
        }
      }
      try {
        processar(p);
      } catch (err) {
        emitir('erro', { etapa: 'processar', msg: String((err && err.message) || err) });
      }
    });
  }

  try {
    window.WebSocket = function (...args) {
      const sock = new WS(...args);
      observar(sock);
      return sock;
    };
    window.WebSocket.prototype = WS.prototype;
    Object.assign(window.WebSocket, { CONNECTING: WS.CONNECTING, OPEN: WS.OPEN, CLOSING: WS.CLOSING, CLOSED: WS.CLOSED });
  } catch (_) { /* segue com o hook do send */ }
  // reserva: pega sockets que já existiam antes do hook
  WS.prototype.send = function (...a) { observar(this); capturar('saida', a[0]); return originalSend.apply(this, a); };

  // ---------- saldo ----------
  const numero = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : null);
  let huntAtual;
  let saldoPendente = 0;
  function avisarSaldo(huntSlug) {
    if (huntSlug !== undefined) huntAtual = huntSlug;
    const resumo = JSON.stringify([saldo.gold, saldo.gemas, saldo.diamonds, huntAtual]);
    if (resumo === ultimoSaldo) return;
    const espera = 2000 - (Date.now() - ultimoSaldoEm);
    if (espera > 0) {                       // no máximo 1 aviso a cada 2 s; a mudança sai quando a janela fecha
      if (!saldoPendente) saldoPendente = setTimeout(() => { saldoPendente = 0; avisarSaldo(); }, espera + 10);
      return;
    }
    ultimoSaldo = resumo;
    ultimoSaldoEm = Date.now();
    emitir('saldo', { gold: saldo.gold, gemas: saldo.gemas, diamonds: saldo.diamonds, huntSlug: huntAtual });
  }
  function lerTela(id) {
    try {
      const el = document.getElementById(id);
      const limpo = el && el.textContent ? el.textContent.replace(/[^\d]/g, '') : '';
      return limpo ? parseInt(limpo, 10) : null;
    } catch (_) { return null; }
  }
  // se o pacote não trouxe o saldo, lê o número mostrado no topo do jogo
  function atualizarSaldoDaTela() {
    if (!doPacote.gold) { const v = lerTela('tr-gold'); if (v !== null) saldo.gold = v; }
    if (!doPacote.gemas) { const v = lerTela('tr-gemas'); if (v !== null) saldo.gemas = v; }
    if (!doPacote.diamonds) { const v = lerTela('tr-diamantes'); if (v !== null) saldo.diamonds = v; }
    avisarSaldo();
  }

  // ---------- catálogo de itens (nome <-> id) ----------
  let catalogoTimer = 0;
  let baseCarregada = false;
  function agendarCatalogo() {
    clearTimeout(catalogoTimer);
    catalogoTimer = setTimeout(() => {
      emitir('catalogo', { itens: Object.keys(catalogo).map((k) => catalogo[k]) });
    }, 1500);
  }
  function aprender(lista, negociavel) {
    if (!Array.isArray(lista)) return;
    let mudou = false;
    for (const it of lista) {
      const id = Number(it && it.id);
      const nome = it && (it.name || it.nome);
      if (!id || !nome || String(nome).indexOf('Item #') === 0) continue;
      const cat = String(it.category || it.categoria || '').toLowerCase();
      if (cat === 'heal' || cat === 'potion') continue;
      const ant = catalogo[id];
      if (!ant || ant.name !== String(nome) || (negociavel && !ant.neg)) {
        catalogo[id] = { id, name: String(nome), cat, neg: !!(negociavel || (ant && ant.neg)) };
        mudou = true;
      }
    }
    if (mudou) agendarCatalogo();
  }
  // lista completa de itens do jogo (mesmo arquivo que a extensão usa)
  function carregarCatalogoBase() {
    if (baseCarregada || typeof fetch !== 'function') return;
    baseCarregada = true;
    fetch('/assets/items.json').then((r) => r.json()).then((d) => aprender(d && d.items, false))
      .catch(() => { baseCarregada = false; });
  }
  function marcarNegociaveis(ids) {
    let mudou = false;
    for (const k of ids) {
      const c = catalogo[k];
      if (c && !c.neg) { c.neg = true; mudou = true; }
    }
    if (mudou) agendarCatalogo();
  }

  function processar(p) {
    if (pedidosLoja.length) tentarResponderLoja(p);
    if (p.servidorAgora) desvio = Date.now() - Number(p.servidorAgora);
    const est = p.estado || (p.payload && p.payload.estado) || (p.t === 'estado' ? p : null);
    if (est && est.servidorAgora) desvio = Date.now() - Number(est.servidorAgora);

    const fonte = est || (typeof p.gold === 'number' ? p : null);
    if (fonte) {
      const ouro = numero(fonte.gold);
      const gemas = numero(fonte.gemas) !== null ? numero(fonte.gemas)
        : numero(fonte.orbs) !== null ? numero(fonte.orbs)
        : (fonte.eu ? (numero(fonte.eu.gemas) !== null ? numero(fonte.eu.gemas) : numero(fonte.eu.orbs)) : null);
      const diamantes = numero(fonte.diamonds);
      if (ouro !== null) { saldo.gold = ouro; doPacote.gold = true; }
      if (gemas !== null) { saldo.gemas = gemas; doPacote.gemas = true; }
      if (diamantes !== null) { saldo.diamonds = diamantes; doPacote.diamonds = true; }
      avisarSaldo(fonte.huntSlug);
    }

    if (p.t === 'welcome') {
      aprender(p.itensNossos, false);
      aprender(p.mercado && p.mercado.catalogo, false);
      carregarCatalogoBase();
      setTimeout(atualizarSaldoDaTela, 1500);
    }

    if (p.t === 'batalha' && Array.isArray(p.ev)) {
      for (const e of p.ev) {
        if (e && String(e.k || e.t || '') === 'marketComprado') confirmar(e.descricao);
      }
    }

    if (p.t === 'market') tratarMercado(p);
  }

  // ---------- mercado ----------
  function tratarMercado(p) {
    const aba = String(p.aba || '');
    if (aba.startsWith('historico') || aba === 'meus' || aba === 'cancelado' || p.cancelado) return;

    if (aba === 'itens' && p.resumo) { decidirItens(p.resumo); return; }

    if (aba === 'item' && Array.isArray(p.linhas)) {
      const itemId = Number(p.itemId || 0);
      const moeda = String(p.moeda || 'gold');
      const fichaItem = (p.linhas.find((l) => l && l.ficha && l.ficha.nome) || {}).ficha;
      if (itemId && fichaItem) aprender([{ id: itemId, name: fichaItem.nome, category: fichaItem.categoria }], true);
      avaliar(p.linhas.map((l) => Object.assign({}, l, { itemId, moeda: l.moeda || moeda })));
      return;
    }

    let lista = [];
    if (Array.isArray(p.anuncios)) lista = lista.concat(p.anuncios);
    if (Array.isArray(p.itens)) lista = lista.concat(p.itens);
    if (Array.isArray(p.linhas)) lista = lista.concat(p.linhas);
    if (p.anuncio && typeof p.anuncio === 'object') lista.push(p.anuncio);
    if (lista.length) {
      emitir('varredura', { regra: 'pokemon', t: Date.now(), anuncios: lista.length });
      avaliar(lista);
    }
  }

  const restante = (regra, chave) => (Number(regra.maxQtd) > 0 ? Number(regra.maxQtd) : 1) - (usado[chave] || 0);

  // só nome EXATO (sem diferenciar maiúsculas): nome parcial poderia comprar o item errado
  function idPorNome(nome) {
    const n = String(nome || '').toLowerCase().trim();
    if (!n) return 0;
    for (const id of Object.keys(catalogo)) if (String(catalogo[id].name).toLowerCase().trim() === n) return Number(id);
    return 0;
  }
  const idDoAlvo = (r) => Number(r.alvoId) || idPorNome(r.alvoNome);

  // resposta de market.itens: só pede os vendedores se o menor preço já cabe no teto.
  // A cada varredura avisa o app o que viu (para o painel mostrar por que comprou ou não).
  function decidirItens(resumo) {
    marcarNegociaveis(Object.keys(resumo));
    if (Object.keys(resumo).some((k) => !catalogo[k])) carregarCatalogoBase();
    for (const r of cfg.rules) {
      if (!r.active || r.tipo !== 'item') continue;
      const info = { regra: String(r.id), t: Date.now() };
      const id = idDoAlvo(r);
      if (!id) { emitir('varredura', Object.assign(info, { situacao: 'sem-id' })); continue; }
      info.itemId = id;
      if (restante(r, String(r.id)) <= 0) { emitir('varredura', Object.assign(info, { situacao: 'limite' })); continue; }
      const lin = resumo[id] || resumo[String(id)];
      if (!lin) { emitir('varredura', Object.assign(info, { situacao: 'fora-do-mercado' })); continue; }
      info.minOuro = Number(lin.minGold || 0);
      info.minGemas = Number(lin.minOrb || 0);
      let moeda = null;
      if (r.maxOuro > 0 && info.minOuro > 0 && info.minOuro <= r.maxOuro) moeda = 'gold';
      else if (r.maxGemas > 0 && info.minGemas > 0 && info.minGemas <= r.maxGemas) moeda = 'orb';
      if (!(r.maxOuro > 0) && !(r.maxGemas > 0)) info.situacao = 'sem-teto';
      else if (moeda) { info.situacao = 'dentro'; enviar({ t: 'market.item', itemId: id, moeda }); }
      else info.situacao = 'acima';
      emitir('varredura', info);
    }
  }

  function casar(an, ficha, itemId, ehPokemon, moeda, preco) {
    const teto = (r) => (moeda === 'gold' ? Number(r.maxOuro || 0) : Number(r.maxGemas || 0));
    const cabe = (r) => teto(r) > 0 && preco <= teto(r);
    const nomePoke = String(an.pokemonNome || (ficha && ficha.nome) || an.nome || '');

    for (const r of cfg.rules) {
      if (!r.active) continue;
      const chave = String(r.id);
      const rest = restante(r, chave);
      if (rest <= 0) continue;

      if (r.tipo === 'item' && itemId && idDoAlvo(r) === itemId && cabe(r)) {
        return { chave, restante: rest, nome: (catalogo[itemId] && catalogo[itemId].name) || r.alvoNome || ('Item #' + itemId), desc: 'Regra: ' + (r.alvoNome || itemId) };
      }
      if (r.tipo === 'pokemon' && ehPokemon) {
        const nomeRegra = String(r.alvoNome || '').toLowerCase().trim();
        const porId = r.alvoId && ficha && Number(ficha.speciesId) === Number(r.alvoId);
        const porNome = nomeRegra && nomePoke.toLowerCase().includes(nomeRegra);
        if ((porId || porNome) && cabe(r)) return { chave, restante: rest, nome: nomePoke, desc: 'Regra: ' + (r.alvoNome || r.alvoId) };
      }
    }

    if (ehPokemon) {
      const g = cfg.global || {};
      const shiny = !!(an.shiny || an.isShiny || (ficha && (ficha.shiny || ficha.isShiny)) || /shiny/i.test(nomePoke));
      const pot = Number(an.potencia || (ficha && ficha.potencia) || 1);
      const nota = Number((ficha && ficha.nota) || an.nota || 0);
      const tentar = (chave, conf, desc) => {
        if (!conf) return null;
        const rest = restante(conf, chave);
        if (rest <= 0 || !cabe(conf)) return null;
        return { chave, restante: rest, nome: nomePoke, desc };
      };
      return (shiny && tentar('g:shiny', g.shiny, 'Shiny'))
        || (pot >= 5 && tentar('g:p5', g.p5, 'P5'))
        || (g.nota && Number(g.nota.min) > 0 && nota >= Number(g.nota.min) && tentar('g:nota', g.nota, 'Nota ' + nota))
        || null;
    }
    return null;
  }

  function avaliar(lista) {
    const agora = Date.now();
    for (const an of lista) {
      if (!an) continue;
      const id = Number(an.id);
      if (!id || confirmada[id] || timers[id] || (bloqueado[id] && bloqueado[id] > agora)) continue;
      if (an.estado && an.estado !== 'aberto') continue;
      if (an.comprador) continue;
      if (an.tipo === 'diamante' || Number(an.itemId) === 999999) continue;

      const preco = Number(an.preco) || 0;
      if (!(preco > 0)) continue;
      const moedaRaw = String(an.moeda || 'gold').toLowerCase();
      const moeda = ehOuro(moedaRaw) ? 'gold' : (ehGema(moedaRaw) ? 'orb' : null);
      if (!moeda) continue;

      const ficha = an.ficha || null;
      const itemId = Number(an.itemId || (ficha && ficha.itemId) || 0);
      const ehPokemon = !itemId && !!(an.pokemonNome || (ficha && ficha.speciesId) || an.tipo === 'pokemon');
      const alvo = casar(an, ficha, itemId, ehPokemon, moeda, preco);
      if (alvo) agendar(an, id, moedaRaw, moeda, preco, alvo);
    }
  }

  // ---------- compra ----------
  function agendar(an, id, moedaRaw, moeda, preco, alvo) {
    if (!cfg.enabled) return;
    const disponivel = moeda === 'gold' ? saldo.gold : saldo.gemas;
    if (disponivel < 0) return;                                   // saldo desconhecido: tenta no próximo ciclo
    const dados = { id, nome: alvo.nome, preco, moeda: moedaRaw, detalhe: alvo.desc };
    if (disponivel < preco) {
      bloqueado[id] = Date.now() + 20000;
      log('SALDO_INSUFICIENTE', Object.assign(dados, { detalhe: 'saldo ' + disponivel + ' < preço ' + preco }));
      return;
    }
    const qtd = Math.min(Math.max(1, Number(an.qtd) || 1), alvo.restante, Math.floor(disponivel / preco));
    if (qtd <= 0) return;
    dados.qtd = qtd;

    if (cfg.dryRun) {
      bloqueado[id] = Date.now() + 300000;
      log('SIMULADO', dados);                                     // nada é enviado
      return;
    }

    bloqueado[id] = Date.now() + 20000;
    usado[alvo.chave] = (usado[alvo.chave] || 0) + qtd;
    emitir('comprada', { chave: alvo.chave, qtd });

    // anúncio em carência: só dispara depois da liberação (relógio do servidor)
    const compravelEm = Number(an.compravelEm || an.compravelEmMs || 0);
    const espera = compravelEm - agoraSrv();
    const base = espera > 50 ? espera + 100 : 0;
    infoCompra[id] = dados;
    log('AGENDADO', Object.assign({}, dados, { detalhe: base ? 'libera em ' + Math.ceil(espera / 1000) + 's' : 'comprando agora' }));

    const agendados = [];
    if (base === 0) disparar(id, qtd, preco, moedaRaw, dados, false);   // já liberado: sai na hora
    else agendados.push(setTimeout(() => disparar(id, qtd, preco, moedaRaw, dados, false), base));
    agendados.push(setTimeout(() => disparar(id, qtd, preco, moedaRaw, dados, true), base + 600));
    agendados.push(setTimeout(() => {
      disparar(id, qtd, preco, moedaRaw, dados, true);
      delete timers[id];
    }, base + 1400));
    // veredito: passou a última tentativa + folga e o servidor não confirmou a compra
    agendados.push(setTimeout(() => {
      if (!cfg.enabled || cfg.dryRun || confirmada[id]) return;
      log('PERDIDO', Object.assign({}, dados, { detalhe: 'outra pessoa levou ou a compra não foi confirmada' }));
    }, base + 3400));
    timers[id] = agendados;
  }

  function disparar(id, qtd, preco, moedaRaw, dados, reforco) {
    if (!cfg.enabled || cfg.dryRun || confirmada[id]) return;
    ultimaCompra = id;
    const ok = enviar({ t: 'market.comprar', id, qtd, preco, moeda: moedaRaw });
    if (!ok && !reforco) log('SEM_CONEXAO', dados);   // DISPARADO/REFORCO não vão mais para o registro
  }

  function confirmar(descricao) {
    if (!ultimaCompra) return;
    const id = ultimaCompra;
    confirmada[id] = true;
    (timers[id] || []).forEach(clearTimeout);
    delete timers[id];
    log('CONFIRMADO', Object.assign({}, infoCompra[id], { id, detalhe: descricao || 'compra confirmada pelo servidor' }));
  }

  // ---------- loja: compra direta pelo socket ----------
  // Mensagem do jogo: {"t":"shop.buy","kind":"ball"|"item","id":N,"qty":N}
  const QTD_MAX_LOJA = 1000000;
  const ESPERA_RESPOSTA_LOJA = 1500;    // quanto esperar uma resposta reconhecida antes de devolver "enviado, sem confirmação"
  const pedidosLoja = [];               // pedidos esperando resposta, na ordem de envio: { reqId, timer }

  function responderLoja(pedido, dados) {
    clearTimeout(pedido.timer);
    const i = pedidosLoja.indexOf(pedido);
    if (i >= 0) pedidosLoja.splice(i, 1);
    emitir('loja', Object.assign({ reqId: pedido.reqId }, dados));
  }

  function comprarLoja(d) {
    const reqId = String(d.reqId || '');
    if (!reqId) return;
    const kind = d.kind;
    const id = Math.floor(Number(d.id));
    const qty = Math.floor(Number(d.qty));
    const falha = (erro) => emitir('loja', { reqId, ok: false, erro });
    if (kind !== 'ball' && kind !== 'item') return falha('Tipo de item inválido.');
    if (!(id > 0) || !(qty > 0) || qty > QTD_MAX_LOJA) return falha('Id ou quantidade inválidos.');

    const pedido = { reqId, timer: 0, vistos: {} };
    // sem resposta reconhecida: considera enviado (o app confere relendo o estoque) e devolve os tipos de
    // pacote que chegaram nesse intervalo, para descobrir qual é a resposta real do jogo
    pedido.timer = setTimeout(
      () => responderLoja(pedido, { ok: true, semResposta: true, vistos: Object.keys(pedido.vistos) }),
      ESPERA_RESPOSTA_LOJA,
    );
    pedidosLoja.push(pedido);
    if (!enviar({ t: 'shop.buy', kind, id, qty })) responderLoja(pedido, { ok: false, erro: 'Sem conexão com o jogo.' });
  }

  // resposta do servidor: qualquer pacote "shop.*"/"loja.*" (ou de erro) enquanto há pedido pendente.
  // Se a resposta real do jogo for outra, ajuste aqui (veja o que a CAPTURA mostra para o shop.buy).
  function tentarResponderLoja(p) {
    const t = String(p.t || '');
    for (const pd of pedidosLoja) if (Object.keys(pd.vistos).length < 12) pd.vistos[t || '(sem t)'] = true;
    const erro = p.ok === false || !!p.erro || !!p.error || /^(erro|error)$/i.test(t) || /\.(erro|error|fail)/i.test(t);
    if (!erro && !/^(shop|loja|store)\./i.test(t)) return;
    const pedido = pedidosLoja[0];
    if (!pedido) return;
    responderLoja(pedido, erro
      ? { ok: false, erro: String(p.msg || p.mensagem || p.erro || p.error || 'O jogo recusou a compra.') }
      : { ok: true, resposta: t });
  }

  // ---------- config vinda do app ----------
  function aplicarConfig(c) {
    cfg = {
      enabled: c && c.enabled === true,
      dryRun: !c || c.dryRun !== false,                           // só vira compra real com dryRun:false explícito
      rules: c && Array.isArray(c.rules) ? c.rules : [],
      global: (c && c.global) || {},
    };
    // contador de unidades: normalmente só sobe; um carimbo `zerarEm` mais novo (botão "zerar") o reinicia
    const sincronizar = (chave, item) => {
      const zerar = Number(item.zerarEm) || 0;
      if (zerar > (zerouEm[chave] || 0)) {
        zerouEm[chave] = zerar;
        usado[chave] = Number(item.comprados) || 0;
      } else {
        usado[chave] = Math.max(usado[chave] || 0, Number(item.comprados) || 0);
      }
    };
    for (const r of cfg.rules) sincronizar(String(r.id), r);
    for (const k of ['shiny', 'p5', 'nota']) if (cfg.global[k]) sincronizar('g:' + k, cfg.global[k]);
    if (!cfg.enabled) {
      Object.keys(timers).forEach((id) => { timers[id].forEach(clearTimeout); delete timers[id]; });
    }
    emitir('pronto', { enabled: cfg.enabled, dryRun: cfg.dryRun, socket: !!jogoWs });
  }

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (d && d.source === 'PM_APP' && d.tipo === 'config') aplicarConfig(d.cfg);
    if (d && d.source === 'PM_APP' && d.tipo === 'loja') comprarLoja(d);
  });

  // ---------- varredura do mercado (a cada 3 s, como a extensão) ----------
  setInterval(() => {
    atualizarSaldoDaTela();
    if (!cfg.enabled || !jogoWs) return;
    ciclo++;
    const ativas = cfg.rules.filter((r) => r.active);
    const g = cfg.global || {};
    if (ativas.some((r) => r.tipo === 'item')) enviar({ t: 'market.itens' });
    if (ativas.some((r) => r.tipo === 'pokemon') || g.shiny || g.p5 || g.nota) {
      setTimeout(() => {
        if (!cfg.enabled) return;
        const v = ciclo % 3;
        if (v === 0) enviar({ t: 'market.listar', tipo: 'pokemon', ordem: 'recentes', moeda: '', busca: '', criterios: [], elemento: '' });
        else if (v === 1) enviar({ t: 'market.listar', tipo: 'pokemon', ordem: 'menor_preco', moeda: 'gold', busca: '', criterios: [], elemento: '' });
        else enviar({ t: 'market.listar', tipo: 'pokemon', ordem: 'menor_preco', moeda: 'orb', busca: '', criterios: [], elemento: '' });
      }, 700);
    }
  }, 3000);

  emitir('instalado', {});
}

// Roda no preload do webview.
function instalarGameTap() {
  const avisarApp = (tipo, dados) => ipcRenderer.sendToHost('pm-tap', { tipo, dados: dados || {} });

  // 1) escuta primeiro: assim nada que a página mandar ao ser injetada se perde
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (d && d.source === 'PM_TAP') avisarApp(d.tipo, d.dados);   // página -> app React
  });
  ipcRenderer.on('pm-sniper-config', (_e, cfg) => {               // app React -> página
    window.postMessage({ source: 'PM_APP', tipo: 'config', cfg }, '*');
  });
  ipcRenderer.on('pm-loja', (_e, pedido) => {                     // app React -> página: compra na loja
    window.postMessage({ source: 'PM_APP', tipo: 'loja', ...pedido }, '*');
  });

  // 2) avisa o app que o preload carregou (o app responde mandando a config)
  avisarApp('preload');

  // 3) injeta o leitor no mundo principal, antes do jogo abrir o WebSocket
  try {
    Promise.resolve(webFrame.executeJavaScript(`(${dentroDaPagina.toString()})()`))
      .catch((err) => avisarApp('erro', { etapa: 'injetar', msg: String((err && err.message) || err) }));
  } catch (err) {
    avisarApp('erro', { etapa: 'injetar', msg: String((err && err.message) || err) });
  }
}

try {
  instalarGameTap();
} catch (err) {
  ipcRenderer.sendToHost('pm-tap', {
    tipo: 'erro',
    dados: { etapa: 'instalar', msg: String((err && err.message) || err) },
  });
}

// ====================== VOLUME ======================
const PATCH = `(() => {
  if (window.__pmInstalled) return;
  window.__pmInstalled = true;
  let master = 1;

  // WebAudio: redireciona o destination para um GainNode mestre
  const Base = window.BaseAudioContext;
  let applyWebAudio = () => {};
  if (Base) {
    const desc = Object.getOwnPropertyDescriptor(Base.prototype, 'destination');
    const masters = new Set();
    const byCtx = new WeakMap();
    Object.defineProperty(Base.prototype, 'destination', {
      configurable: true,
      get() {
        let g = byCtx.get(this);
        if (!g) {
          const real = desc.get.call(this);
          g = this.createGain();
          g.gain.value = master;
          g.connect(real);
          byCtx.set(this, g);
          masters.add(g);
        }
        return g;
      },
    });
    applyWebAudio = () => masters.forEach((g) => { g.gain.value = master; });
  }

  // <audio>/<video>: volume final = volume do jogo x volume mestre
  const vol = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  const bases = new WeakMap();
  const medias = new Set();
  const clamp = (n) => Math.max(0, Math.min(1, n));
  if (vol) {
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
      configurable: true,
      get() { return bases.has(this) ? bases.get(this) : vol.get.call(this); },
      set(v) {
        bases.set(this, v);
        medias.add(this);
        vol.set.call(this, clamp(v * master));
      },
    });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      medias.add(this);
      if (!bases.has(this)) bases.set(this, vol.get.call(this));
      vol.set.call(this, clamp(bases.get(this) * master));
      return play.apply(this, arguments);
    };
  }

  window.__pmSetVolume = (v) => {
    master = clamp(Number(v));
    applyWebAudio();
    medias.forEach((el) => {
      const base = bases.has(el) ? bases.get(el) : 1;
      vol.set.call(el, clamp(base * master));
    });
    document.querySelectorAll('audio,video').forEach((el) => {
      if (!bases.has(el)) bases.set(el, vol.get.call(el));
      medias.add(el);
      vol.set.call(el, clamp(bases.get(el) * master));
    });
  };
})();`;

// Injeta direto no mundo principal da página (funciona com ou sem contextIsolation e ignora CSP)
try {
  webFrame.executeJavaScript(PATCH);
} catch (e) {
  /* ignora */
}

// O app envia o volume por IPC: webview.send('pm-volume', 0.5)
ipcRenderer.on('pm-volume', (_event, v) => {
  webFrame
    .executeJavaScript(`window.__pmSetVolume && window.__pmSetVolume(${Number(v)})`)
    .catch(() => {});
});