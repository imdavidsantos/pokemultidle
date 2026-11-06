import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { PHONE_HEIGHT, PHONE_WIDTH, GAME_URL, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../config';
import { registrarEvento, useSniperConfig, registrarEnviador } from '../../utils/sniper/sniperStore';
import { atualizarParceirosKick, definirAtualizadorParceirosKick } from '../../utils/kick/kickStore';
import { comprarItem, listarItens } from '../../utils/restock';
import { copiarFicha } from '../../utils/pokemon/copiarFicha';
import { REAPPLY_EVENTS } from '../../constants/zoom';
import { abrirAnuncioRmt } from '../../utils/rmt';
import { venderDepot } from '../../utils/depot';
import './GameView.css';
import { atualizarParceirosTwitch, definirAtualizadorParceirosTwitch } from '../../utils/twitch/twitchStore';

/**
 * Renderiza o jogo numa "tela de PC" virtual (1920 de largura, altura proporcional ao painel)
 * e a ajusta com CSS para caber no painel. Cada conta usa uma sessão própria (partition).
 */
const GameView = forwardRef(function GameView({ slot, muted, volume, zoom, phone, focused, enabled }, ref) {
  const boxRef = useRef(null);
  const webviewRef = useRef(null);
  const settingsRef = useRef({ muted, volume, zoom });
  const [panel, setPanel] = useState({ width: 0, height: 0 });
  const [resetKey, setResetKey] = useState(0);       // sobe a cada reset: remonta o webview do zero
  const [limpando, setLimpando] = useState(false);   // true enquanto os dados estão sendo apagados
  const ativo = enabled !== false && !limpando;      // o webview está montado?

  const sniper = useSniperConfig(slot);
  const sniperRef = useRef(sniper);
  sniperRef.current = sniper;

  settingsRef.current = { muted, volume, zoom };

  useImperativeHandle(ref, () => ({
    reload: () => {
      try {
        webviewRef.current?.reload();
      } catch (err) {
        console.warn('Webview ainda não está pronto para recarregar:', err);
      }
    },
    copySheet: () => copiarFicha(webviewRef.current),
    listItems: () => listarItens(webviewRef.current),
    buyItem: (id, qtd) => comprarItem(webviewRef.current, id, qtd),
    sellDepot: () => venderDepot(webviewRef.current),
    openRmt: (tipo) => abrirAnuncioRmt(webviewRef.current, tipo),
    // Reset: desmonta o webview, apaga os dados da sessão desta conta e monta de novo (sem login/cache)
    resetData: async () => {
      setLimpando(true);
      await new Promise((r) => setTimeout(r, 300));   // dá tempo do webview fechar
      try {
        const r = await window.pokemultidle?.limparDados(slot);
        if (r && r.ok === false) console.warn('Não consegui limpar os dados da conta:', r.erro);
      } catch (err) {
        console.warn('Não consegui limpar os dados da conta:', err);
      }
      setResetKey((k) => k + 1);
      setLimpando(false);
    },
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
      setTimeout(applySettings, 300); // alguns jogos zeram o zoom logo após carregar
    };

    REAPPLY_EVENTS.forEach((e) => wv.addEventListener(e, onReapply));
    const timer = setInterval(applySettings, 2000);

    return () => {
      clearInterval(timer);
      REAPPLY_EVENTS.forEach((e) => wv.removeEventListener(e, onReapply));
    };
  }, [applySettings, ativo, resetKey]);

  // a cada 24 h sem confirmação, o kickStore pede um estado novo recarregando uma das telas do jogo
  useEffect(() => definirAtualizadorParceirosKick(() => { try { webviewRef.current?.reload(); } catch { /* não pronto */ } }), []);
  useEffect(() => definirAtualizadorParceirosTwitch(() => { try { webviewRef.current?.reload(); } catch { /* não pronto */ } }), []);

  useEffect(() => registrarEnviador(slot, (pedido) => webviewRef.current?.send('pm-loja', pedido)), [slot]);

  // Aplica na hora quando o usuário mexe nos controles
  useEffect(() => {
    applySettings();
  }, [muted, volume, zoom, applySettings]);

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return undefined;
    const enviar = () => { try { wv.send('pm-sniper-config', sniperRef.current); } catch { /* não pronto */ } };
    const onIpc = (e) => {
      if (e.channel !== 'pm-tap') return;
      const ev = e.args[0];
      registrarEvento(slot, ev);
      if (ev?.tipo === 'kickParceiros') atualizarParceirosKick(ev.dados);          // lista de canais parceiros da Kick
      if (ev?.tipo === 'twitchParceiros') atualizarParceirosTwitch(ev.dados);  // lista de canais parceiros da Twitch
      if (ev?.tipo === 'preload' || ev?.tipo === 'instalado') enviar();        // o jogo avisou: manda a config
    };
    wv.addEventListener('ipc-message', onIpc);
    registrarEvento(slot, { tipo: 'erro', dados: { etapa: 'teste', msg: 'GameView ligado' } });
    wv.addEventListener('dom-ready', enviar);
    return () => {
      wv.removeEventListener('ipc-message', onIpc);
      registrarEvento(slot, { tipo: 'erro', dados: { etapa: 'teste', msg: 'GameView ligado' } });
      wv.removeEventListener('dom-ready', enviar);
    };
  }, [slot, ativo, resetKey]);

  // reenvia quando você muda algo no painel
  useEffect(() => {
    try { webviewRef.current?.send('pm-sniper-config', sniper); } catch { /* não pronto */ }
  }, [sniper]);

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
        {ativo && (
          <webview
            key={`${slot}-${resetKey}`}
            ref={webviewRef}
            src={GAME_URL}
            partition={`persist:pokemultidle-slot-${slot}`}
            preload={preload}
            webpreferences="backgroundThrottling=no"
            allowpopups="true"
            className="gameview__webview"
          />
        )}
      </div>

      {!ativo && (
        <div className="gameview__off">{limpando ? 'Resetando dados…' : 'Conta desligada'}</div>
      )}
    </div>
  );
});

export default GameView;
