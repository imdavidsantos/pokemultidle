import React from 'react';

// Base compartilhada: herda a cor do botão (currentColor) e aceita tamanho/props extras.
export default function Icone({ size = 16, children, ...resto }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
      {...resto}
    >
      {children}
    </svg>
  );
}
