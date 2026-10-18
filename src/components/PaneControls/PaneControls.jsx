import React, { useEffect, useRef, useState } from 'react';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../../config';
import './PaneControls.css';
import { VolumeConfigIcon } from '../../assets/icons/VolumeConfigIcon';
import { PhoneIcon } from '../../assets/icons/PhoneIcon';
import { BoostIcon } from '../../assets/icons/BoostIcon';

const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

export default function PaneControls({ account, focused, canRemove, onChange, onToggleFocus, onRemove, onReload, onCopySheet }) {
  const [editing, setEditing] = useState(false);
  const [volOpen, setVolOpen] = useState(false);
  const [copied, setCopied] = useState(null); // 'ok' | 'err' | null
  const volRef = useRef(null);
  const zoomed = account.zoom !== 1;

  const volumeIcon = account.muted || account.volume === 0 ? '🔇' : account.volume < 0.5 ? '🔉' : '🔊';

  // Fecha o painel de volume ao clicar fora, apertar Esc ou clicar dentro do jogo
  useEffect(() => {
    if (!volOpen) return undefined;
    const close = () => setVolOpen(false);
    const onDown = (e) => { if (volRef.current && !volRef.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', close); // clique dentro do webview tira o foco da janela
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [volOpen]);

  const handleCopy = async () => {
    try {
      await onCopySheet();
      setCopied('ok');
    } catch (err) {
      console.warn('Não foi possível copiar a ficha:', err);
      setCopied('err');
    }
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="controls">
      {editing ? (
        <input
          className="controls__name-input"
          autoFocus
          defaultValue={account.name}
          maxLength={20}
          onBlur={(e) => { onChange({ name: e.target.value.trim() || account.name }); setEditing(false); }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      ) : (
        <button className="controls__name" onClick={() => setEditing(true)} title="Clique para renomear">
          {account.name}
        </button>
      )}

      <div className="controls__group controls__volume" ref={volRef} title="Som">
        <button
          className={`controls__btn ${account.muted ? 'is-on' : ''}`}
          onClick={() => onChange({ muted: !account.muted })}
          aria-pressed={account.muted}
          title={account.muted ? 'Ativar som' : 'Mutar'}
        >
          {volumeIcon}
        </button>
        <button
          className={`controls__btn ${volOpen ? 'is-on' : ''}`}
          onClick={() => setVolOpen((o) => !o)}
          aria-expanded={volOpen}
          aria-label="Configurar volume"
          title="Configurar volume"
        >
          <VolumeConfigIcon />
        </button>
        {volOpen && (
          <div className="controls__popover" role="dialog" aria-label="Volume">
            <input
              className="controls__slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={account.volume}
              onChange={(e) => onChange({ volume: Number(e.target.value), muted: false })}
              aria-label="Volume"
            />
            <span className="controls__vol-value">{Math.round(account.volume * 100)}%</span>
          </div>
        )}
      </div>

      <div className="controls__group" title="Zoom do jogo">
        <button className="controls__btn" onClick={() => onChange({ zoom: clampZoom(account.zoom - ZOOM_STEP) })} aria-label="Diminuir zoom">−</button>
        <button
          className={`controls__zoom ${zoomed ? 'is-on' : ''}`}
          onClick={() => onChange({ zoom: 1 })}
          title="Sem zoom (100%)"
        >
          {Math.round(account.zoom * 100)}%
        </button>
        <button className="controls__btn" onClick={() => onChange({ zoom: clampZoom(account.zoom + ZOOM_STEP) })} aria-label="Aumentar zoom">+</button>
      </div>

      <button
        className={`controls__btn ${account.phone ? 'is-on' : ''}`}
        onClick={() => onChange({ phone: !account.phone })}
        aria-pressed={!!account.phone}
        title={account.phone ? 'Desativar modo celular (voltar para 1920 de largura)' : 'Ativar modo celular (500×900)'}
      >
        <PhoneIcon />
      </button>
      <button
        className={`controls__btn ${account.boost ? 'is-on' : ''}`}
        onClick={() => onChange({ boost: !account.boost })}
        aria-pressed={!!account.boost}
        title={account.boost ? 'Desativar boost (fps normal)' : 'Ativar boost (15 fps)'}
      >
        <BoostIcon />
      </button>

      <button className="controls__btn" onClick={handleCopy} title="Copiar ficha do pokémon equipado">
        {copied === 'ok' ? '✓' : copied === 'err' ? '⚠' : '📋'}
      </button>

      <span className="controls__spacer" />

      <button className="controls__btn" onClick={onReload} title="Recarregar página (F5)">⟳</button>

      <button className={`controls__btn ${focused ? 'is-on' : ''}`} onClick={onToggleFocus} title={focused ? 'Voltar para todas' : 'Focar nesta tela'}>
        {focused ? '⤡' : '⤢'}
      </button>
      <button className="controls__btn controls__btn--danger" onClick={onRemove} disabled={!canRemove} title={canRemove ? 'Remover tela' : 'Mantenha ao menos 1 tela'}>
        ✕
      </button>
    </div>
  );
}
