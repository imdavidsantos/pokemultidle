// Presença nos chats da Twitch sem abrir página nenhuma: uma conexão com o servidor de chat da Twitch
// (o mesmo que o chat do site usa por baixo), entrando em todos os canais informados com o login da
// Twitch salvo na conta. Página e vídeo não fazem diferença, então quase não gasta memória nem CPU.
//
// Roda no renderer (usa o WebSocket do navegador). O token vem do processo
// principal por `lerLogin` (veja twitchLogin.main.js); ele nunca é escrito em log.

const SERVIDOR = 'wss://irc-ws.chat.twitch.tv:443';

class LoginExpirado extends Error {
  constructor() {
    super('login da Twitch expirado');
    this.name = 'LoginExpirado';
  }
}

const cancelado = () => Object.assign(new Error('cancelado'), { name: 'AbortError' });

// setTimeout que pode ser cancelado (equivale ao Task.Delay(..., stop) do C#)
function dormir(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(cancelado()); return; }
    const aoCancelar = () => { clearTimeout(t); reject(cancelado()); };
    const t = setTimeout(() => { signal.removeEventListener('abort', aoCancelar); resolve(); }, ms);
    signal.addEventListener('abort', aoCancelar, { once: true });
  });
}

export class TwitchPresence {
  #opc;
  #ctl = new AbortController();
  #rodando = false;
  #entrou = new Set();

  /**
   * @param {object}   o
   * @param {() => Promise<{token: string|null, login: string|null, expirado?: boolean}>} o.lerLogin
   *        devolve o login já validado (token + usuário); `expirado: true` se a Twitch recusou o token
   * @param {string[]} o.canais  canais (com ou sem #)
   * Os demais campos só existem para teste; os padrões são os do código original.
   */
  constructor({
    lerLogin,
    canais,
    criarSocket = (url) => new WebSocket(url),
    lote = 15,                         // a Twitch aceita 20 entradas em canais a cada 10 s
    intervaloLotes = 11000,
    silencio = 7 * 60 * 1000,          // a Twitch manda PING a cada ~5 min; tanto tempo mudo = conexão morta
    espera = 5000,
    esperaMax = 120000,
    esperaLogin = 15000,
    esperaExpirado = 60000,
  }) {
    this.lerLogin = lerLogin;
    this.canais = [...new Set(
      (canais || []).map((c) => String(c).trim().replace(/^#+/, '').toLowerCase()).filter((c) => c.length > 0),
    )];
    this.#opc = { criarSocket, lote, intervaloLotes, silencio, espera, esperaMax, esperaLogin, esperaExpirado };

    this.status = 'conectando…';
    this.precisaLogin = false;
    this.login = null;
    /** Chamado quando o status muda. */
    this.onChange = null;
  }

  get total() { return this.canais.length; }
  get entrados() { return this.#entrou.size; }

  start() {
    if (this.#rodando) return;
    this.#rodando = true;
    this.#executar();
  }

  dispose() {
    this.#ctl.abort();
    this.onChange = null;
  }

  #setStatus(status, precisaLogin = false) {
    this.status = status;
    this.precisaLogin = precisaLogin;
    if (this.onChange) this.onChange();
  }

  async #executar() {
    const { signal } = this.#ctl;
    let espera = this.#opc.espera;
    while (!signal.aborted) {
      try {
        const { token, login: lido, expirado } = (await this.lerLogin()) || {};
        if (expirado) throw new LoginExpirado();
        // Anônimo (justinfan) só no autoteste: não conta como presença no chat.
        const anonimo = !token && String(lido || '').startsWith('justinfan');
        if (!anonimo && (!token || !lido)) {
          this.#setStatus('entre na Twitch (botão Entrar)', true);
          await dormir(this.#opc.esperaLogin, signal);
          continue;
        }
        this.login = lido;
        await this.#sessao(token, lido);
        espera = this.#opc.espera;
        this.#setStatus('caiu, voltando…');
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof LoginExpirado) {
          this.#setStatus('o login da Twitch expirou: clique em Entrar', true);
          espera = this.#opc.esperaExpirado;
        } else {
          this.#setStatus('sem conexão com a Twitch, tentando de novo…');
        }
      }

      this.#entrou.clear();
      try { await dormir(espera, signal); } catch { return; }
      espera = Math.min(this.#opc.esperaMax, espera * 2);
    }
  }

  /** Uma conexão: entra nos canais e fica respondendo o PING até cair. */
  async #sessao(token, login) {
    const { signal } = this.#ctl;
    const socket = this.#opc.criarSocket(SERVIDOR);
    const enviar = (linha) => socket.send(`${linha}\r\n`);
    try {
      await new Promise((resolve, reject) => {
        let pendente = '';
        let aberto = false;
        let timerSilencio = 0;
        const terminar = (erro) => { clearTimeout(timerSilencio); if (erro) reject(erro); else resolve(); };
        const armarSilencio = () => {
          clearTimeout(timerSilencio);
          timerSilencio = setTimeout(() => terminar(), this.#opc.silencio);   // mudo demais: reconecta
        };

        socket.addEventListener('open', () => {
          aberto = true;
          this.#setStatus('conectando…');
          // Sem token entra anônimo (só o autoteste usa).
          if (token) enviar(`PASS oauth:${token}`);
          enviar(`NICK ${login}`);
          armarSilencio();
        });

        socket.addEventListener('message', (ev) => {
          armarSilencio();
          pendente += typeof ev.data === 'string' ? ev.data : '';
          const fim = pendente.lastIndexOf('\r\n');
          if (fim < 0) return;
          const linhas = pendente.slice(0, fim).split('\r\n');
          pendente = pendente.slice(fim + 2);
          try {
            for (const linha of linhas) {
              if (!this.#tratar(socket, linha, login)) { terminar(); return; }
            }
          } catch (err) {
            terminar(err);
          }
        });

        socket.addEventListener('close', () => terminar());
        socket.addEventListener('error', () => terminar(aberto ? undefined : new Error('sem conexão')));
        signal.addEventListener('abort', () => terminar(cancelado()), { once: true });
      });
    } finally {
      try { socket.close(); } catch { /* já fechado */ }
    }
  }

  /** Trata uma linha do servidor. Devolve false quando é para reconectar. */
  #tratar(socket, linha, login) {
    if (linha.startsWith('PING')) {
      socket.send(`PONG${linha.slice(4)}\r\n`);
      return true;
    }
    if (linha.includes(' NOTICE * :Login authentication failed') || linha.includes(' NOTICE * :Improperly formatted auth')) {
      throw new LoginExpirado();
    }
    if (linha.endsWith(' RECONNECT')) return false;

    // Mensagens de chat dos canais chegam aos montes: só interessam as nossas entradas e saídas.
    const partes = linha.split(' ', 4);
    if (partes.length >= 2 && partes[1] === '001') {
      this.#setStatus('entrando nos chats…');
      this.#entrarEmTodos(socket);
    } else if (
      partes.length >= 3
      && (partes[1] === 'JOIN' || partes[1] === 'PART')
      && partes[0].toLowerCase().startsWith(`:${login}!`.toLowerCase())
    ) {
      const canal = partes[2].replace(/^#+/, '');
      if (partes[1] === 'JOIN') this.#entrou.add(canal);
      else this.#entrou.delete(canal);
      this.#setStatus(`presente em ${this.entrados} de ${this.total} chats como ${login}`);
    }
    return true;
  }

  async #entrarEmTodos(socket) {
    const { signal } = this.#ctl;
    try {
      for (let i = 0; i < this.canais.length; i += this.#opc.lote) {
        if (i > 0) await dormir(this.#opc.intervaloLotes, signal);
        if (socket.readyState !== 1) return;   // a conexão caiu no meio; a próxima entra em todos de novo
        const lote = this.canais.slice(i, i + this.#opc.lote).map((c) => `#${c}`);
        socket.send(`JOIN ${lote.join(',')}\r\n`);
      }
    } catch {
      /* cancelado ou conexão caiu */
    }
  }
}
