import React from 'react';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../../../config';


const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

export default function ZoomControl({ zoom, onChange }) {
  return (
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
  );
}
