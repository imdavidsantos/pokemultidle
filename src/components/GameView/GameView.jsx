import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { PHONE_HEIGHT, PHONE_WIDTH, GAME_URL, VIRTUAL_HEIGHT, VIRTUAL_WIDTH, BOOST_FPS } from '../../config';
import { copiarFicha } from '../../utils/copiarFicha';
import { REAPPLY_EVENTS } from '../../utils/zoom';
import { aplicarLimiteFps } from '../../utils/fpsLimit';
import './GameView.css';

/**
 * Renderiza o jogo numa "tela de PC" virtual (1920 de largura, altura proporcional ao painel)
 * e a ajusta com CSS para caber no painel. Cada conta usa uma sessão própria (partition).
 */
const GameView = forwardRef(function GameView({ slot, muted, volume, zoom, phone, boost, focused }, ref) {
  const boxRef = useRef(null);
  const webviewRef = useRef(null);
  const settingsRef = useRef({ muted, volume, zoom });
  const [panel, setPanel] = useState({ width: 0, height: 0 });

  settingsRef.current = { muted, volume, zoom, boost };

  useImperativeHandle(ref, () => ({
    reload: () => {
      try {
        webviewRef.current?.reload();
      } catch (err) {
        console.warn('Webview ainda não está pronto para recarregar:', err);
      }
    },
    copySheet: () => copiarFicha(webviewRef.current),
  }));

  // Aplica mute, zoom e volume no que estiver carregado agora
  const applySettings = useCallback(() => {
    const wv = webviewRef.current;
    if (!wv) return;
    const { muted: m, volume: v, zoom: z } = settingsRef.current;
    try { if (wv.isAudioMuted() !== m) wv.setAudioMuted(m); } catch { /* não pronto */ }
    try { if (Math.abs(wv.getZoomFactor() - z) > 0.001) wv.setZoomFactor(z); } catch { /* não pronto */ }
    try { wv.send('pm-volume', v); } catch { /* não pronto */ }
  }, []);

  const applyFps = useCallback(() => {
    const wv = webviewRef.current;
    if (!wv) return;
    aplicarLimiteFps(wv, settingsRef.current.boost ? BOOST_FPS : 0);
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

    if (phone) {
      const scale = Math.min(width / PHONE_WIDTH, height / PHONE_HEIGHT);
      return {
        width: PHONE_WIDTH,
        height: PHONE_HEIGHT,
        scale,
        left: (width - PHONE_WIDTH * scale) / 2,
        top: (height - PHONE_HEIGHT * scale) / 2,
      };
    }

    const scale = width / VIRTUAL_WIDTH;
    return { width: VIRTUAL_WIDTH, height: Math.round(height / scale), scale, left: 0, top: 0 };
  }, [panel, phone, focused]);

  // Reaplica as configurações sempre que o jogo navegar/carregar algo novo
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return undefined;

    const onReapply = () => {
      applySettings();
      applyFps();
      setTimeout(applySettings, 300); // alguns jogos zeram o zoom logo após carregar
    };

    REAPPLY_EVENTS.forEach((e) => wv.addEventListener(e, onReapply));
    const timer = setInterval(applySettings, 2000);

    return () => {
      clearInterval(timer);
      REAPPLY_EVENTS.forEach((e) => wv.removeEventListener(e, onReapply));
    };
  }, [applySettings]);

  // Aplica na hora quando o usuário mexe nos controles
  useEffect(() => {
    applySettings();
  }, [muted, volume, zoom, applySettings]);

  useEffect(() => {
    applyFps();
  }, [boost, applyFps]);

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
