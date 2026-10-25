import React, { useRef, useState } from 'react';
import GameView from '../GameView/GameView.jsx';
import PaneControls from '../PaneControls/PaneControls.jsx';
import './AccountPane.css';
// import ErrorBoundary from '../ErrorBoundary/ErrorBoundary.jsx'; // lembrar de importar qnd for testar

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

  return (
    <section className={`pane ${hidden ? 'pane--hidden' : ''} ${focused ? 'pane--focused' : ''}`} aria-hidden={hidden}>
      {/* Quando estiver testando, deixar essa prop ativada para não quebrar o app qnd algo estiver errado */}
      {/* <ErrorBoundary compacto>*/}
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
        onBuyItem={(id, qtd) => gameRef.current?.buyItem(id, qtd)}
        onSellDepot={() => gameRef.current.sellDepot()}
        onOpenRmt={(tipo) => gameRef.current.openRmt(tipo)}
        />
      {/* </ErrorBoundary>*/}
      <GameView
        key={reloadKey}
        ref={gameRef}
        slot={account.slot}
        muted={account.muted}
        volume={account.volume}
        zoom={account.zoom}
        phone={!!account.phone}
        boost={!!account.boost}
        focused={focused}
      />
    </section>
  );
}
