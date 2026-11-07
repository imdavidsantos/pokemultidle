import { useEffect } from 'react';

// Chama `fechar` ao clicar fora de `ref`, apertar Esc ou quando a janela perde o foco
// (clicar dentro de um <webview> tira o foco da janela).
// `fechar` deve ser estável (useCallback) para não reassinar os eventos a cada render.
export default function useDismiss(ref, ativo, fechar) {
  useEffect(() => {
    if (!ativo) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) fechar(); };
    const onKey = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', fechar);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', fechar);
    };
  }, [ref, ativo, fechar]);
}
