import React from 'react';
import { BoostIcon } from '../../../assets/icons/BoostIcon';
import { PhoneIcon } from '../../../assets/icons/PhoneIcon';

export default function ModeToggles({ phone, boost, onChange }) {
  return (
    <>
      <button
        className={`controls__btn ${phone ? 'is-on' : ''}`}
        onClick={() => onChange({ phone: !phone })}
        aria-pressed={!!phone}
        title={phone ? 'Desativar modo celular (voltar para 1920 de largura)' : 'Ativar modo celular (500×900)'}
      >
        <PhoneIcon />
      </button>
      <button
        className={`controls__btn ${boost ? 'is-on' : ''}`}
        onClick={() => onChange({ boost: !boost })}
        aria-pressed={!!boost}
        title={boost ? 'Desativar boost (fps normal)' : 'Ativar boost (15 fps)'}
      >
        <BoostIcon />
      </button>
    </>
  );
}
