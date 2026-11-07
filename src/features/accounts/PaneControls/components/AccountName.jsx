import React, { useState } from 'react';

export default function AccountName({ name, onChange }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        className="controls__name-input"
        autoFocus
        defaultValue={name}
        maxLength={20}
        onBlur={(e) => { onChange({ name: e.target.value.trim() || name }); setEditing(false); }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    );
  }

  return (
    <button className="controls__name" onClick={() => setEditing(true)} title="Clique para renomear">
      {name}
    </button>
  );
}
