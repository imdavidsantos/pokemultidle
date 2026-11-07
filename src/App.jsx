import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useTwitchAutoStart } from './utils/twitch/useTwitchAutoStart';
import { useKickAutoStart } from './utils/kick/useKickAutoStart';
import AccountPane from './components/AccountPane/AccountPane.jsx';
import EmptySlot from './components/EmptySlot/EmptySlot.jsx';
import TopBar from './components/TopBar/TopBar.jsx';
import useAccounts from './hooks/useAccounts';
import useNomesPokemon from './hooks/useNomesPokemon';
import { MAX_ACCOUNTS } from './config';
import './App.css';

const ValePanel = lazy(() => import('./components/ValePane/ValePanel.jsx'));
// Painéis só são carregados quando abertos (menos JS na abertura do app)
const SniperPanel = lazy(() => import('./components/SniperPanel/SniperPanel.jsx'));
const TwitchPanel = lazy(() => import('./components/TwitchPanel/TwitchPanel.jsx'));
const KickPanel = lazy(() => import('./components/KickPanel/KickPanel.jsx'));
const HuntSim = lazy(() => import('./components/HuntSim/HuntSim.jsx'));

export default function App() {
  const { accounts, focusedSlot, layout, addAccount, removeAccount, updateAccount, setFocus, setLayout } = useAccounts();
  useTwitchAutoStart(accounts);
  useKickAutoStart(accounts);
  const [huntOpen, setHuntOpen] = useState(false);
  const [sniperOpen, setSniperOpen] = useState(false);
  const [twitchOpen, setTwitchOpen] = useState(false);
  const [kickOpen, setKickOpen] = useState(false);
  const nomesPokemon = useNomesPokemon(sniperOpen);

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
        sniperOpen={sniperOpen}
        onToggleSniper={() => { setSniperOpen((v) => !v); setHuntOpen(false); setTwitchOpen(false); setKickOpen(false); }}
        twitchOpen={twitchOpen}
        onToggleTwitch={() => { setTwitchOpen((v) => !v); setHuntOpen(false); setSniperOpen(false); setKickOpen(false); }}
        kickOpen={kickOpen}
        onToggleKick={() => { setKickOpen((v) => !v); setHuntOpen(false); setSniperOpen(false); setTwitchOpen(false); }}
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
      <Suspense fallback={null}>
        {huntOpen && <HuntSim onClose={() => setHuntOpen(false)} />}
        {twitchOpen && <TwitchPanel accounts={accounts} onClose={() => setTwitchOpen(false)} />}
        {kickOpen && <KickPanel accounts={accounts} onClose={() => setKickOpen(false)} />}
        {sniperOpen && <SniperPanel accounts={accounts} nomesPokemon={nomesPokemon} onClose={() => setSniperOpen(false)} />}
      </Suspense>
    </div>
  );
}
