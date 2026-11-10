import React from 'react';
import { APP_NAME } from '../../config';
import './TopBar.css';
import pokeball from './pokeball.svg';
import SettingsMenu from '../SettingsMenu/SettingsMenu';

const IconeGrade = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
    <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
    <rect x="7.5" y="1.5" width="5" height="5" rx="1" />
    <rect x="1.5" y="7.5" width="5" height="5" rx="1" />
    <rect x="7.5" y="7.5" width="5" height="5" rx="1" />
  </svg>
);

const IconeColunas = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
    <rect x="1" y="1.5" width="2.1" height="11" rx="0.8" />
    <rect x="4.3" y="1.5" width="2.1" height="11" rx="0.8" />
    <rect x="7.6" y="1.5" width="2.1" height="11" rx="0.8" />
    <rect x="10.9" y="1.5" width="2.1" height="11" rx="0.8" />
  </svg>
);

const LAYOUTS = [
  { id: '2x2', Icone: IconeGrade, title: 'Grade (2x2)' },
  { id: 'colunas', Icone: IconeColunas, title: 'Colunas (todas lado a lado)' },
];

const QTD_TELAS = [2, 3, 4];

function BotaoPainel({ aberto, onClick, titulo, children, marca }) {
  return (
    <button
      type="button"
      className={`topbar__btn ${aberto ? 'is-active' : ''}`}
      onClick={onClick}
      aria-pressed={!!aberto}
      title={titulo}
    >
      {marca && <span className={`topbar__dot topbar__dot--${marca}`} aria-hidden="true" />}
      {children}
    </button>
  );
}

export default function TopBar({
  layout, focusedSlot, onLayout,
  telas, onTelas,
  huntOpen, onToggleHunt,
  sniperOpen, onToggleSniper,
  twitchOpen, onToggleTwitch,
  kickOpen, onToggleKick,
}) {
  const layoutAtual = layout === 'colunas' ? 'colunas' : '2x2';

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <img className="topbar__logo" src={pokeball} alt="" />
        <h1 className="topbar__title">{APP_NAME}</h1>
      </div>

      <div className="topbar__direita">
        <nav className="topbar__seg" aria-label="Layout das telas">
          {LAYOUTS.map(({ id, Icone, title }) => (
            <button
              key={id}
              type="button"
              className={`topbar__seg-btn topbar__seg-btn--icone ${focusedSlot === null && layoutAtual === id ? 'is-active' : ''}`}
              onClick={() => onLayout(id)}
              title={title}
              aria-label={title}
            >
              <Icone />
            </button>
          ))}
        </nav>

        <nav className="topbar__seg" aria-label="Quantidade de telas">
          {QTD_TELAS.map((n) => (
            <button
              key={n}
              type="button"
              className={`topbar__seg-btn ${focusedSlot === null && telas === n ? 'is-active' : ''}`}
              onClick={() => onTelas(n)}
              title={`Mostrar ${n} telas`}
            >
              {n}
            </button>
          ))}
        </nav>

        <span className="topbar__sep" aria-hidden="true" />

        <div className="topbar__paineis">
          <BotaoPainel aberto={huntOpen} onClick={onToggleHunt} titulo="Abrir o simulador de hunt">Hunt</BotaoPainel>
          <BotaoPainel aberto={sniperOpen} onClick={onToggleSniper} titulo="Configurar a compra automática">Sniper</BotaoPainel>
          <BotaoPainel aberto={twitchOpen} onClick={onToggleTwitch} marca="twitch" titulo="Twitch Presence: presença nas lives das contas">Twitch</BotaoPainel>
          <BotaoPainel aberto={kickOpen} onClick={onToggleKick} marca="kick" titulo="Kick Presence: presença nas lives das contas">Kick</BotaoPainel>
        </div>

        <span className="topbar__sep" aria-hidden="true" />
        <SettingsMenu />
      </div>
    </header>
  );
}