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
import RmtPanel from './RmtPanel/RmtPanel';

export default function PaneControls({
  account, focused, canRemove, onChange, onToggleFocus,
  onRemove, onReload, onCopySheet, onListItems, onBuyItem, onSellDepot, onOpenRmt,
}) {
  const [painel, setPainel] = useState(null);   // null | 'restock' | 'rmt'
  const alternar = (nome) => setPainel((p) => (p === nome ? null : nome));
  const helpActions = useHelpActions({
    onCopySheet,
    onToggleRestock: () => alternar('restock'),
    onSellDepot,
    onToggleRmt: () => alternar('rmt'),
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

      {painel === 'restock' && (
        <RestockPanel onList={onListItems} onBuy={onBuyItem} onClose={() => setPainel(null)} />
      )}
      {painel === 'rmt' && (
        <RmtPanel onChoose={onOpenRmt} onClose={() => setPainel(null)} />
      )}
    </div>
  );
}
