import { useSyncExternalStore } from 'react';
import { createStore } from '../../shared/createStore';
import { gravarJson as gravar, lerJson } from '../../shared/storage';

// Store compartilhado pelas plataformas de pontos de canal (Twitch, Kick).
// Guarda por conta: config, estado do miner (vindo do processo principal), saldos, recompensas e resgates.
// Cada plataforma só descreve o que é diferente (config padrão, regex do slug, credencial, argumentos do resgate...)
// em um adaptador fino (ver twitchStore.js e kickStore.js). Toda a lógica comum fica aqui, em um lugar só.
//
// As chaves do localStorage continuam as mesmas de antes (pokemultidle-<id>-...), então nada salvo se perde.

const MAX_LINHAS = 40;
const MAX_CANAIS = 100;   // por conta (com "canais que sigo" ligado podem ser muitos)
const DIA_MS = 24 * 60 * 60 * 1000;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));


// ---------- como decidir que o saldo "subiu" (usado no resumo "Farmando") ----------
// Twitch: o log do miner pode abreviar o saldo (1.08k). Saldo abreviado não serve para comparar:
// só conta como alta o ganho informado ou a diferença entre saldos exatos.
export const saldoSubiuComAproximacao = (antes, dados) => {
  const exato = antes && !antes.aprox && !dados.aprox;
  return antes
    ? (exato && Number(dados.pontos) > Number(antes.pontos)) || (dados.ganho || 0) > (antes.ganho || 0)
    : (dados.ganho || 0) > 0;
};
// Kick: o saldo é sempre exato.
export const saldoSubiuExato = (antes, dados) => (antes
  ? Number(dados.pontos) > Number(antes.pontos)
  : dados.ganho > 0);

/**
 * @param {object} op
 * @param {string}   op.id                  'twitch' | 'kick' (vira window[id] e as chaves do localStorage)
 * @param {string}   op.nome                nome para mensagens ("Twitch", "Kick")
 * @param {RegExp}   op.reSlug              formato válido do login/slug do canal
 * @param {Function} op.configPadrao        () => config padrão de uma conta
 * @param {Function} op.idDoParceiro        (oficial) => id bruto do canal vindo do jogo
 * @param {Function} op.saldoSubiu          (antes, dados) => boolean
 * @param {Function} op.temCredencial       (cfg, { temToken }) => a conta já pode iniciar o miner? (temToken: o cofre tem token desta conta)
 * @param {Function} op.montarResgate       ({ slug, rec, texto, canalId }) => argumentos do resgate depois do token
 * @param {string}   [op.msgSemTokenPontos]       se definida, aparece no painel quando falta token ao consultar saldos
 * @param {string}   [op.msgSemTokenRecompensas]  se definida, exige token para listar recompensas
 * @param {boolean}  [op.exigeCanalId]      o resgate precisa do id do canal (Twitch)
 * @param {object}   [op.estadoExtra]       campos extras do estado do miner (ex.: { ativos: [] })
 * @param {Function} [op.extraEstadoDoEvento]  (ev) => patch extra num evento 'estado'
 * @param {Function} [op.extraEstadoDoStatus]  (s) => patch extra ao ler o status inicial
 * @param {Function} [op.aoEventoExtra]     (ev, { setEstado }) => true se tratou um evento próprio da plataforma
 */
export function createStreamStore(op) {
  const {
    id, nome, reSlug, configPadrao, idDoParceiro, saldoSubiu, temCredencial, montarResgate,
    msgSemTokenPontos = null, msgSemTokenRecompensas = null, exigeCanalId = false,
    estadoExtra = {}, extraEstadoDoEvento = () => ({}), extraEstadoDoStatus = () => ({}), aoEventoExtra = () => false,
  } = op;

  const CHAVE = `pokemultidle-${id}-v1`;
  const CHAVE_AUTO = `pokemultidle-${id}-auto-v1`;           // retomar as contas ao abrir o app
  const CHAVE_LIGADAS = `pokemultidle-${id}-ligadas-v1`;     // contas que ficaram ligadas (as que serão retomadas)
  const CHAVE_SALDOS = `pokemultidle-${id}-saldos-v1`;       // último saldo conhecido por conta e canal
  const CHAVE_PARCEIROS = `pokemultidle-${id}-parceiros-v1`; // última lista de canais parceiros vista no jogo

  const SEM_ESTADO = { estado: 'parado', codigo: null, mensagem: '', linhas: [], ...estadoExtra };
  const DESKTOP = { ok: false, mensagem: 'Disponível só no app desktop.' };

  // ---------- assinatura (useSyncExternalStore) ----------
  const { subscribe: assinar, emit: avisar } = createStore();

  // ---------- config por conta ----------
  let contas = lerJson(CHAVE, {});   // slot -> config
  let estados = {};     // slot -> { estado, codigo, mensagem, linhas, ...extras }
  let checagem = null;  // resultado de window[id].checar()
  let pip = [];         // linhas da instalação de dependências
  const persistir = () => gravar(CHAVE, contas);

  const ponte = () => (typeof window !== 'undefined' ? window[id] : undefined);
  const disponivel = () => !!ponte();

  const cfgDe = (slot) => ({ ...configPadrao(), ...(contas[String(slot)] || {}) });
  const VAZIA = configPadrao();
  const cache = {};   // slot -> última config mesclada (mantém a referência estável para o React)
  const snapshotCfg = (slot) => {
    const bruta = contas[String(slot)];
    if (!bruta) return VAZIA;
    const antes = cache[slot];
    if (antes && antes.bruta === bruta) return antes.mesclada;
    const mesclada = { ...configPadrao(), ...bruta };
    cache[slot] = { bruta, mesclada };
    return mesclada;
  };

  // ---------- contas ligadas / retomar ao abrir ----------
  // Entra ao iniciar, sai ao parar (botão Parar / Parar todas). Fechar o app NÃO mexe nisso,
  // por isso elas voltam a ligar na próxima abertura.
  let ligadas = (() => {
    try {
      const v = JSON.parse(localStorage.getItem(CHAVE_LIGADAS) || '[]');
      return new Set(Array.isArray(v) ? v.map(String) : []);
    } catch { return new Set(); }
  })();
  const salvarLigadas = () => gravar(CHAVE_LIGADAS, [...ligadas]);
  const marcarLigada = (slot, ligada) => {
    const s = String(slot);
    if (ligada === ligadas.has(s)) return;
    if (ligada) ligadas.add(s); else ligadas.delete(s);
    salvarLigadas();
  };

  let autoIniciar = (() => { try { return localStorage.getItem(CHAVE_AUTO) !== '0'; } catch { return true; } })();
  const autoIniciarAtivo = () => autoIniciar;
  const useAutoIniciar = () => useSyncExternalStore(assinar, () => autoIniciar);
  function definirAutoIniciar(valor) {
    autoIniciar = !!valor;
    try { localStorage.setItem(CHAVE_AUTO, autoIniciar ? '1' : '0'); } catch { /* sem espaço */ }
    avisar();
  }

  // ---------- saldos: slot -> { canal -> { pontos, texto, aprox, ganho, online, t, tGanho } } ----------
  // `texto` é como o miner escreveu (pode vir abreviado, ex.: 61.38k, e então `aprox` é true); `ganho` é a soma
  // dos "+N" da sessão; `t` é quando foi visto pela última vez. Fica salvo para aparecer mesmo com o miner parado.
  const SEM_SALDOS = {};
  let saldos = (() => {
    try {
      const v = JSON.parse(localStorage.getItem(CHAVE_SALDOS) || '{}');
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch { return {}; }
  })();
  let tSaldos = null;
  const persistirSaldos = () => {   // agrupa as gravações: chegam várias por minuto
    if (tSaldos) return;
    tSaldos = setTimeout(() => { tSaldos = null; gravar(CHAVE_SALDOS, saldos); }, 2000);
  };
  function guardarSaldo(slot, canal, dados) {
    const s = String(slot);
    // tGanho = quando o saldo SUBIU pela última vez (o resumo "Farmando" usa isso; `t` também muda a cada consulta)
    const antes = saldos[s]?.[canal];
    const subiu = saldoSubiu(antes, dados);
    const atual = { ...(saldos[s] ?? {}), [canal]: { ...dados, tGanho: subiu ? (dados.t || Date.now()) : antes?.tGanho } };
    const nomes = Object.keys(atual);
    if (nomes.length > MAX_CANAIS) {   // mantém só os vistos mais recentemente
      nomes.sort((a, b) => (atual[b].t || 0) - (atual[a].t || 0)).slice(MAX_CANAIS).forEach((n) => { delete atual[n]; });
    }
    saldos = { ...saldos, [s]: atual };
    persistirSaldos();
  }
  const useSaldos = (slot) => useSyncExternalStore(assinar, () => saldos[String(slot)] ?? SEM_SALDOS);
  function limparSaldos(slot) {
    const resto = { ...saldos };
    delete resto[String(slot)];
    saldos = resto;
    persistirSaldos();
    avisar();
  }

  const useConfig = (slot) => useSyncExternalStore(assinar, () => snapshotCfg(slot));
  const useEstado = (slot) => useSyncExternalStore(assinar, () => estados[String(slot)] ?? SEM_ESTADO);
  const useChecagem = () => useSyncExternalStore(assinar, () => checagem);
  const usePip = () => useSyncExternalStore(assinar, () => pip);

  function salvar(slot, patch) {
    const { token: _naoPersiste, ...seguro } = patch || {};   // o token não vai para a config: ver salvarToken (cofre)
    contas = { ...contas, [String(slot)]: { ...cfgDe(slot), ...seguro } };
    persistir();
    avisar();
    agendarReinicio();   // se a lista de streamers mudou com o miner ligado, reinicia (com espera, juntando vários cliques)
  }

  // ---------- canais parceiros (vêm do jogo) ----------
  // { lista: [{ slug, nome }], atualizadoEm (última vez que a lista MUDOU), checadoEm (última vez que o jogo confirmou),
  //   novos: [nomes que entraram na última mudança] }
  const PARCEIROS_VAZIO = { lista: [], atualizadoEm: 0, checadoEm: 0, novos: [] };
  let parceiros = (() => {
    try {
      const v = JSON.parse(localStorage.getItem(CHAVE_PARCEIROS) || 'null');
      return v && Array.isArray(v.lista) ? { ...PARCEIROS_VAZIO, ...v } : PARCEIROS_VAZIO;
    } catch { return PARCEIROS_VAZIO; }
  })();
  const persistirParceiros = () => gravar(CHAVE_PARCEIROS, parceiros);
  const useParceiros = () => useSyncExternalStore(assinar, () => parceiros);
  const slugsParceiros = () => parceiros.lista.map((p) => p.slug);

  // Lista final enviada ao miner: só parceiros ativados; os da prioridade vêm primeiro (na ordem escolhida),
  // depois os demais na ordem da lista do jogo.
  function streamersDaConta(cfg) {
    const off = new Set(cfg.desativados || []);
    const ativos = slugsParceiros().filter((s) => !off.has(s));
    const prio = (cfg.prioridade || []).filter((s) => ativos.includes(s));
    return [...new Set([...prio, ...ativos])];
  }

  // Prioridade limpa: só slugs que ainda existem na lista de parceiros.
  const prioridadeDaConta = (cfg) => (cfg.prioridade || []).filter((s) => slugsParceiros().includes(s));

  function alternarStreamer(slot, slug, ativo) {
    const off = new Set(cfgDe(slot).desativados || []);
    if (ativo) off.delete(slug); else off.add(slug);
    salvar(slot, { desativados: [...off] });
  }
  const definirTodos = (slot, ativo) => salvar(slot, { desativados: ativo ? [] : slugsParceiros() });

  function alternarPrioridade(slot, slug) {
    const p = prioridadeDaConta(cfgDe(slot));
    salvar(slot, { prioridade: p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug] });
  }

  function moverPrioridade(slot, slug, delta) {
    const p = prioridadeDaConta(cfgDe(slot));
    const i = p.indexOf(slug);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= p.length) return;
    [p[i], p[j]] = [p[j], p[i]];
    salvar(slot, { prioridade: p });
  }

  // ---------- reinício quando a lista de streamers muda ----------
  const iniciadoCom = {};   // slot -> lista de streamers com que o miner foi iniciado (para saber se precisa reiniciar)
  const emUso = (slot) => ['rodando', 'iniciando', 'login'].includes((estados[String(slot)] ?? SEM_ESTADO).estado);

  const esperarParado = async (slot, ms = 15000) => {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      if (!emUso(slot)) return true;
      await esperar(400);
    }
    return false;
  };

  // O miner só lê o config ao iniciar, então para entrar um streamer novo é preciso reiniciar a conta.
  // Só reinicia contas ligadas cuja lista de streamers mudou. Não mexe no "ligadas" (continua ligada).
  let tReinicio = null;
  let reiniciando = false;
  function agendarReinicio() {
    clearTimeout(tReinicio);
    tReinicio = setTimeout(async () => {
      if (reiniciando || !ponte()) return;
      reiniciando = true;
      try {
        for (const slot of [...ligadas]) {
          const cfg = cfgDe(slot);
          if (!emUso(slot)) continue;
          if (iniciadoCom[slot] === streamersDaConta(cfg).join('\n')) continue;
          await ponte().parar(String(slot));
          if (await esperarParado(slot)) {
            await iniciar(slot);
            await esperar(2500);   // espaça uma conta da outra
          }
        }
      } finally { reiniciando = false; }
    }, 5000);   // espera: várias contas do jogo mandam a mesma lista quase junto
  }

  // Chamado quando uma tela do jogo informa a lista de parceiros (dados = { oficiais: [...] }).
  function atualizarParceiros(dados) {
    const lista = (dados?.oficiais || [])
      .map((o) => (o ? { ...o, id: String(idDoParceiro(o) || '') } : null))
      .filter((o) => o && o.ativo !== false && reSlug.test(o.id))
      .map((o) => ({ slug: o.id.toLowerCase(), nome: String(o.nome || o.id) }));
    if (!lista.length) return;
    const agora = Date.now();
    const antes = new Set(parceiros.lista.map((p) => p.slug));
    const depois = new Set(lista.map((p) => p.slug));
    const novos = lista.filter((p) => !antes.has(p.slug)).map((p) => p.nome);
    const saiu = [...antes].some((s) => !depois.has(s));
    const mudou = novos.length > 0 || saiu;
    parceiros = mudou
      ? { lista, atualizadoEm: agora, checadoEm: agora, novos: antes.size ? novos : [] }   // na 1ª vez não conta como "novos"
      : { ...parceiros, checadoEm: agora };
    persistirParceiros();
    avisar();
    agendarReinicio();   // também cobre o caso de o miner ter subido antes da lista chegar
  }

  // Opcional: o app registra aqui uma função que faz o jogo mandar o estado de novo (ex.: recarregar uma tela do jogo).
  const atualizadores = new Set();   // uma função por tela do jogo; basta chamar uma
  function definirAtualizadorParceiros(fn) {
    if (typeof fn !== 'function') return () => {};
    atualizadores.add(fn);
    return () => atualizadores.delete(fn);
  }

  let verificando = false;
  // Verifica a cada hora; se a lista não foi confirmada pelo jogo há 24 h, pede uma nova (se houver atualizador).
  function iniciarVerificacaoParceiros() {
    if (verificando) return;
    verificando = true;
    const checar = () => {
      if (Date.now() - (parceiros.checadoEm || 0) >= DIA_MS) {
        try { [...atualizadores][0]?.(); } catch { /* sem tela do jogo agora */ }
      }
      agendarReinicio();
    };
    setInterval(checar, 60 * 60 * 1000);
    setTimeout(checar, 30000);   // logo depois de abrir o app
  }

  // ---------- eventos vindos do processo principal ----------
  const setEstado = (slot, patch) => {
    const s = String(slot);
    estados = { ...estados, [s]: { ...(estados[s] ?? SEM_ESTADO), ...patch } };
  };

  function aoEvento(ev) {
    if (!ev) return;
    if (ev.tipo === 'pip') { pip = [...pip, ev.linha].slice(-MAX_LINHAS); avisar(); return; }
    if (ev.tipo === 'estado') {
      setEstado(ev.slot, { estado: ev.estado, codigo: ev.codigo ?? null, mensagem: ev.mensagem || '', ...extraEstadoDoEvento(ev) });
    } else if (ev.tipo === 'log') {
      const atual = estados[ev.slot] ?? SEM_ESTADO;
      setEstado(ev.slot, { linhas: [...atual.linhas, ev.linha].slice(-MAX_LINHAS) });
    } else if (ev.tipo === 'saldo') {
      guardarSaldo(ev.slot, ev.canal, { pontos: ev.pontos, texto: ev.texto, aprox: !!ev.aprox, ganho: ev.ganho || 0, online: ev.online, t: ev.t || Date.now() });
    } else if (!aoEventoExtra(ev, { setEstado })) return;
    avisar();
  }

  let ligado = false;
  async function iniciarPonte() {
    const t = ponte();
    if (!t || ligado) return;
    ligado = true;
    t.aoMudar(aoEvento);
    try {
      const st = await t.status();   // reaproveita o que já estava rodando (ex.: recarregou a tela)
      for (const [slot, s] of Object.entries(st || {})) {
        setEstado(slot, { estado: s.estado, codigo: s.codigo, linhas: s.linhas || [], ...extraEstadoDoStatus(s) });
        for (const [canal, v] of Object.entries(s.saldos || {})) guardarSaldo(slot, canal, v);
      }
    } catch { /* sem status */ }
    await checar();
  }

  async function checar() {
    const t = ponte();
    if (!t) return null;
    try { checagem = await t.checar(); } catch (e) { checagem = { ok: false, mensagem: e?.message || 'Falha ao checar.' }; }
    avisar();
    return checagem;
  }

  async function instalar() {
    const t = ponte();
    if (!t) return;
    pip = [];
    avisar();
    const r = await t.instalar();
    pip = [...pip, r.mensagem];
    avisar();
    await checar();
  }

  async function iniciar(slot) {
    const t = ponte();
    if (!t) return DESKTOP;
    const cfg = cfgDe(slot);
    const streamers = streamersDaConta(cfg).join('\n');   // parceiros ativados, prioridade primeiro
    if (!streamers) {
      const mensagem = parceiros.lista.length ? 'Ative pelo menos um streamer parceiro.' : 'A lista de parceiros ainda não chegou do jogo.';
      setEstado(slot, { estado: 'erro', mensagem });
      avisar();
      return { ok: false, mensagem };
    }
    const r = await t.iniciar(String(slot), { ...cfg, streamers });
    if (r.ok) { iniciadoCom[String(slot)] = streamers; marcarLigada(slot, true); }
    else { setEstado(slot, { estado: 'erro', mensagem: r.mensagem }); avisar(); }
    return r;
  }

  const parar = (slot) => { marcarLigada(slot, false); return ponte()?.parar(String(slot)); };
  const pararTodas = () => { ligadas = new Set(); salvarLigadas(); return ponte()?.pararTodas(); };

  // Inicia só as contas com credencial preenchida. intervaloMs espaça uma conta da outra.
  async function iniciarTodas(slots, intervaloMs = 0) {
    await cofrePronto;   // precisa saber quais contas têm token (Kick só inicia com token)
    let primeira = true;
    for (const slot of slots) {
      if (!temCredencial(cfgDe(slot), { temToken: temToken(slot) })) continue;
      if (!primeira && intervaloMs) await esperar(intervaloMs);
      primeira = false;
      await iniciar(slot);
    }
  }

  // Usado ao abrir o app: retoma só as contas que estavam ligadas quando o app foi fechado.
  // Liga a ponte, confere a pasta do miner e só então inicia. Se a pasta/Python/dependências não
  // estiverem prontos, não inicia nada (o painel mostra o motivo).
  async function iniciarAutomatico(slots, intervaloMs = 0) {
    const retomar = slots.filter((s) => ligadas.has(String(s)));
    if (!retomar.length) return { ok: true, mensagem: 'Nenhuma conta para retomar.' };   // nem checa o Python
    if (!ponte()) return DESKTOP;
    await iniciarPonte();
    const chk = checagem ?? (await checar());
    if (!chk?.ok) return { ok: false, mensagem: chk?.mensagem || 'Miner não está pronto.' };
    await iniciarTodas(retomar, intervaloMs);
    return { ok: true };
  }

  // ---------- saldo de pontos pela API (token) ----------
  // O processo principal consulta a plataforma com o token da conta e o resultado entra no mesmo `saldos`
  // que o painel já lê. Funciona com o miner parado. `ganho` aqui = soma das altas vistas entre uma consulta e outra.
  const SEM_STATUS_PONTOS = { carregando: false, erro: '', t: 0 };
  let statusPontos = {};   // slot -> { carregando, erro, t (última consulta ok) }
  const setStatusPontos = (slot, patch) => {
    const k = String(slot);
    statusPontos = { ...statusPontos, [k]: { ...(statusPontos[k] ?? SEM_STATUS_PONTOS), ...patch } };
    avisar();
  };
  const usePontosStatus = (slot) => useSyncExternalStore(assinar, () => statusPontos[String(slot)] ?? SEM_STATUS_PONTOS);

  const buscandoPontos = new Set();
  async function buscarPontos(slot) {
    const k = String(slot);
    const t = ponte();
    if (!t?.pontos) return DESKTOP;
    if (buscandoPontos.has(k)) return { ok: true };
    if (!temToken(k)) {
      if (msgSemTokenPontos) setStatusPontos(k, { carregando: false, erro: msgSemTokenPontos });
      return { ok: false, mensagem: 'Sem token.' };
    }
    const slugs = slugsParceiros();   // todos os parceiros (os desativados aparecem apagados no painel)
    if (!slugs.length) return { ok: false, mensagem: 'A lista de parceiros ainda não chegou do jogo.' };

    buscandoPontos.add(k);
    setStatusPontos(k, { carregando: true });
    try {
      const r = await t.pontos(k, slugs);   // o processo principal usa o token do cofre desta conta
      const agora = Date.now();
      for (const [canal, v] of Object.entries(r?.saldos || {})) {
        const antes = saldos[k]?.[canal];
        const subiu = antes && !antes.aprox && v.pontos > antes.pontos ? v.pontos - antes.pontos : 0;
        guardarSaldo(k, canal, {
          pontos: v.pontos, texto: String(v.pontos), aprox: false,
          ganho: (antes?.ganho || 0) + subiu, online: antes?.online, t: agora,
        });
      }
      const falhas = Object.keys(r?.erros || {}).length;
      const erro = r?.ok ? (falhas ? `${falhas} canal(is) sem resposta.` : '') : (r?.mensagem || `Falha ao consultar a ${nome}.`);
      setStatusPontos(k, { carregando: false, erro, ...(r?.ok ? { t: agora } : {}) });
      return r;
    } catch (e) {
      setStatusPontos(k, { carregando: false, erro: e?.message || `Falha ao consultar a ${nome}.` });
      return { ok: false, mensagem: e?.message };
    } finally { buscandoPontos.delete(k); }
  }

  // ---------- recompensas de um streamer (pedidas com o token) ----------
  const SEM_REC = { carregando: false, erro: '', lista: [], ...(exigeCanalId ? { canalId: '' } : {}), t: 0 };
  let recompensas = {};   // "slot:slug" -> { carregando, erro, lista, canalId (só onde o resgate exige), t }
  const setRec = (chave, patch) => {
    recompensas = { ...recompensas, [chave]: { ...(recompensas[chave] ?? SEM_REC), ...patch } };
    avisar();
  };
  const useRecompensas = (slot, slug) => useSyncExternalStore(assinar, () => recompensas[`${slot}:${slug}`] ?? SEM_REC);

  async function buscarRecompensas(slot, slug) {
    const chave = `${slot}:${slug}`;
    const t = ponte();
    if (!t?.recompensas) return DESKTOP;
    if (msgSemTokenRecompensas && !temToken(slot)) {
      setRec(chave, { carregando: false, erro: msgSemTokenRecompensas });
      return { ok: false, mensagem: 'Sem token.' };
    }
    if (recompensas[chave]?.carregando) return { ok: true };
    setRec(chave, { carregando: true, erro: '' });
    try {
      const r = await t.recompensas(String(slot), slug);
      setRec(chave, r?.ok
        ? { carregando: false, erro: '', lista: r.lista || [], ...(exigeCanalId ? { canalId: r.canalId || '' } : {}), t: Date.now() }
        : { carregando: false, erro: r?.mensagem || 'Falha ao buscar as recompensas.' });
      return r;
    } catch (e) {
      setRec(chave, { carregando: false, erro: e?.message || 'Falha ao buscar as recompensas.' });
      return { ok: false, mensagem: e?.message };
    }
  }

  // Resgate em andamento / último resultado, por conta (só um por vez, para não gastar pontos em dobro).
  const SEM_RESGATE = { id: '', msg: '', ok: true };
  let resgate = {};   // slot -> { id (em andamento), msg, ok }
  const setResgate = (slot, patch) => { resgate = { ...resgate, [String(slot)]: { ...(resgate[String(slot)] ?? SEM_RESGATE), ...patch } }; avisar(); };
  const useResgate = (slot) => useSyncExternalStore(assinar, () => resgate[String(slot)] ?? SEM_RESGATE);

  async function resgatar(slot, slug, rec, texto = '') {
    const t = ponte();
    if (!t?.resgatar) return DESKTOP;
    if ((resgate[String(slot)] ?? SEM_RESGATE).id) return { ok: false, mensagem: 'Já há um resgate em andamento.' };
    const canalId = recompensas[`${slot}:${slug}`]?.canalId;
    if (exigeCanalId && !canalId) {
      setResgate(slot, { id: '', msg: 'Atualize a lista de recompensas antes de resgatar.', ok: false });
      return { ok: false, mensagem: 'Sem id do canal.' };
    }
    setResgate(slot, { id: rec.id, msg: '', ok: true });
    try {
      const r = await t.resgatar(String(slot), ...montarResgate({ slug, rec, texto, canalId }));
      setResgate(slot, { id: '', msg: r?.mensagem || (r?.ok ? 'Resgatado! Chegará no jogo em 1 minuto!' : 'Falha ao resgatar.'), ok: !!r?.ok });
      if (r?.ok) { buscarPontos(slot); buscarRecompensas(slot, slug); }   // atualiza saldo e limites
      return r;
    } catch (e) {
      setResgate(slot, { id: '', msg: e?.message || 'Falha ao resgatar.', ok: false });
      return { ok: false, mensagem: e?.message };
    }
  }

  // ---------- tokens ----------
  // Os tokens ficam criptografados no processo principal (electron/tokenVault.js, safeStorage). Aqui o app só sabe
  // QUAIS contas têm token (nunca o valor): quem consulta a plataforma e inicia o miner é o processo principal,
  // que busca o token no cofre pelo número da conta.
  const cofre = () => (typeof window !== 'undefined' ? window.tokens : undefined);
  let tokens = {};                                          // slot -> true (tem token no cofre)
  let infoCofre = { pronto: false, persistente: null };     // persistente: false = sem cofre do sistema (token só em memória)
  let cofrePronto = Promise.resolve();                      // termina quando a lista de tokens foi lida e a migração acabou
  const temToken = (slot) => !!tokens[String(slot)];
  const useTemToken = (slot) => useSyncExternalStore(assinar, () => !!tokens[String(slot)]);
  const useTokenInfo = () => useSyncExternalStore(assinar, () => infoCofre);

  // Versões antigas guardavam o token em texto puro na config (localStorage). Move para o cofre e apaga a cópia antiga.
  // Sem cofre do sistema (só memória) a cópia antiga fica, para o token não se perder ao fechar o app.
  async function migrarTokensAntigos(c) {
    let mudou = false;
    for (const [slot, cfg] of Object.entries(contas)) {
      const antigo = String(cfg?.token || '').trim();
      if (!antigo) continue;
      const r = await c.salvar(id, slot, antigo);
      const apagarAntigo = (r?.ok && r.persistente) || r?.motivo === 'invalido';   // gravado criptografado, ou lixo que nunca funcionou
      if (r?.ok) tokens = { ...tokens, [slot]: true };
      if (apagarAntigo) {
        const { token: _antigo, ...resto } = cfg;
        contas = { ...contas, [slot]: resto };
        mudou = true;
      }
    }
    if (mudou) persistir();
  }

  async function iniciarCofre() {
    const c = cofre();
    if (!c) return;
    try {
      const [estado, lista] = await Promise.all([c.estado(), c.lista(id)]);
      infoCofre = { pronto: true, persistente: !!estado?.persistente };
      tokens = Object.fromEntries((lista || []).map((s) => [String(s), true]));
      await migrarTokensAntigos(c);
    } catch {
      infoCofre = { pronto: true, persistente: null };
    }
    avisar();
  }

  async function salvarToken(slot, valor) {
    const c = cofre();
    if (!c) return DESKTOP;
    const k = String(slot);
    try {
      const r = await c.salvar(id, k, String(valor ?? '').trim());
      if (r?.ok) {
        tokens = { ...tokens, [k]: true };
        if (r.persistente === false) infoCofre = { ...infoCofre, persistente: false };
        setStatusPontos(k, { erro: '' });
        buscarPontos(k);   // com o token novo, já atualiza o saldo
      }
      return r;
    } catch (e) {
      return { ok: false, mensagem: e?.message || 'Não consegui salvar o token.' };
    }
  }

  async function removerToken(slot) {
    const c = cofre();
    if (!c) return DESKTOP;
    const k = String(slot);
    try {
      const r = await c.remover(id, k);
      if (r?.ok) {
        const { [k]: _removido, ...resto } = tokens;
        tokens = resto;
        if (contas[k]?.token) {   // cópia antiga em texto puro (caso sem cofre do sistema): senão voltaria na próxima abertura
          const { token: _antigo, ...semToken } = contas[k];
          contas = { ...contas, [k]: semToken };
          persistir();
        }
        setStatusPontos(k, { erro: '', t: 0 });
      }
      return r;
    } catch (e) {
      return { ok: false, mensagem: e?.message || 'Não consegui remover o token.' };
    }
  }

  cofrePronto = iniciarCofre();

  return {
    id, nome, configPadrao, disponivel,
    temToken, useTemToken, useTokenInfo, salvarToken, removerToken,
    autoIniciarAtivo, useAutoIniciar, definirAutoIniciar,
    useSaldos, limparSaldos,
    useConfig, useEstado, useChecagem, usePip, salvar,
    useParceiros, streamersDaConta, prioridadeDaConta,
    alternarStreamer, definirTodos, alternarPrioridade, moverPrioridade,
    atualizarParceiros, definirAtualizadorParceiros, iniciarVerificacaoParceiros,
    iniciarPonte, checar, instalar, iniciar, parar, pararTodas, iniciarTodas, iniciarAutomatico,
    usePontosStatus, buscarPontos, useRecompensas, buscarRecompensas, useResgate, resgatar,
  };
}
