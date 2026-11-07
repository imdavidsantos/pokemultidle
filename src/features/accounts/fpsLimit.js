// Limita o fps do jogo interceptando requestAnimationFrame dentro da página.
// fps = 0 desliga o limite. Reaplicar é seguro (idempotente).
const script = (fps) => `
(() => {
  const w = window;
  const FPS = ${fps};
  if (!w.__pmFps) {
    if (!FPS) return; // nada a desligar e nada instalado
    const state = {
      interval: 0,
      orig: w.requestAnimationFrame,
      origCancel: w.cancelAnimationFrame,
    };
    const pending = new Map();
    let nextId = 1;
    const slotOf = (t) => Math.floor(t / state.interval);

    w.requestAnimationFrame = (cb) => {
      const id = nextId++;
      const born = state.interval ? slotOf(performance.now()) : 0;
      const run = (ts) => {
        if (!pending.has(id)) return;
        // ainda no mesmo intervalo em que foi pedido: espera o próximo quadro
        if (state.interval && slotOf(ts) <= born) {
          pending.set(id, state.orig.call(w, run));
          return;
        }
        pending.delete(id);
        cb(ts);
      };
      pending.set(id, state.orig.call(w, run));
      return id;
    };
    w.cancelAnimationFrame = (id) => {
      const real = pending.get(id);
      if (real !== undefined) {
        state.origCancel.call(w, real);
        pending.delete(id);
      }
    };
    w.__pmFps = state;
  }
  w.__pmFps.interval = FPS > 0 ? 1000 / FPS : 0;
})()
`;

export function aplicarLimiteFps(webview, fps) {
  try {
    // Antes de o webview ser anexado, o método ainda não existe
    if (typeof webview?.executeJavaScript !== 'function') return Promise.resolve();
    return webview.executeJavaScript(script(fps)).catch(() => { /* ainda não está pronto */ });
  } catch {
    return Promise.resolve();
  }
}
