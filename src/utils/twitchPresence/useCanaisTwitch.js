import { useEffect, useState } from 'react';
import { CANAIS_OFICIAIS } from './canaisOficiais';

// Lista salva pelo app (atualizada pelo próprio jogo); CANAIS_OFICIAIS fica só como reserva.
export default function useCanaisOficiais() {
  const [canais, setCanais] = useState(CANAIS_OFICIAIS);

  useEffect(() => {
    let vivo = true;
    const aplicar = (lista) => { if (vivo && Array.isArray(lista) && lista.length) setCanais(lista); };
    window.pokemultidle.readTwitchChannels().then(aplicar).catch(() => {});
    const parar = window.pokemultidle.onTwitchChannels(aplicar);
    return () => { vivo = false; parar(); };
  }, []);

  return canais;
}
