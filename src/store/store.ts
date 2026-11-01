import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { Asset, AuditEntry, Distribution, Fundamentals, ImportBatch, Macro, Settings, Snapshot, SyncLogEntry, Transaction } from '../domain/types';
import { TX_LABEL } from '../domain/types';
import { fingerprintBase, migrateTransactions, normalizeTx } from '../domain/ledger';
import { defaultMacro, defaultSettings, seedAssets } from '../domain/seed';
import { todayISO, uid } from '../domain/util';

// IndexedDB (fallback em localStorage; sem nenhum dos dois, como em janela privada restrita, segue só em memória)
const ls = {
  get: (k: string) => {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      /* indisponível */
    }
  },
  del: (k: string) => {
    try {
      globalThis.localStorage?.removeItem(k);
    } catch {
      /* indisponível */
    }
  },
};
const storage: StateStorage = {
  getItem: async (k) => {
    try {
      return (await idbGet(k)) ?? null;
    } catch {
      return ls.get(k);
    }
  },
  setItem: async (k, v) => {
    try {
      await idbSet(k, v);
    } catch {
      ls.set(k, v);
    }
  },
  removeItem: async (k) => {
    try {
      await idbDel(k);
    } catch {
      ls.del(k);
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
  audit?: AuditEntry[];
  imports?: ImportBatch[];
}

export type NewTx = Omit<Transaction, 'id'> & { id?: string };
export type AddResult = { ok: true; id: string } | { ok: false; duplicateOf: Transaction };

interface State {
  assets: Asset[];
  transactions: Transaction[];
  settings: Settings;
  macro: Macro[];
  snapshots: Snapshot[];
  syncLog: SyncLogEntry[];
  audit: AuditEntry[];
  imports: ImportBatch[];
  hydrated: boolean;

  addAsset: (a: Asset) => void;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  removeAsset: (id: string) => void;
  saveFundamentals: (id: string, f: Fundamentals) => void;
  setDistributions: (id: string, ds: Distribution[]) => void;
  mergeDistributions: (id: string, ds: Distribution[]) => number;
  setQuote: (id: string, price: number, date: string, source: string) => void;

  /** Lança uma operação. Recusa duplicidade (mesma impressão digital) salvo `allowDuplicate`. */
  addTransaction: (t: NewTx, opts?: { allowDuplicate?: boolean; quiet?: boolean }) => AddResult;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  removeTransaction: (id: string) => void;
  removeTransactions: (ids: string[]) => number;
  beginImport: (b: ImportBatch) => void;
  /** Grava um lote já validado (atômico): operações + ativos novos + contadores do lote. */
  commitImportChunk: (importId: string, txs: Transaction[], newAssets: Asset[], skipped: number) => number;
  finishImport: (importId: string, patch: Partial<ImportBatch>) => void;
  revertImport: (importId: string) => number;

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
      audit: [],
      imports: [],
      hydrated: false,

      addAsset: (a) => set((s) => ({ assets: [...s.assets, a] })),
      updateAsset: (id, patch) => set((s) => ({ assets: s.assets.map((a) => (a.id === id ? touch({ ...a, ...patch }) : a)) })),
      removeAsset: (id) =>
        set((s) => {
          const gone = s.transactions.filter((t) => t.assetId === id);
          let audit = s.audit;
          for (const t of gone) audit = addAudit(audit, { action: 'excluir', txId: t.id, summary: `Excluído com o ativo: ${describe(t, s.assets)}`, before: t });
          return { assets: s.assets.filter((a) => a.id !== id), transactions: s.transactions.filter((t) => t.assetId !== id), audit };
        }),
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

      addTransaction: (t, opts = {}) => {
        const st = get();
        const tx = normalizeTx({ ...t, id: t.id || uid() } as Transaction, st.assets);
        const base = fingerprintBase(tx);
        const same = st.transactions.filter((x) => (x.fingerprint || '').split('#')[0] === base);
        if (same.length && !opts.allowDuplicate) return { ok: false, duplicateOf: same[0] };
        const final = { ...tx, fingerprint: same.length ? `${base}#${same.length + 1}` : base };
        set((s) => ({ transactions: [...s.transactions, final], audit: opts.quiet ? s.audit : addAudit(s.audit, { action: 'criar', txId: final.id, summary: describe(final, s.assets), after: final }) }));
        return { ok: true, id: final.id };
      },
      updateTransaction: (id, patch) =>
        set((s) => {
          const cur = s.transactions.find((t) => t.id === id);
          if (!cur) return {};
          const next = normalizeTx({ ...cur, ...patch, id, createdAt: cur.createdAt }, s.assets);
          const base = fingerprintBase(next);
          const others = s.transactions.filter((x) => x.id !== id && (x.fingerprint || '').split('#')[0] === base).length;
          next.fingerprint = others ? `${base}#${others + 1}` : base;
          const before: Partial<Transaction> = {};
          const after: Partial<Transaction> = {};
          for (const k of Object.keys({ ...cur, ...next }) as (keyof Transaction)[]) {
            if (k === 'updatedAt' || k === 'fingerprint') continue;
            if (JSON.stringify(cur[k]) !== JSON.stringify(next[k])) {
              (before as any)[k] = cur[k];
              (after as any)[k] = next[k];
            }
          }
          if (!Object.keys(after).length) return {};
          return { transactions: s.transactions.map((t) => (t.id === id ? next : t)), audit: addAudit(s.audit, { action: 'editar', txId: id, summary: `Editado: ${describe(next, s.assets)} (${Object.keys(after).join(', ')})`, before, after }) };
        }),
      removeTransaction: (id) =>
        set((s) => {
          const cur = s.transactions.find((t) => t.id === id);
          if (!cur) return {};
          return { transactions: s.transactions.filter((t) => t.id !== id), audit: addAudit(s.audit, { action: 'excluir', txId: id, summary: `Excluído: ${describe(cur, s.assets)}`, before: cur }) };
        }),
      removeTransactions: (ids) => {
        const del = new Set(ids);
        const gone = get().transactions.filter((t) => del.has(t.id));
        if (!gone.length) return 0;
        set((s) => {
          let audit = s.audit;
          for (const t of gone) audit = addAudit(audit, { action: 'excluir', txId: t.id, summary: `Excluído: ${describe(t, s.assets)}`, before: t });
          return { transactions: s.transactions.filter((t) => !del.has(t.id)), audit };
        });
        return gone.length;
      },
      beginImport: (b) => set((s) => ({ imports: [b, ...s.imports.filter((x) => x.id !== b.id)] })),
      commitImportChunk: (importId, txs, newAssets, skipped) => {
        let added = 0;
        set((s) => {
          const tickers = new Set(s.assets.map((a) => a.ticker));
          const assets = [...s.assets, ...newAssets.filter((a) => !tickers.has(a.ticker))];
          const have = new Set(s.transactions.map((t) => t.fingerprint));
          // reenvio/retomada: o que já foi gravado é ignorado pela impressão digital
          const fresh = txs.filter((t) => !have.has(t.fingerprint)).map((t) => normalizeTx({ ...t, importId }, assets));
          added = fresh.length;
          return {
            assets,
            transactions: [...s.transactions, ...fresh],
            imports: s.imports.map((b) => (b.id === importId ? { ...b, imported: b.imported + fresh.length, skippedDuplicates: b.skippedDuplicates + skipped + (txs.length - fresh.length) } : b)),
          };
        });
        return added;
      },
      finishImport: (importId, patch) =>
        set((s) => {
          const b = s.imports.find((x) => x.id === importId);
          if (!b) return {};
          const nb = { ...b, ...patch };
          const audit = patch.status === 'concluida' || patch.status === 'interrompida' ? addAudit(s.audit, { action: 'importar', importId, summary: `Importação "${b.fileName}": ${nb.imported} operações gravadas, ${nb.skippedDuplicates} duplicadas ignoradas, ${nb.excluded} excluídas pelo usuário${nb.status === 'interrompida' ? ' (interrompida)' : ''}.` }) : s.audit;
          return { imports: s.imports.map((x) => (x.id === importId ? nb : x)), audit };
        }),
      revertImport: (importId) => {
        const st = get();
        const b = st.imports.find((x) => x.id === importId);
        const gone = st.transactions.filter((t) => t.importId === importId);
        set((s) => {
          const transactions = s.transactions.filter((t) => t.importId !== importId);
          // ativos criados por esta importação e sem nenhuma outra operação também saem
          const used = new Set(transactions.map((t) => t.assetId));
          const created = new Set(b?.newAssets || []);
          const assets = s.assets.filter((a) => !(created.has(a.ticker) && !used.has(a.id)));
          return {
            transactions,
            assets,
            imports: s.imports.map((x) => (x.id === importId ? { ...x, status: 'revertida', revertedAt: new Date().toISOString() } : x)),
            audit: addAudit(s.audit, { action: 'reverter', importId, summary: `Importação "${b?.fileName}" revertida: ${gone.length} operações removidas.`, before: null }),
          };
        });
        return gone.length;
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
          transactions: migrateTransactions(b.transactions || [], b.assets),
          settings: { ...defaultSettings(), ...b.settings },
          macro: b.macro?.length ? b.macro : defaultMacro(),
          snapshots: b.snapshots || [],
          audit: b.audit || [],
          imports: b.imports || [],
        })),
      resetAll: () => set(() => ({ assets: seedAssets(), transactions: [], settings: defaultSettings(), macro: defaultMacro(), snapshots: [], syncLog: [], audit: [], imports: [] })),
    }),
    {
      name: 'radar-investimentos-v1',
      version: 2,
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ assets: s.assets, transactions: s.transactions, settings: s.settings, macro: s.macro, snapshots: s.snapshots, syncLog: s.syncLog, audit: s.audit, imports: s.imports }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<State>;
        const d = defaultSettings();
        const ps = p.settings;
        // mescla configurações para incorporar novos campos sem perder os do usuário
        const settings: Settings = ps
          ? { ...d, ...ps, profile: { ...d.profile, ...ps.profile }, limits: { ...d.limits, ...ps.limits }, thesisRules: { ...d.thesisRules, ...ps.thesisRules }, scoring: { ...d.scoring, ...ps.scoring }, allocator: { ...d.allocator, ...ps.allocator }, integrations: { ...d.integrations, ...ps.integrations }, weights: { ...d.weights, ...ps.weights }, scenarios: { ...d.scenarios, ...ps.scenarios } }
          : current.settings;
        const assets = p.assets || current.assets;
        return { ...current, ...p, settings, transactions: migrateTransactions(p.transactions || [], assets), audit: p.audit || [], imports: p.imports || [] };
      },
      onRehydrateStorage: () => () => {
        useStore.setState({ hydrated: true });
      },
    },
  ),
);

export function makeBackup(): BackupData {
  const s = useStore.getState();
  return { app: 'radar-de-investimentos', version: 2, exportedAt: new Date().toISOString(), assets: s.assets, transactions: s.transactions, settings: s.settings, macro: s.macro, snapshots: s.snapshots, audit: s.audit, imports: s.imports };
}

const AUDIT_MAX = 20000;
function addAudit(list: AuditEntry[], e: Omit<AuditEntry, 'id' | 'at'>): AuditEntry[] {
  const next = [{ ...e, id: uid(), at: new Date().toISOString() }, ...list];
  return next.length > AUDIT_MAX ? next.slice(0, AUDIT_MAX) : next;
}

/** Descrição curta de uma operação para auditoria e mensagens. */
export function describe(t: Transaction, assets: Asset[]): string {
  const tk = (t.assetId && assets.find((a) => a.id === t.assetId)?.ticker) || t.ticker || '';
  const q = t.qty ? ` ${+t.qty.toFixed(8)}` : '';
  return `${TX_LABEL[t.type]}${tk ? ' ' + tk : ''}${q} em ${t.date.split('-').reverse().join('/')} — R$ ${t.amount.toFixed(2)}`;
}
