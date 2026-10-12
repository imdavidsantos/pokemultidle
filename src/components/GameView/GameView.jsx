import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { GAME_URL, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../config';
import './GameView.css';

// Eventos do webview em que o som/zoom precisam ser aplicados de novo
// (o Electron zera o zoom e a página nova perde o volume ao navegar, ex.: depois do login)
const REAPPLY_EVENTS = [
  'dom-ready',
  'did-finish-load',
  'did-navigate',
  'did-navigate-in-page',
  'did-frame-finish-load',
  'media-started-playing',
];

/**
 * Renderiza o jogo numa "tela de PC" virtual (1920 de largura, altura proporcional ao painel)
 * e a ajusta com CSS para caber no painel. Cada conta usa uma sessão própria (partition).
 */
const GameView = forwardRef(function GameView({ slot, muted, volume, zoom }, ref) {
  const boxRef = useRef(null);
  const webviewRef = useRef(null);
  const domReadyRef = useRef(false);
  const settingsRef = useRef({ muted, volume, zoom });
  const [screen, setScreen] = useState({ scale: 0.5, height: VIRTUAL_HEIGHT });

  settingsRef.current = { muted, volume, zoom };

  useImperativeHandle(ref, () => ({
    reload: () => webviewRef.current?.reload?.(),
  }));

  // Aplica mute, zoom e volume no que estiver carregado agora
  const applySettings = useCallback(() => {
    const wv = webviewRef.current;
    if (!wv || !domReadyRef.current) return;
    const { muted: m, volume: v, zoom: z } = settingsRef.current;
    try {
      if (wv.isAudioMuted() !== m) wv.setAudioMuted(m);
      if (Math.abs(wv.getZoomFactor() - z) > 0.001) wv.setZoomFactor(z);
      wv.send('pm-volume', v);
    } catch {
      /* webview ainda não está pronto */
    }
  }, []);

  // Escala da tela virtual conforme o tamanho do painel
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width && height) {
        const scale = width / VIRTUAL_WIDTH;
        setScreen({ scale, height: Math.round(height / scale) });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reaplica as configurações sempre que o jogo navegar/carregar algo novo
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return undefined;

    const onDomReady = () => {
      domReadyRef.current = true;
      applySettings();
    };
    const onStart = () => {
      domReadyRef.current = false;
    };
    const onReapply = () => {
      domReadyRef.current = true;
      applySettings();
      setTimeout(applySettings, 300); // alguns jogos zeram o zoom logo após carregar
    };

    wv.addEventListener('dom-ready', onDomReady);
    wv.addEventListener('did-start-loading', onStart);
    REAPPLY_EVENTS.filter((e) => e !== 'dom-ready').forEach((e) => wv.addEventListener(e, onReapply));

    // Garantia extra: confere de tempos em tempos
    const timer = setInterval(applySettings, 2000);

    return () => {
      clearInterval(timer);
      wv.removeEventListener('dom-ready', onDomReady);
      wv.removeEventListener('did-start-loading', onStart);
      REAPPLY_EVENTS.filter((e) => e !== 'dom-ready').forEach((e) => wv.removeEventListener(e, onReapply));
    };
  }, [applySettings]);

  // Aplica na hora quando o usuário mexe nos controles
  useEffect(() => {
    applySettings();
  }, [muted, volume, zoom, applySettings]);

  const preload = window.pokemultidle?.webviewPreload;

  return (
    <div className="gameview" ref={boxRef}>
      <div
        className="gameview__screen"
        style={{
          width: VIRTUAL_WIDTH,
          height: screen.height,
          transform: `scale(${screen.scale})`,
        }}
      >
        <webview
          ref={webviewRef}
          src={GAME_URL}
          partition={`persist:pokemultidle-slot-${slot}`}
          preload={preload}
          webpreferences="backgroundThrottling=no"
          allowpopups="true"
          className="gameview__webview"
        />
      </div>
    </div>
  );
});

export default GameView;
