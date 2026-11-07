import { useEffect } from 'react';

const ESPERA_INICIAL_MS = 8000;   // deixa os jogos carregarem antes de subir os miners
const INTERVALO_MS = 2500;        // espaço entre uma conta e outra

// Cria o hook que retoma o miner de uma plataforma (Twitch, Kick) ao abrir o app.
// `loja` é o objeto devolvido por createStreamStore.
// Também liga a verificação dos canais parceiros (a cada hora confere se passou 24 h sem confirmação).
// Use uma vez em um componente que fica sempre montado (ex.: App.jsx), com a lista de contas abertas.
// Retoma só as contas que estavam ligadas quando o app foi fechado (se a opção estiver ligada).
export function createStreamAutoStart(loja) {
  let jaIniciou = false;   // uma vez por abertura da tela

  return function useStreamAutoStart(accounts) {
    const chave = accounts.map((a) => a.slot).join(',');

    useEffect(() => { if (loja.disponivel()) loja.iniciarVerificacaoParceiros(); }, []);

    useEffect(() => {
      if (!chave || !loja.disponivel()) return undefined;
      const slots = chave.split(',');
      const t = setTimeout(() => {
        if (jaIniciou || !loja.autoIniciarAtivo()) return;
        jaIniciou = true;
        loja.iniciarAutomatico(slots, INTERVALO_MS);
      }, ESPERA_INICIAL_MS);
      return () => clearTimeout(t);
    }, [chave]);
  };
}
