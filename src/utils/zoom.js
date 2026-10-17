// Eventos do webview em que o som/zoom precisam ser aplicados de novo
// (o Electron zera o zoom e a página nova perde o volume ao navegar, ex.: depois do login)
export const REAPPLY_EVENTS = [
  'dom-ready',
  'did-finish-load',
  'did-navigate',
  'did-navigate-in-page',
  'did-frame-finish-load',
  'media-started-playing',
];
