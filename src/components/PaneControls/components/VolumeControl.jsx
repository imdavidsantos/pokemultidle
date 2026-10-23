import React, { useCallback, useRef, useState } from 'react';
import { VolumeConfigIcon } from '../../../assets/icons/VolumeConfigIcon';
import useDismiss from '../../../hooks/useDismiss';

export default function VolumeControl({ muted, volume, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const fechar = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, fechar);

  const icone = muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊';

  return (
    <div className="controls__group controls__volume" ref={ref} title="Som">
      <button
        className={`controls__btn ${muted ? 'is-on' : ''}`}
        onClick={() => onChange({ muted: !muted })}
        aria-pressed={!!muted}
        title={muted ? 'Ativar som' : 'Mutar'}
      >
        {icone}
      </button>
      <button
        className={`controls__btn ${open ? 'is-on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Configurar volume"
        title="Configurar volume"
      >
        <VolumeConfigIcon />
      </button>
      {open && (
        <div className="controls__popover" role="dialog" aria-label="Volume">
          <input
            className="controls__slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => onChange({ volume: Number(e.target.value), muted: false })}
            aria-label="Volume"
          />
          <span className="controls__vol-value">{Math.round(volume * 100)}%</span>
        </div>
      )}
    </div>
  );
}
