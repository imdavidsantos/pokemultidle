import React from 'react';
import { PhoneIcon } from '../../../assets/icons/PhoneIcon';

export default function ModeToggles({ phone, onChangem }) {
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
    </>
  );
}
