import React, { useEffect, useState } from 'react';
import TopBar from './components/TopBar/TopBar.jsx';
import AccountPane from './components/AccountPane/AccountPane.jsx';
import EmptySlot from './components/EmptySlot/EmptySlot.jsx';
import ValePanel from './components/ValePane/ValePanel.jsx';
import HuntSim from './components/HuntSim/HuntSim.jsx';
import useAccounts from './hooks/useAccounts';
import { MAX_ACCOUNTS } from './config';
import './App.css';

export default function App() {
  const { accounts, focusedSlot, layout, addAccount, removeAccount, updateAccount, setFocus, setLayout } = useAccounts();
  const [huntOpen, setHuntOpen] = useState(false);
  const [valeOpen, setValeOpen] = useState(false);

  // Foco numa tela (botão ⤢ de cada tela) continua valendo sobre o layout escolhido
  const focusing = focusedSlot !== null && accounts.some((a) => a.slot === focusedSlot);
  const count = accounts.length;

  // 2x2 = todas as telas | 1x1 = só 2 telas (as 2 primeiras)
  const layoutSlots = layout === '1x1' ? accounts.slice(0, 2) : accounts;
  const visibleSlots = focusing ? [accounts.find((a) => a.slot === focusedSlot)] : layoutSlots;
  const visibleCount = visibleSlots.length;

  const isVisible = (slot) => visibleSlots.some((a) => a.slot === slot);
  const showEmptySlot = !focusing && count < MAX_ACCOUNTS && (layout === '2x2' || visibleCount < 2);

  // O quadro "Adicionar conta" também ocupa uma célula da grade
  const totalTiles = visibleCount + (showEmptySlot ? 1 : 0);
  const cols = totalTiles === 1 ? 1 : 2;
  const rows = totalTiles <= 2 ? 1 : 2;

  useEffect(() => {
    if (!focusing) return undefined;
    const onKey = (e) => e.key === 'Escape' && setFocus(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusing, setFocus]);

  const chooseLayout = (next) => {
    setLayout(next);
    setFocus(null); // sai do foco e mostra o layout escolhido
  };

  return (
    <div className="app">
      <TopBar
        accounts={accounts}
        layout={layout}
        focusedSlot={focusing ? focusedSlot : null}
        onLayout={chooseLayout}
        onAdd={addAccount}
        huntOpen={huntOpen}
        onToggleHunt={() => setHuntOpen((o) => !o)}
        valeOpen={valeOpen}
        onToggleVale={() => { setValeOpen((v) => !v); setHuntOpen(false); }}
      />

      <main
        className="app__grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
      >
        {accounts.map((account) => (
          <AccountPane
            key={account.slot}
            account={account}
            hidden={!isVisible(account.slot)}
            focused={focusing && focusedSlot === account.slot}
            canRemove={count > 1}
            onChange={(patch) => updateAccount(account.slot, patch)}
            onToggleFocus={() => setFocus(focusing && focusedSlot === account.slot ? null : account.slot)}
            onRemove={() => removeAccount(account.slot)}
          />
        ))}
        {showEmptySlot && (
          <EmptySlot
            onAdd={addAccount}
            style={totalTiles === 3 ? { gridColumn: '1 / -1' } : undefined} // com 2 contas, ocupa a linha de baixo inteira
          />
        )}
      </main>
      {huntOpen && <HuntSim onClose={() => setHuntOpen(false)} />}
      {valeOpen && <ValePanel onClose={() => setValeOpen(false)} />}
    </div>
  );
}
