import { create } from 'zustand';
import { useEffect } from 'react';

interface ToastState {
  msg: string | null;
  err: boolean;
  show: (msg: string, err?: boolean) => void;
  clear: () => void;
}
export const useToast = create<ToastState>((set) => ({
  msg: null,
  err: false,
  show: (msg, err = false) => set({ msg, err }),
  clear: () => set({ msg: null }),
}));
export const toast = (msg: string, err = false) => useToast.getState().show(msg, err);

export function Toast() {
  const { msg, err, clear } = useToast();
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(clear, err ? 9000 : 4500);
    return () => clearTimeout(t);
  }, [msg, err, clear]);
  if (!msg) return null;
  return (
    <div className={`toast ${err ? 'err' : ''}`} role="status" onClick={clear}>
      {msg}
    </div>
  );
}
