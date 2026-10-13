import React, { useRef } from 'react';
import GameView from '../GameView/GameView.jsx';
import PaneControls from '../PaneControls/PaneControls.jsx';
import './AccountPane.css';

export default function AccountPane({ account, hidden, focused, canRemove, onChange, onToggleFocus, onRemove }) {
  const gameRef = useRef(null);

  const handleRemove = () => {
    if (window.confirm(`Remover "${account.name}" desta janela? O login fica salvo caso você a adicione de novo.`)) {
      onRemove();
    }
  };

  return (
    <section className={`pane ${hidden ? 'pane--hidden' : ''} ${focused ? 'pane--focused' : ''}`} aria-hidden={hidden}>
      <PaneControls
        account={account}
        focused={focused}
        canRemove={canRemove}
        onChange={onChange}
        onToggleFocus={onToggleFocus}
        onRemove={handleRemove}
        onReload={() => gameRef.current?.reload()}
      />
      <GameView
        ref={gameRef}
        slot={account.slot}
        muted={account.muted}
        volume={account.volume}
        zoom={account.zoom}
        boost={!!account.boost}
        focused={focused}
      />
    </section>
  );
}
