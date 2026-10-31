import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { Asset, Distribution, Fundamentals, Macro, Settings, Snapshot, SyncLogEntry, Transaction } from '../domain/types';
import { defaultMacro, defaultSettings, seedAssets } from '../domain/seed';
import { todayISO, uid } from '../domain/util';

// IndexedDB (fallback em localStorage quando indisponível)
const storage: StateStorage = {
  getItem: async (k) => {
    try {
      return (await idbGet(k)) ?? null;
    } catch {
      return localStorage.getItem(k);
    }
  },
  setItem: async (k, v) => {
    try {
      await idbSet(k, v);
    } catch {
      localStorage.setItem(k, v);
    }
  },
  removeItem: async (k) => {
    try {
      await idbDel(k);
    } catch {
      localStorage.removeItem(k);
    }
  },
};

export interface BackupData {
  app: 'radar-de-investimentos';
  version: number;
  exportedAt: string;
  assets: Asset[];
  transactions: Transaction[];
  settings: Settings;
  macro: Macro[];
  snapshots: Snapshot[];
}

interface State {
  assets: Asset[];
  transactions: Transaction[];
  settings: Settings;
  macro: Macro[];
  snapshots: Snapshot[];
  syncLog: SyncLogEntry[];
  hydrated: boolean;

  addAsset: (a: Asset) => void;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  removeAsset: (id: string) => void;
  saveFundamentals: (id: string, f: Fundamentals) => void;
  setDistributions: (id: string, ds: Distribution[]) => void;
  mergeDistributions: (id: string, ds: Distribution[]) => number;
  setQuote: (id: string, price: number, date: string, source: string) => void;

  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  removeTransaction: (id: string) => void;
  importTransactions: (ts: Omit<Transaction, 'id'>[]) => number;

  updateSettings: (fn: (s: Settings) => Settings) => void;
  setMacro: (m: Macro) => void;
  recordSnapshot: (s: Snapshot) => void;
  log: (e: Omit<SyncLogEntry, 'at'>) => void;

  restoreBackup: (b: BackupData) => void;
  resetAll: () => void;
}

const touch = (a: Asset): Asset => ({ ...a, updatedAt: new Date().toISOString() });

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      assets: seedAssets(),
      transactions: [],
      settings: defaultSettings(),
      macro: defaultMacro(),
      snapshots: [],
      syncLog: [],
      hydrated: false,

      addAsset: (a) => set((s) => ({ assets: [...s.assets, a] })),
      updateAsset: (id, patch) => set((s) => ({ assets: s.assets.map((a) => (a.id === id ? touch({ ...a, ...patch }) : a)) })),
      removeAsset: (id) =>
        set((s) => ({ assets: s.assets.filter((a) => a.id !== id), transactions: s.transactions.filter((t) => t.assetId !== id) })),
      saveFundamentals: (id, f) =>
        set((s) => ({
          assets: s.assets.map((a) => {
            if (a.id !== id) return a;
            const date = f.updatedAt || todayISO();
            const data = { ...f, updatedAt: date };
            // histórico: uma revisão por data (a do mesmo dia é sobrescrita)
            const hist = (a.fundHistory || []).filter((h) => h.date !== date);
            return touch({ ...a, fundamentals: data, fundHistory: [...hist, { date, data }].sort((x, y) => x.date.localeCompare(y.date)) });
          }),
        })),
      setDistributions: (id, ds) => set((s) => ({ assets: s.assets.map((a) => (a.id === id ? touch({ ...a, distributions: ds }) : a)) })),
      mergeDistributions: (id, ds) => {
        let added = 0;
        set((s) => ({
          assets: s.assets.map((a) => {
            if (a.id !== id) return a;
            const key = (d: Distribution) => `${d.exDate}|${d.type}|${d.value.toFixed(6)}`;
            const existing = new Set(a.distributions.map(key));
            const fresh = ds.filter((d) => !existing.has(key(d)));
            added = fresh.length;
            return touch({ ...a, distributions: [...a.distributions, ...fresh].sort((x, y) => x.exDate.localeCompare(y.exDate)) });
          }),
        }));
        return added;
      },
      setQuote: (id, price, date, source) =>
        set((s) => ({
          assets: s.assets.map((a) => {
            if (a.id !== id) return a;
            const day = date.slice(0, 10);
            const hist = [...(a.quoteHistory || []).filter((h) => h.date !== day), { date: day, price }].sort((x, y) => x.date.localeCompare(y.date)).slice(-730);
            return { ...a, quote: { price, date, source, kind: source.startsWith('Manual') ? 'manual' : 'real' }, quoteHistory: hist };
          }),
        })),

      addTransaction: (t) => set((s) => ({ transactions: [...s.transactions, { ...t, id: uid() }] })),
      updateTransaction: (id, patch) => set((s) => ({ transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      removeTransaction: (id) => set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
      importTransactions: (ts) => {
        const existing = new Set(get().transactions.map((t) => `${t.date}|${t.type}|${t.assetId}|${t.qty}|${t.amount.toFixed(2)}`));
        const fresh = ts.filter((t) => !existing.has(`${t.date}|${t.type}|${t.assetId}|${t.qty}|${t.amount.toFixed(2)}`)).map((t) => ({ ...t, id: uid() }));
        set((s) => ({ transactions: [...s.transactions, ...fresh] }));
        return fresh.length;
      },

      updateSettings: (fn) => set((s) => ({ settings: fn(structuredClone(s.settings)) })),
      setMacro: (m) => set((s) => ({ macro: s.macro.some((x) => x.key === m.key) ? s.macro.map((x) => (x.key === m.key ? m : x)) : [...s.macro, m] })),
      recordSnapshot: (snap) =>
        set((s) => {
          const prev = s.snapshots.find((x) => x.date === snap.date);
          if (prev && Math.abs(prev.value - snap.value) < 0.005 && Math.abs(prev.invested - snap.invested) < 0.005) return {};
          return { snapshots: [...s.snapshots.filter((x) => x.date !== snap.date), snap].sort((a, b) => a.date.localeCompare(b.date)) };
        }),
      log: (e) => set((s) => ({ syncLog: [{ ...e, at: new Date().toISOString() }, ...s.syncLog].slice(0, 200) })),

      restoreBackup: (b) =>
        set(() => ({
          assets: b.assets,
          transactions: b.transactions,
          settings: { ...defaultSettings(), ...b.settings },
          macro: b.macro?.length ? b.macro : defaultMacro(),
          snapshots: b.snapshots || [],
        })),
      resetAll: () => set(() => ({ assets: seedAssets(), transactions: [], settings: defaultSettings(), macro: defaultMacro(), snapshots: [], syncLog: [] })),
    }),
    {
      name: 'radar-investimentos-v1',
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ assets: s.assets, transactions: s.transactions, settings: s.settings, macro: s.macro, snapshots: s.snapshots, syncLog: s.syncLog }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<State>;
        const d = defaultSettings();
        const ps = p.settings;
        // mescla configurações para incorporar novos campos sem perder os do usuário
        const settings: Settings = ps
          ? { ...d, ...ps, profile: { ...d.profile, ...ps.profile }, limits: { ...d.limits, ...ps.limits }, thesisRules: { ...d.thesisRules, ...ps.thesisRules }, scoring: { ...d.scoring, ...ps.scoring }, allocator: { ...d.allocator, ...ps.allocator }, integrations: { ...d.integrations, ...ps.integrations }, weights: { ...d.weights, ...ps.weights }, scenarios: { ...d.scenarios, ...ps.scenarios } }
          : current.settings;
        return { ...current, ...p, settings };
      },
      onRehydrateStorage: () => () => {
        useStore.setState({ hydrated: true });
      },
    },
  ),
);

export function makeBackup(): BackupData {
  const s = useStore.getState();
  return { app: 'radar-de-investimentos', version: 1, exportedAt: new Date().toISOString(), assets: s.assets, transactions: s.transactions, settings: s.settings, macro: s.macro, snapshots: s.snapshots };
}
