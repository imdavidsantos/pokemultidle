import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useTwitchAutoStart } from './features/stream/adapters/twitch';
import { useKickAutoStart } from './features/stream/adapters/kick';
import AccountPane from './features/accounts/AccountPane/AccountPane.jsx';
import EmptySlot from './layout/EmptySlot/EmptySlot.jsx';
import TopBar from './layout/TopBar/TopBar.jsx';
import useAccounts from './features/accounts/useAccounts';
import useNomesPokemon from './features/vale/useNomesPokemon';
import { MAX_ACCOUNTS } from './config';
import './App.css';

const ValePanel = lazy(() => import('./features/vale/ValePanel.jsx')); // não está sendo usado por enquanto
// Painéis só são carregados quando abertos (menos JS na abertura do app)
const SniperPanel = lazy(() => import('./features/sniper/SniperPanel/SniperPanel.jsx'));
const TwitchPanel = lazy(() => import('./features/stream/panels/TwitchPanel/TwitchPanel.jsx'));
const KickPanel = lazy(() => import('./features/stream/panels/KickPanel/KickPanel.jsx'));
const HuntSim = lazy(() => import('./features/hunt/HuntSim/HuntSim.jsx'));

export default function App() {
  const { accounts, focusedSlot, layout, addAccount, removeAccount, updateAccount, setFocus, setLayout } = useAccounts();
  useTwitchAutoStart(accounts);
  useKickAutoStart(accounts);
  const [huntOpen, setHuntOpen] = useState(false);
  const [sniperOpen, setSniperOpen] = useState(false);
  const [twitchOpen, setTwitchOpen] = useState(false);
  const [kickOpen, setKickOpen] = useState(false);
  const [telas, setTelas] = useState(Math.min(4, MAX_ACCOUNTS)); // quantas telas aparecem (2 / 3 / 4)
  const nomesPokemon = useNomesPokemon(sniperOpen);

  // Foco numa tela (botão ⤢ de cada tela)
  const focusing = focusedSlot !== null && accounts.some((a) => a.slot === focusedSlot);
  const count = accounts.length;
  const colunas = layout === 'colunas'; // qualquer outro valor (ex.: '1x1' antigo) cai na grade

  // Só as N primeiras contas entram no layout
  const layoutSlots = accounts.slice(0, telas);
  const visibleSlots = focusing ? [accounts.find((a) => a.slot === focusedSlot)] : layoutSlots;
  const visibleCount = visibleSlots.length;

  const isVisible = (slot) => visibleSlots.some((a) => a.slot === slot);
  const showEmptySlot = !focusing && visibleCount < telas && count < MAX_ACCOUNTS;

  // O quadro "Adicionar conta" também ocupa uma célula da grade
  const totalTiles = visibleCount + (showEmptySlot ? 1 : 0);
  const cols = colunas ? totalTiles : (totalTiles === 1 ? 1 : 2);
  const rows = colunas ? 1 : (totalTiles <= 2 ? 1 : 2);

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

  const chooseTelas = (n) => {
    setTelas(n);
    setFocus(null);
  };

  return (
    <div className="app">
      <TopBar
        accounts={accounts}
        layout={layout}
        focusedSlot={focusing ? focusedSlot : null}
        onLayout={chooseLayout}
        telas={telas}
        onTelas={chooseTelas}
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
            style={!colunas && totalTiles === 3 ? { gridColumn: '1 / -1' } : undefined} // na grade com 2 contas, ocupa a linha de baixo inteira
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