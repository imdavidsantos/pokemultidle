import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { BOOST_HEIGHT, BOOST_WIDTH, GAME_URL, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../config';
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
const GameView = forwardRef(function GameView({ slot, muted, volume, zoom, boost, focused }, ref) {
  const boxRef = useRef(null);
  const webviewRef = useRef(null);
  const domReadyRef = useRef(false);
  const settingsRef = useRef({ muted, volume, zoom });
  const [panel, setPanel] = useState({ width: 0, height: 0 });

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
      if (width && height) setPanel({ width, height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const screen = useMemo(() => {
    const { width, height } = panel;
    if (!width || !height) {
      return { width: VIRTUAL_WIDTH, height: VIRTUAL_HEIGHT, scale: 0.5, left: 0, top: 0 };
    }

    // Foco: sem largura definida, o jogo ocupa o painel inteiro em tamanho real
    if (focused) {
      return { width, height, scale: 1, left: 0, top: 0 };
    }

    if (boost) {
      const scale = Math.min(width / BOOST_WIDTH, height / BOOST_HEIGHT);
      return {
        width: BOOST_WIDTH,
        height: BOOST_HEIGHT,
        scale,
        left: (width - BOOST_WIDTH * scale) / 2,
        top: (height - BOOST_HEIGHT * scale) / 2,
      };
    }

    const scale = width / VIRTUAL_WIDTH;
    return { width: VIRTUAL_WIDTH, height: Math.round(height / scale), scale, left: 0, top: 0 };
  }, [panel, boost, focused]);

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
          width: screen.width,
          height: screen.height,
          left: screen.left,
          top: screen.top,
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
