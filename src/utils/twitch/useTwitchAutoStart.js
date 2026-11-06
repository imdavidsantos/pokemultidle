import { useEffect } from 'react';
import { autoIniciarAtivo, iniciarAutomaticoTwitch, iniciarVerificacaoParceirosTwitch, twitchDisponivel } from './twitchStore';

const ESPERA_INICIAL_MS = 8000;   // deixa os jogos carregarem antes de subir os miners
const INTERVALO_MS = 2500;        // espaço entre uma conta e outra

let jaIniciou = false;   // uma vez por abertura da tela

// Também liga a verificação dos canais parceiros (a cada hora confere se passou 24 h sem confirmação).
// Chame uma vez em um componente que fica sempre montado (ex.: App.jsx), com a lista de contas abertas.
// Retoma o miner das contas que estavam ligadas quando o app foi fechado (se a opção estiver ligada).
export function useTwitchAutoStart(accounts) {
  const chave = accounts.map((a) => a.slot).join(',');

  useEffect(() => { if (twitchDisponivel()) iniciarVerificacaoParceirosTwitch(); }, []);

  useEffect(() => {
    if (!chave || !twitchDisponivel()) return undefined;
    const slots = chave.split(',');
    const t = setTimeout(() => {
      if (jaIniciou || !autoIniciarAtivo()) return;
      jaIniciou = true;
      iniciarAutomaticoTwitch(slots, INTERVALO_MS);
    }, ESPERA_INICIAL_MS);
    return () => clearTimeout(t);
  }, [chave]);
}
