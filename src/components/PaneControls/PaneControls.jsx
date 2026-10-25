import React, { useState } from 'react';
import './PaneControls.css';
import useHelpActions from './components/useHelpActions';
import VolumeControl from './components/VolumeControl';
import RestockPanel from './RestockPanel/RestockPanel';
import AccountName from './components/AccountName';
import ZoomControl from './components/ZoomControl';
import ModeToggles from './components/ModeToggles';
import PaneActions from './components/PaneActions';
import HelpMenu from './HelpMenu/HelpMenu';

export default function PaneControls({
  account, focused, canRemove, onChange, onToggleFocus,
  onRemove, onReload, onCopySheet, onListItems, onBuyItem, onSellDepot,
}) {
  const [restockOpen, setRestockOpen] = useState(false);
  const helpActions = useHelpActions({
    onCopySheet,
    onToggleRestock: () => setRestockOpen((o) => !o),
    onSellDepot,
  });

  return (
    <div className="controls">
      <AccountName name={account.name} onChange={onChange} />
      <VolumeControl muted={account.muted} volume={account.volume} onChange={onChange} />
      <ZoomControl zoom={account.zoom} onChange={onChange} />
      <ModeToggles phone={account.phone} boost={account.boost} onChange={onChange} />

      <span className="controls__spacer" />

      <HelpMenu actions={helpActions} />
      <PaneActions
        focused={focused}
        canRemove={canRemove}
        onReload={onReload}
        onToggleFocus={onToggleFocus}
        onRemove={onRemove}
      />

      {restockOpen && (
        <RestockPanel onList={onListItems} onBuy={onBuyItem} onClose={() => setRestockOpen(false)} />
      )}
    </div>
  );
}
