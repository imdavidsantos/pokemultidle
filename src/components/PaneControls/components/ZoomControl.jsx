import React from 'react';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../../../config';

const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

// Botão da lupa; ao abrir, mostra a config de zoom (−, %, +) num popover embaixo.
export default function ZoomControl({ zoom, open, onToggle, onChange }) {
  return (
    <div className="controls__anchor">
      <button
        className={`controls__btn ${open || zoom !== 1 ? 'is-on' : ''}`}
        onClick={onToggle}
        title={`Zoom do jogo (${Math.round(zoom * 100)}%)`}
        aria-label="Zoom"
        aria-expanded={open}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <line x1="15.5" y1="15.5" x2="21" y2="21" />
        </svg>
      </button>

      {open && (
        <div className="controls__popover">
          <div className="controls__group" title="Zoom do jogo">
            <button className="controls__btn" onClick={() => onChange({ zoom: clampZoom(zoom - ZOOM_STEP) })} aria-label="Diminuir zoom">−</button>
            <button
              className={`controls__zoom ${zoom !== 1 ? 'is-on' : ''}`}
              onClick={() => onChange({ zoom: 1 })}
              title="Sem zoom (100%)"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button className="controls__btn" onClick={() => onChange({ zoom: clampZoom(zoom + ZOOM_STEP) })} aria-label="Aumentar zoom">+</button>
          </div>
        </div>
      )}
    </div>
  );
}
