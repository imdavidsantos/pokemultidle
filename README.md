# Pokemultidle v3

Gerencie até 4 contas do https://pokeidle.io/app em uma única janela (Electron + React + Vite).

## Como rodar
```bash
npm install
npm run dev      # modo desenvolvimento
npm start        # build + abrir app
npm run dist     # gera instalador (.exe / .dmg / AppImage)
```

## Recursos
- Até 4 telas, com botão "+ Adicionar tela" e ✕ para remover
- Modo foco (⤢ ou abas no topo) e voltar para "Todas"
- Cada tela simula um monitor 1920×1080 (reduzido para caber no painel)
- Mute, volume e zoom (50%–200%) por tela
- Cada conta tem sessão própria (logins separados e salvos)
- Renomear conta: clique no nome

## Estrutura
```
electron/            main.js, preload.js, webview-preload.js
src/
  components/
    TopBar/          TopBar.jsx + TopBar.css
    AccountPane/     AccountPane.jsx + AccountPane.css
    PaneControls/    PaneControls.jsx + PaneControls.css
    GameView/        GameView.jsx + GameView.css
    EmptySlot/       EmptySlot.jsx + EmptySlot.css
  hooks/useAccounts.js
  styles/global.css
  config.js          resolução virtual, limites, URL
```
