import { useCallback, useEffect, useRef, useState } from 'react';
import { QTD_MIN, clampQtd, pausa } from '../../../../utils/restock/loja';

/**
 * Toda a lógica do painel de estoque: ler os itens do jogo, controlar a quantidade
 * digitada em cada card e comprar. O RestockPanel só desenha o que vem daqui.
 */
export default function useRestock({ onList, onBuy }) {
  const [itens, setItens] = useState(null);   // null = carregando
  const [erro, setErro] = useState('');
  const [qtds, setQtds] = useState({});       // { [id]: texto digitado }
  const [status, setStatus] = useState({});   // { [id]: 'buying' | 'ok' | 'err' }
  const [msgs, setMsgs] = useState({});       // { [id]: mensagem de erro }

  // guarda a função mais recente sem recriar o `carregar` a cada render
  const onListRef = useRef(onList);
  onListRef.current = onList;

  const carregar = useCallback(async () => {
    try {
      setErro('');
      setItens((await onListRef.current()) ?? []);
    } catch (err) {
      console.warn('Falha ao listar itens:', err);
      setErro(err?.message || 'Não foi possível ler os itens do jogo.');
      setItens([]);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const marcar = (id, valor) => {
    setStatus((s) => ({ ...s, [id]: valor }));
    if (valor === 'ok' || valor === 'err') {
      setTimeout(() => setStatus((s) => ({ ...s, [id]: undefined })), 1500);
    }
  };

  const setQtd = useCallback((id, valor) => {
    setQtds((q) => ({ ...q, [id]: valor }));
  }, []);

  // ao sair do campo, ajusta o número para dentro dos limites
  const normalizarQtd = (id) => {
    const v = qtds[id];
    if (v !== undefined && v !== '') setQtd(id, String(clampQtd(v)));
  };

  const comprar = async (item) => {
    const qtd = clampQtd(qtds[item.id] || QTD_MIN);
    setQtd(item.id, String(qtd));
    setMsgs((m) => ({ ...m, [item.id]: '' }));   // limpa o erro anterior
    marcar(item.id, 'buying');

    try {
      const feito = await onBuy(item.id, qtd);
      if (feito === false) { marcar(item.id, undefined); return; }   // cancelada na confirmação
      marcar(item.id, 'ok');
      await pausa(400);   // dá tempo do jogo atualizar o inventário
      await carregar();   // atualiza o "Tem"
    } catch (err) {
      console.warn('Falha ao comprar:', err);
      setMsgs((m) => ({ ...m, [item.id]: err?.message || 'Erro desconhecido' }));
      marcar(item.id, 'err');
      if (err?.precoAtualizado) await carregar();   // mostra o preço novo
    }
  };

  return { itens, erro, qtds, status, msgs, setQtd, normalizarQtd, comprar };
}
