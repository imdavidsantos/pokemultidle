import React, { useState } from 'react';
import './PaneControls.css';
import useHelpActions from './components/useHelpActions';
import VolumeControl from './components/VolumeControl';
import RestockPanel from './RestockPanel/RestockPanel';
import useRestock from './RestockPanel/components/useRestock';
import useAutoRestock from './RestockPanel/components/useAutoRestock';
import { useSniperStatus } from '../../utils/sniper/sniperStore';
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

  // O estoque e o reabastecimento automático ficam AQUI (sempre montado, uma vez por conta), e não dentro
  // do painel: assim o automático continua rodando em segundo plano com o painel fechado.
  const restock = useRestock({ onList: onListItems, onBuy: onBuyItem });
  const jogoPronto = !!useSniperStatus(account.slot).socket;   // jogo conectado/logado
  const auto = useAutoRestock({
    itens: restock.itens,
    erro: restock.erro,
    carregar: restock.carregar,
    onBuy: onBuyItem,
    chave: account.slot,
    pronto: jogoPronto,
  });
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
      <ModeToggles phone={account.phone} onChange={onChange} />

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
        <RestockPanel restock={restock} auto={auto} onClose={() => setPainel(null)} />
      )}
      {painel === 'rmt' && (
        <RmtPanel onChoose={onOpenRmt} onClose={() => setPainel(null)} />
      )}
    </div>
  );
}
