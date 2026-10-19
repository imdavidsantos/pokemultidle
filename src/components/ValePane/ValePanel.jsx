import React, { useState } from 'react';
import { criarPokedex } from '../../utils/criarPokedex.js';
import pokedexJson from '../../data/pokedex.json';
import PokeVale from './PokeVale/PokeVale.jsx';
import './ValePanel.css';

const pokedex = criarPokedex(pokedexJson);

export default function ValePanel({ onClose }) {
  const [ficha, setFicha] = useState('');

  const colar = async () => {
    try {
      setFicha(await navigator.clipboard.readText());
    } catch {

    }
  };

  return (
    <div className="valepanel" role="dialog" aria-label="Avaliador de pokémon">
      <div className="valepanel__bar">
        <span className="valepanel__title">Vale a pena?</span>
        <button className="valepanel__close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="valepanel__body">
        <textarea
          className="valepanel__input"
          value={ficha}
          onChange={(e) => setFicha(e.target.value)}
          placeholder="Cole a ficha do pokémon aqui…"
          rows={8}
          spellCheck={false}
        />
        <div className="valepanel__actions">
          <button className="valepanel__btn" onClick={colar}>Colar</button>
          <button className="valepanel__btn" onClick={() => setFicha('')} disabled={!ficha}>Limpar</button>
        </div>

        <PokeVale ficha={ficha} pokedex={pokedex} />
      </div>
    </div>
  );
}
