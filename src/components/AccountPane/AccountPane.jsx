import React, { useRef, useState, useMemo } from 'react';
import GameView from '../GameView/GameView.jsx';
import PaneControls from '../PaneControls/PaneControls.jsx';
import ErrorBoundary from '../ErrorBoundary/ErrorBoundary.jsx';
import { criarOnBuy } from '../../utils/restock/lojaSocket';
import './AccountPane.css';

export default function AccountPane({ account, hidden, focused, canRemove, onChange, onToggleFocus, onRemove }) {
  const gameRef = useRef(null);
  const [reloadKey, setReloadKey] = useState(0);

  const handleRemove = () => {
    if (window.confirm(`Remover "${account.name}" desta janela? O login fica salvo caso você a adicione de novo.`)) {
      onRemove();
    }
  };

  const handleCopySheet = async () => {
    const text = await gameRef.current?.copySheet();
    if (!text) throw new Error('Ficha vazia');
    await navigator.clipboard.writeText(text);
  };

  const onBuyItem = useMemo(
    () => criarOnBuy(account.slot, (id, qtd) => gameRef.current?.buyItem(id, qtd)),
    [account.slot],
  );

  return (
    <section className={`pane ${hidden ? 'pane--hidden' : ''} ${focused ? 'pane--focused' : ''}`} aria-hidden={hidden}>
      <ErrorBoundary compacto> {/* Para não quebrar o app quando estiver algo errado */}
        <PaneControls
          account={account}
          focused={focused}
          canRemove={canRemove}
          onChange={onChange}
          onToggleFocus={onToggleFocus}
          onRemove={handleRemove}
          onReload={() => setReloadKey((k) => k + 1)}
          onCopySheet={handleCopySheet}
          onListItems={() => gameRef.current?.listItems()}
          onBuyItem={onBuyItem}
          onSellDepot={() => gameRef.current.sellDepot()}
          onOpenRmt={(tipo) => gameRef.current.openRmt(tipo)}
          onResetData={() => gameRef.current?.resetData()}
        />
      </ErrorBoundary>
      <GameView
        key={reloadKey}
        ref={gameRef}
        slot={account.slot}
        muted={account.muted}
        volume={account.volume}
        zoom={account.zoom}
        phone={!!account.phone}
        focused={focused}
        enabled={account.enabled}
      />
    </section>
  );
}
