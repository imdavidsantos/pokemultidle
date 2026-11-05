import React, { useEffect, useState } from 'react';
import { contarRegras, lerRegras, serializarRegras } from '../../../utils/sniper/validarRegras';

const CAIXA = { display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8 };

async function copiarTexto(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch { /* tenta o método antigo */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

// Passar as regras de uma conta para outra: copiar/exportar aqui, trocar de aba e importar na outra.
export default function RulesShare({ cfg, nomeConta, onAplicar }) {
  const [aviso, setAviso] = useState(null);      // { texto, erro }
  const [aberto, setAberto] = useState(false);   // caixa de importação
  const [entrada, setEntrada] = useState('');

  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  const { regras, globais } = contarRegras(cfg);
  const vazio = regras === 0 && globais === 0;
  const resumo = `${regras} regra${regras === 1 ? '' : 's'} + ${globais} global${globais === 1 ? '' : 'is'}`;

  const copiar = async () => {
    if (vazio) return setAviso({ texto: 'Esta conta não tem regras para copiar.', erro: true });
    const ok = await copiarTexto(serializarRegras(cfg, { nomeConta }));
    return setAviso(ok
      ? { texto: `Copiado (${resumo}). Troque para a outra conta e use Importar.` }
      : { texto: 'Não consegui copiar. Use "Exportar arquivo".', erro: true });
  };

  const exportar = () => {
    if (vazio) return setAviso({ texto: 'Esta conta não tem regras para exportar.', erro: true });
    const blob = new Blob([serializarRegras(cfg, { nomeConta })], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const nome = String(nomeConta || 'conta').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40);
    a.href = url;
    a.download = `sniper-regras-${nome}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return setAviso({ texto: `Arquivo exportado (${resumo}).` });
  };

  const escolherArquivo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 1_000_000) { setAviso({ texto: 'Arquivo grande demais para ser de regras.', erro: true }); return; }
    setEntrada(await f.text());
  };

  const aplicar = () => {
    const r = lerRegras(entrada);
    if (!r.ok) { setAviso({ texto: r.erro, erro: true }); return; }
    const ok = window.confirm(
      `Substituir as regras desta conta (${regras} regra${regras === 1 ? '' : 's'}) por ${r.rules.length} regra${r.rules.length === 1 ? '' : 's'} importada${r.rules.length === 1 ? '' : 's'}`
      + `${r.conta ? ` (de "${r.conta}")` : ''}?\n\nSe o sniper desta conta estiver ligado, elas já valem na hora e o app compra de verdade.`,
    );
    if (!ok) return;
    onAplicar(r.rules, r.global);
    setEntrada('');
    setAberto(false);
    setAviso({ texto: `Importado: ${r.rules.length} regra${r.rules.length === 1 ? '' : 's'}.` });
  };

  return (
    <div style={CAIXA}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13, marginRight: 'auto' }}>Passar regras para outra conta</b>
        <button type="button" className="sniper__btn" onClick={copiar} title="Copia as regras desta conta">Copiar regras</button>
        <button type="button" className="sniper__btn" onClick={exportar} title="Salva as regras desta conta em um arquivo">Exportar arquivo</button>
        <button type="button" className="sniper__btn" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>Importar</button>
      </div>

      {aberto && (
        <>
          <textarea
            className="sniper__input"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 90, resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
            value={entrada}
            placeholder="Cole aqui as regras copiadas, ou escolha um arquivo"
            onChange={(e) => setEntrada(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="file" accept="application/json,.json" onChange={escolherArquivo} style={{ fontSize: 12, minWidth: 0 }} />
            <button type="button" className="sniper__btn" style={{ marginLeft: 'auto' }} onClick={aplicar} disabled={!entrada.trim()}>
              Aplicar nesta conta
            </button>
          </div>
        </>
      )}

      {aviso && <div className={aviso.erro ? 'sniper__aviso-regra' : 'sniper__status'}>{aviso.texto}</div>}
    </div>
  );
}
