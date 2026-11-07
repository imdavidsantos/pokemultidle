import { createStreamAutoStart } from '../createStreamAutoStart';
import { createStreamStore, saldoSubiuExato } from '../createStreamStore';

// Adaptador da Kick: só o que é específico dela. A lógica comum está em ../stream/createStreamStore.js.
// Config por conta (salva no localStorage, INCLUINDO o token) + estado ao vivo vindo do processo principal (window.kick).

export const configPadrao = () => ({
  token: '',             // token Bearer da Kick desta conta (DevTools > Network > authorization)
  prioridade: [],        // slugs de canais parceiros, em ordem de prioridade (o de cima é assistido primeiro)
  desativados: [],       // slugs de parceiros que o usuário desmarcou (parceiro novo entra ativado por padrão)
  assistidos: 2,         // quantas lives ao mesmo tempo (1 a 5)
  proxy: '',             // opcional: socks5://usuario:senha@host:porta
});

export const kick = createStreamStore({
  id: 'kick',
  nome: 'Kick',
  reSlug: /^[A-Za-z0-9_-]{1,50}$/,
  configPadrao,
  idDoParceiro: (o) => o.slug,
  saldoSubiu: saldoSubiuExato,   // na Kick o saldo é sempre exato
  temCredencial: (cfg) => !!String(cfg.token).trim(),   // o login da Kick é só o token
  msgSemTokenPontos: 'Cole o token da Kick desta conta.',
  montarResgate: ({ slug, rec, texto }) => [slug, rec.id, texto],
  // ativos = canais assistidos agora (vem do log do miner); some quando o miner não está rodando
  estadoExtra: { ativos: [] },
  extraEstadoDoEvento: (ev) => (ev.estado === 'rodando' ? {} : { ativos: [] }),
  extraEstadoDoStatus: (s) => ({ ativos: s.ativos || [] }),
  aoEventoExtra: (ev, { setEstado }) => {
    if (ev.tipo !== 'ativos') return false;
    setEstado(ev.slot, { ativos: Array.isArray(ev.canais) ? ev.canais : [] });
    return true;
  },
});

// Nomes antigos, mantidos para os painéis continuarem funcionando sem mudança.
export const autoIniciarAtivo = kick.autoIniciarAtivo;
export const useKickAutoIniciar = kick.useAutoIniciar;
export const definirAutoIniciar = kick.definirAutoIniciar;
export const useKickSaldos = kick.useSaldos;
export const limparSaldosKick = kick.limparSaldos;
export const kickDisponivel = kick.disponivel;
export const useKickConfig = kick.useConfig;
export const useKickEstado = kick.useEstado;
export const useKickChecagem = kick.useChecagem;
export const useKickPip = kick.usePip;
export const salvarKick = kick.salvar;
export const useKickParceiros = kick.useParceiros;
export const streamersDaConta = kick.streamersDaConta;
export const prioridadeDaConta = kick.prioridadeDaConta;
export const alternarStreamerKick = kick.alternarStreamer;
export const definirTodosKick = kick.definirTodos;
export const alternarPrioridadeKick = kick.alternarPrioridade;
export const moverPrioridadeKick = kick.moverPrioridade;
export const atualizarParceirosKick = kick.atualizarParceiros;
export const definirAtualizadorParceirosKick = kick.definirAtualizadorParceiros;
export const iniciarVerificacaoParceiros = kick.iniciarVerificacaoParceiros;
export const iniciarPonteKick = kick.iniciarPonte;
export const checarKick = kick.checar;
export const instalarKick = kick.instalar;
export const iniciarKick = kick.iniciar;
export const pararKick = kick.parar;
export const pararTodasKick = kick.pararTodas;
export const iniciarTodasKick = kick.iniciarTodas;
export const iniciarAutomaticoKick = kick.iniciarAutomatico;
export const useKickPontosStatus = kick.usePontosStatus;
export const buscarPontosKick = kick.buscarPontos;
export const useKickRecompensas = kick.useRecompensas;
export const buscarRecompensasKick = kick.buscarRecompensas;
export const useKickResgate = kick.useResgate;
export const resgatarKick = kick.resgatar;

// Hook que retoma o miner desta plataforma ao abrir o app (usado uma vez no App.jsx).
export const useKickAutoStart = createStreamAutoStart(kick);
