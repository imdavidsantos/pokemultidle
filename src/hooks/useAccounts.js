import { useCallback, useEffect, useState } from 'react';
import { MAX_ACCOUNTS, STORAGE_KEY } from '../config';

const defaultAccount = (slot) => ({
  slot,                 // 1..4 — define a sessão (login) própria desta conta
  name: `Conta ${slot}`,
  muted: false,
  volume: 1,
  zoom: 1,
  boost: false,
});

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && Array.isArray(raw.accounts) && raw.accounts.length) {
      return {
        accounts: raw.accounts,
        focusedSlot: raw.focusedSlot ?? null,
        layout: raw.layout === '1x1' ? '1x1' : '2x2',
      };
    }
  } catch {}
  return { accounts: [defaultAccount(1)], focusedSlot: null, layout: '2x2' };
}

export default function useAccounts() {
  const [state, setState] = useState(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const addAccount = useCallback(() => {
    setState((s) => {
      if (s.accounts.length >= MAX_ACCOUNTS) return s;
      const used = new Set(s.accounts.map((a) => a.slot));
      let slot = 1;
      while (used.has(slot)) slot += 1;
      return { ...s, accounts: [...s.accounts, defaultAccount(slot)] };
    });
  }, []);

  const removeAccount = useCallback((slot) => {
    setState((s) => {
      if (s.accounts.length <= 1) return s; // mantém ao menos 1 tela
      return {
        ...s,
        accounts: s.accounts.filter((a) => a.slot !== slot),
        focusedSlot: s.focusedSlot === slot ? null : s.focusedSlot,
      };
    });
  }, []);

  const updateAccount = useCallback((slot, patch) => {
    setState((s) => ({
      ...s,
      accounts: s.accounts.map((a) => (a.slot === slot ? { ...a, ...patch } : a)),
    }));
  }, []);

  const setFocus = useCallback((slot) => {
    setState((s) => ({ ...s, focusedSlot: slot }));
  }, []);

  const setLayout = useCallback((layout) => {
    setState((s) => ({ ...s, layout }));
  }, []);

  return {
    accounts: state.accounts,
    focusedSlot: state.focusedSlot,
    layout: state.layout,
    addAccount,
    removeAccount,
    updateAccount,
    setFocus,
    setLayout,
  };
}
