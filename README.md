# Pokemultidle

Gerencie até **4 contas do [PokeIdle](https://pokeidle.io/app)** em uma única janela, com telas independentes e controles individuais para cada conta.

## Como baixar

1. Acesse a página de [**Releases do Pokemultidle**](https://github.com/imdavidsantos/pokemultidle/releases/latest).
2. Na seção **Assets**, baixe o arquivo correspondente ao seu sistema operacional.
3. Abra o arquivo baixado e siga as instruções para instalar ou executar o aplicativo.

**Windows:** baixe o arquivo `.exe` disponível em **Assets**. Se houver uma versão portátil, você poderá executá-la sem instalar o aplicativo.

> **Importante:** baixe os arquivos disponíveis em **Assets**. Não baixe `Source code (zip)` ou `Source code (tar.gz)`, pois esses arquivos contêm apenas o código-fonte do projeto.

## Recursos

### Telas e contas
- **Até 4 contas:** adicione novas telas pelo botão **+ Adicionar tela** e remova-as usando o botão ✕.
- **Layouts e modo foco:** alterne entre **2x2** e **1x1** no topo da janela ou amplie uma conta com o botão ⤢ (volte para exibir todas).
- **Resolução simulada:** cada tela usa uma área de referência de 1920 × 1080, redimensionada para caber no painel.
- **Controles individuais:** volume, silenciar, zoom de 50% a 200%, recarregar a página e ligar/desligar a conta.
- **Modo celular:** simula uma tela de 500 × 900 para gastar menos CPU/GPU.
- **Sessões independentes:** cada conta mantém o próprio login, salvo separadamente. Há também **Resetar dados do webview** (com confirmação).
- **Renomear contas:** clique no nome da conta para personalizá-lo.
- **Atualizações:** o menu de configurações verifica novas versões (o app também checa sozinho a cada 12 horas).

### Menu de ajuda de cada conta
- **Copiar ficha do pokémon:** copia a ficha do pokémon aberto no jogo.
- **Reabastecer itens:** compra itens da loja em quantidade escolhida, com preços unitários guardados; há também o **reabastecimento automático** por item (limite mínimo e quantidade de compra).
- **Vender todo o Depot:** abre a venda do Depot (a confirmação é a do próprio jogo).
- **Vender no market RMT:** abre o anúncio de item, pokémon ou diamante.
- **Pontos da Twitch / Pontos da Kick:** atalhos para os painéis de pontos da conta.
- Até 3 ações podem ser fixadas no menu.

### Painéis do topo
- **Hunt:** simulador de hunt em um painel.
- **Sniper:** compra automática no market por conta. Regras por alvo (item, quantidade, preço máximo, quantidade infinita), regras gerais para qualquer pokémon shiny, P5 ou com nota mínima, registro de eventos, diagnóstico, e exportação/importação das regras.
- **FarmTwitch e FarmKick:** gerenciam um miner de pontos de canal por conta (até 4 processos separados). Cada painel tem o usuário/token da conta, ordem de prioridade dos streamers, quantas lives assistir ao mesmo tempo e iniciar/parar por conta ou todas. Dá para retomar automaticamente as contas que ficaram ligadas ao abrir o app.
  - **Canais parceiros automáticos:** a lista vem do próprio jogo, entra tudo ativado por padrão e é conferida ao abrir o app e a cada 24 horas.
  - **Pontos e recompensas:** saldos por streamer (consultados com o token da conta ou lidos do miner), resumo "Farmando" e aba para resgatar recompensas ao clicar no nome do streamer.
  - **Kick:** proxy opcional por conta e Python 3.12.
  - **Twitch:** o token é opcional e serve só para ver pontos e resgatar recompensas pelo app.

## Miners (pasta `mods`)

O app **não inclui** os miners de Twitch e Kick. Quem quiser usar o FarmTwitch ou o FarmKick precisa baixar ou encontrar por conta própria um miner compatível e colocá-lo na pasta `mods`:

1. Abra a pasta de dados do app: `%APPDATA%\pokemultidle` (no Windows, `AppData\Roaming\pokemultidle`).
2. Crie a pasta `mods` dentro dela, se ainda não existir.
3. Coloque cada miner em uma subpasta.
4. Instale o **Python**.

Em desenvolvimento, a pasta `mods/` na raiz do projeto também é aceita. Dá para apontar outro local com as variáveis `TWITCH_MINER_DIR`, `KICK_MINER_DIR` ou `MODS_DIR`.
