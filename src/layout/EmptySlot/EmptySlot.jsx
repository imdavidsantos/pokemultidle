import React from 'react';
import './EmptySlot.css';

export default function EmptySlot({ onAdd, style }) {
  return (
    <button className="empty-slot" onClick={onAdd} style={style}>
      <span className="empty-slot__plus">+</span>
      Adicionar conta
    </button>
  );
}
