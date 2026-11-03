import { useEffect, useState } from 'react';
import { TwitchPresence } from './twitchPresence';

const DESLIGADO = { status: 'desligado', precisaLogin: false, login: null, entrados: 0, total: 0 };

/**
 * Mantém a presença nos chats da Twitch de UMA conta enquanto o componente estiver montado.
 *   const twitch = useTwitchPresence({ slot: account.slot, canais: CANAIS_OFICIAIS });
 *   // twitch = { status, precisaLogin, login, entrados, total }
 *
 * Cada conta tem o próprio login da Twitch, então use uma chamada por conta (por exemplo, no AccountPane,
 * que fica montado mesmo quando a conta está escondida).
 */
export default function useTwitchPresence({ slot, canais, ativo = true }) {
  const chave = (canais || []).join(',');
  const [estado, setEstado] = useState(DESLIGADO);

  useEffect(() => {
    if (!ativo || !chave) {
      setEstado(DESLIGADO);
      return undefined;
    }
    const presenca = new TwitchPresence({
      lerLogin: async () => {
        const r = await window.pokemultidle.readTwitchLogin(slot);
        console.log('[twitch-login] slot', slot, { ...r, token: r?.token ? '(tem)' : null });
        return r;
      },
      canais: chave.split(','),
    });
    const atualizar = () => setEstado({
      status: presenca.status,
      precisaLogin: presenca.precisaLogin,
      login: presenca.login,
      entrados: presenca.entrados,
      total: presenca.total,
    });
    presenca.onChange = atualizar;
    atualizar();
    presenca.start();
    return () => presenca.dispose();
  }, [slot, ativo, chave]);

  return estado;
}
