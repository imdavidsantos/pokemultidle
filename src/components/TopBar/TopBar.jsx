import React from 'react';
import { APP_NAME } from '../../config';
import './TopBar.css';
import pokeball from '../../assets/pokeball.svg';
import SettingsMenu from '../SettingsMenu/SettingsMenu';

const LAYOUTS = [
  { id: '2x2', label: '2x2', title: 'Mostrar todas as telas' },
  { id: '1x1', label: '1x1', title: 'Mostrar só 2 telas' },
];

export default function TopBar({
  layout, focusedSlot, onLayout,
  huntOpen, onToggleHunt,
  valeOpen, onToggleVale,
}) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <img className="topbar__logo" src={pokeball} alt="" />
        <h1 className="topbar__title">{APP_NAME}</h1>
      </div>

      <nav className="topbar__tabs" aria-label="Layout das telas">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            className={`topbar__tab ${focusedSlot === null && layout === l.id ? 'is-active' : ''}`}
            onClick={() => onLayout(l.id)}
            title={l.title}
          >
            {l.label}
          </button>
        ))}
      </nav>
      <button
        className={`topbar__tab topbar__hunt ${huntOpen ? 'is-active' : ''}`}
        onClick={onToggleHunt}
        aria-pressed={!!huntOpen}
        title="Abrir o simulador de hunt"
      >
        /Hunt
      </button>
      <button
        className={`topbar__tab topbar__hunt ${valeOpen ? 'is-active' : ''}`}
        onClick={onToggleVale}
        aria-pressed={!!valeOpen}
        title="Avaliar se um pokémon vale a pena"
      >
        /PokeReview
      </button>
      <SettingsMenu />
    </header>
  );
}
