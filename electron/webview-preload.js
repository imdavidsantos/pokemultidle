// Roda DENTRO de cada conta (webview), antes do jogo carregar, a cada página/navegação.
// Injeta no "mundo" da página um controle de volume para WebAudio e <audio>/<video>.
const { ipcRenderer, webFrame } = require('electron');

const PATCH = `(() => {
  if (window.__pmInstalled) return;
  window.__pmInstalled = true;
  let master = 1;

  // WebAudio: redireciona o destination para um GainNode mestre
  const Base = window.BaseAudioContext;
  let applyWebAudio = () => {};
  if (Base) {
    const desc = Object.getOwnPropertyDescriptor(Base.prototype, 'destination');
    const masters = new Set();
    const byCtx = new WeakMap();
    Object.defineProperty(Base.prototype, 'destination', {
      configurable: true,
      get() {
        let g = byCtx.get(this);
        if (!g) {
          const real = desc.get.call(this);
          g = this.createGain();
          g.gain.value = master;
          g.connect(real);
          byCtx.set(this, g);
          masters.add(g);
        }
        return g;
      },
    });
    applyWebAudio = () => masters.forEach((g) => { g.gain.value = master; });
  }

  // <audio>/<video>: volume final = volume do jogo x volume mestre
  const vol = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  const bases = new WeakMap();
  const medias = new Set();
  const clamp = (n) => Math.max(0, Math.min(1, n));
  if (vol) {
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
      configurable: true,
      get() { return bases.has(this) ? bases.get(this) : vol.get.call(this); },
      set(v) {
        bases.set(this, v);
        medias.add(this);
        vol.set.call(this, clamp(v * master));
      },
    });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      medias.add(this);
      if (!bases.has(this)) bases.set(this, vol.get.call(this));
      vol.set.call(this, clamp(bases.get(this) * master));
      return play.apply(this, arguments);
    };
  }

  window.__pmSetVolume = (v) => {
    master = clamp(Number(v));
    applyWebAudio();
    medias.forEach((el) => {
      const base = bases.has(el) ? bases.get(el) : 1;
      vol.set.call(el, clamp(base * master));
    });
    document.querySelectorAll('audio,video').forEach((el) => {
      if (!bases.has(el)) bases.set(el, vol.get.call(el));
      medias.add(el);
      vol.set.call(el, clamp(bases.get(el) * master));
    });
  };
})();`;

// Injeta direto no mundo principal da página (funciona com ou sem contextIsolation e ignora CSP)
try {
  webFrame.executeJavaScript(PATCH);
} catch (e) {
  /* ignora */
}

// O app envia o volume por IPC: webview.send('pm-volume', 0.5)
ipcRenderer.on('pm-volume', (_event, v) => {
  webFrame
    .executeJavaScript(`window.__pmSetVolume && window.__pmSetVolume(${Number(v)})`)
    .catch(() => {});
});
