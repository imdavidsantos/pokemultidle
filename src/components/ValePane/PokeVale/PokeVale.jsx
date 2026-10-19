import { avaliarFicha } from '../../../utils/AvaliarFicha';
import { useMemo } from 'react';
import './PokeVale.css';
import { ICONE, VEREDITO } from '../../../utils/pokeInfo';

export default function PokeVale({ ficha, pokedex }) {
  const r = useMemo(
    () => (ficha?.trim() ? avaliarFicha(ficha, pokedex) : null),
    [ficha, pokedex],
  );

  if (!r) return <p className="pokevale__empty">Cole a ficha do pokémon para avaliar.</p>;

  if (r.erros) {
    return (
      <div className="pokevale__erros">
        {r.erros.map((e) => <p key={e} className="pokevale__erro">❌ {e}</p>)}
      </div>
    );
  }

  const v = VEREDITO[r.veredito];

  return (
    <div className="pokevale">
      <div className={`pokevale__veredito is-${r.veredito}`}>
        <div className="pokevale__veredito-titulo">{v.icone} {v.titulo}</div>
        <div className="pokevale__veredito-sub">{v.sub}</div>
        <small className="pokevale__veredito-info">{r.nome} nv{r.nivel} · {r.papel}</small>
      </div>

      <div className="pokevale__checks">
        {r.checks.map((c) => (
          <div key={c.titulo} className={`pokevale__check is-${c.status}`}>
            <span className="pokevale__check-titulo">{ICONE[c.status]} {c.titulo}</span>
            <span className="pokevale__check-valor">{c.valor}</span>
            {c.texto && <span className="pokevale__check-texto">{c.texto}</span>}
          </div>
        ))}
      </div>

      {r.dicas.length > 0 && (
        <p className="pokevale__dicas">💡 <b>Pra ficar bom:</b> {r.dicas.join(' · ')}</p>
      )}

      {r.avisos.length > 0 && (
        <div className="pokevale__avisos">
          {r.avisos.map((a) => <div key={a}>⚠️ {a}</div>)}
        </div>
      )}
    </div>
  );
}
