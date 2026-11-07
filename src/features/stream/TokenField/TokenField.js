import { createElement as h, useState } from 'react';

// Campo do token de uma conta (Twitch/Kick).
// O token digitado vai para o processo principal, que o guarda criptografado (safeStorage). Este campo NUNCA recebe
// o valor de volta: só sabe se a conta TEM token (por isso não mostra o token salvo, só "salvo" + Trocar/Remover).
// `loja` é o objeto devolvido por createStreamStore (adapters/twitch.js -> `twitch`, adapters/kick.js -> `kick`).
// Escrito com createElement (sem JSX) para poder ser testado como JS puro.

const LINHA = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' };
const INPUT = { flex: 1, minWidth: 0, boxSizing: 'border-box' };
const AVISO = { color: '#f5b800' };
const OK = { color: '#86efac' };
const ERRO = { color: '#f87171' };

export default function TokenField({ loja, slot, placeholder = '', desabilitado = false }) {
  const tem = loja.useTemToken(slot);
  const info = loja.useTokenInfo();
  const [trocando, setTrocando] = useState(false);
  const [valor, setValor] = useState('');
  const [ver, setVer] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState(null);   // { ok, texto }

  const semCofre = info.persistente === false;   // o sistema não tem cofre de senhas: o token fica só em memória
  const editando = !tem || trocando;
  const travado = desabilitado || ocupado;

  const fechar = () => { setTrocando(false); setValor(''); setVer(false); };

  const salvar = async () => {
    if (travado || !valor.trim()) return;
    setOcupado(true);
    setMsg(null);
    const r = await loja.salvarToken(slot, valor);
    setOcupado(false);
    if (r?.ok) {
      fechar();
      setMsg(r.persistente === false ? { ok: false, texto: r.mensagem } : { ok: true, texto: 'Token salvo.' });
    } else {
      setMsg({ ok: false, texto: r?.mensagem || 'Não consegui salvar o token.' });
    }
  };

  const remover = async () => {
    if (travado) return;
    setOcupado(true);
    setMsg(null);
    const r = await loja.removerToken(slot);
    setOcupado(false);
    setMsg(r?.ok ? { ok: true, texto: 'Token removido.' } : { ok: false, texto: r?.mensagem || 'Não consegui remover o token.' });
  };

  const campo = h('div', { style: LINHA },
    h('input', {
      className: 'sniper__input',
      style: INPUT,
      type: ver ? 'text' : 'password',
      autoComplete: 'off',
      spellCheck: false,
      value: valor,
      placeholder,
      disabled: travado,
      onChange: (e) => setValor(e.target.value),
      onKeyDown: (e) => { if (e.key === 'Enter') salvar(); },
    }),
    h('button', { type: 'button', className: 'sniper__btn', onClick: () => setVer((v) => !v) }, ver ? 'Ocultar' : 'Mostrar'),
    h('button', { type: 'button', className: 'sniper__btn', disabled: travado || !valor.trim(), onClick: salvar }, 'Salvar'),
    tem && h('button', { type: 'button', className: 'sniper__btn', disabled: ocupado, onClick: fechar }, 'Cancelar'),
  );

  const salvo = h('div', { style: LINHA },
    h('span', { style: semCofre ? AVISO : OK }, semCofre ? '✓ Token na memória (some ao fechar o app)' : '✓ Token salvo (criptografado)'),
    h('button', { type: 'button', className: 'sniper__btn', disabled: travado, onClick: () => { setMsg(null); setTrocando(true); } }, 'Trocar'),
    h('button', { type: 'button', className: 'sniper__btn', disabled: travado, onClick: remover }, 'Remover'),
  );

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 } },
    editando ? campo : salvo,
    semCofre && h('small', { style: AVISO }, 'Este computador não tem cofre de senhas do sistema: o token não é gravado em disco e precisa ser colado de novo a cada abertura do app.'),
    msg && h('small', { style: msg.ok ? OK : ERRO }, msg.texto),
  );
}
