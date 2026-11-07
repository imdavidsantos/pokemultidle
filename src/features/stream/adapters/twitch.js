import { createStreamAutoStart } from '../createStreamAutoStart';
import { createStreamStore, saldoSubiuComAproximacao } from '../createStreamStore';

// Adaptador da Twitch: só o que é específico dela. A lógica comum está em ../stream/createStreamStore.js.
// Config por conta (salva no localStorage) + estado ao vivo vindo do processo principal (window.twitch).
// O token (OPCIONAL: cookie auth-token do twitch.tv, só para ver pontos/resgatar recompensas; o miner não usa) NÃO fica na
// config: vai para o cofre criptografado do processo principal (ver createStreamStore: salvarToken / useTemToken).

export const configPadrao = () => ({
  username: '',          // usuário da Twitch desta conta
  prioridade: [],        // logins de canais parceiros, em ordem de prioridade (o de cima é assistido primeiro)
  desativados: [],       // logins de parceiros que o usuário desmarcou (parceiro novo entra ativado por padrão)
  seguidores: false,     // também assistir canais que a conta segue
  chat: 'ONLINE',        // presença no chat: ONLINE | ALWAYS | NEVER | OFFLINE
  drops: false,          // resgatar drops (desligado por padrão)
  moments: true,         // resgatar moments automaticamente
  streak: true,
  raid: false,
  assistidos: 2,         // 1 ou 2 streams ao mesmo tempo
});

export const twitch = createStreamStore({
  id: 'twitch',
  nome: 'Twitch',
  reSlug: /^[A-Za-z0-9_]{1,25}$/,   // login da Twitch
  configPadrao,
  idDoParceiro: (o) => o.slug || o.login,   // `slug` (mandado pelo preload) ou `login` (formato cru do jogo)
  saldoSubiu: saldoSubiuComAproximacao,     // o log do miner pode abreviar o saldo (1.08k)
  temCredencial: (cfg) => !!String(cfg.username).trim(),
  msgSemTokenRecompensas: 'Cole o token da Twitch no painel Twitch (campo opcional) para ver e resgatar recompensas.',
  exigeCanalId: true,   // o resgate da Twitch precisa do id do canal (vem junto com a lista de recompensas)
  montarResgate: ({ slug, rec, texto, canalId }) => [
    slug, rec.id, texto, canalId, rec.custo, { titulo: rec.tituloOriginal, prompt: rec.promptOriginal },
  ],
});

// Nomes antigos, mantidos para os painéis continuarem funcionando sem mudança.
export const autoIniciarAtivo = twitch.autoIniciarAtivo;
export const useTwitchAutoIniciar = twitch.useAutoIniciar;
export const definirAutoIniciar = twitch.definirAutoIniciar;
export const useTwitchSaldos = twitch.useSaldos;
export const limparSaldosTwitch = twitch.limparSaldos;
export const twitchDisponivel = twitch.disponivel;
export const useTwitchConfig = twitch.useConfig;
export const useTwitchEstado = twitch.useEstado;
export const useTwitchChecagem = twitch.useChecagem;
export const useTwitchPip = twitch.usePip;
export const salvarTwitch = twitch.salvar;
export const useTwitchParceiros = twitch.useParceiros;
export const streamersDaConta = twitch.streamersDaConta;
export const prioridadeDaConta = twitch.prioridadeDaConta;
export const alternarStreamerTwitch = twitch.alternarStreamer;
export const definirTodosTwitch = twitch.definirTodos;
export const alternarPrioridadeTwitch = twitch.alternarPrioridade;
export const moverPrioridadeTwitch = twitch.moverPrioridade;
export const atualizarParceirosTwitch = twitch.atualizarParceiros;
export const definirAtualizadorParceirosTwitch = twitch.definirAtualizadorParceiros;
export const iniciarVerificacaoParceirosTwitch = twitch.iniciarVerificacaoParceiros;
export const iniciarPonteTwitch = twitch.iniciarPonte;
export const checarTwitch = twitch.checar;
export const instalarTwitch = twitch.instalar;
export const iniciarTwitch = twitch.iniciar;
export const pararTwitch = twitch.parar;
export const pararTodasTwitch = twitch.pararTodas;
export const iniciarTodasTwitch = twitch.iniciarTodas;
export const iniciarAutomaticoTwitch = twitch.iniciarAutomatico;
export const useTwitchPontosStatus = twitch.usePontosStatus;
export const buscarPontosTwitch = twitch.buscarPontos;
export const useTwitchRecompensas = twitch.useRecompensas;
export const buscarRecompensasTwitch = twitch.buscarRecompensas;
export const useTwitchResgate = twitch.useResgate;
export const resgatarTwitch = twitch.resgatar;
export const useTwitchTemToken = twitch.useTemToken;

// Hook que retoma o miner desta plataforma ao abrir o app (usado uma vez no App.jsx).
export const useTwitchAutoStart = createStreamAutoStart(twitch);
