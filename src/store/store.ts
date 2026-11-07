import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { Asset, AuditEntry, Distribution, Fundamentals, ImportBatch, Macro, Settings, Snapshot, SyncLogEntry, Transaction } from '../domain/types';
import { TX_LABEL } from '../domain/types';
import { activeTransactions, assignFingerprints, fingerprintBase, liveFingerprints, migrateTransactions, normalizeTx, uniqueFingerprints } from '../domain/ledger';
import type { AutoPlan, Conciliation } from '../domain/calc/proventos';
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
const STORE_VERSION = 3;
const storage: StateStorage = {
  getItem: async (k) => {
    let raw: string | null;
    try {
      raw = ((await idbGet(k)) as string | undefined) ?? null;
    } catch {
      raw = ls.get(k);
    }
    // Migração reversível: ANTES de qualquer migração de esquema, guarda uma cópia integral
    // do estado anterior (chave `radar-backup-pre-v3`), aguardando a gravação terminar.
    try {
      const v = raw ? JSON.parse(raw).version : null;
      if (typeof v === 'number' && v < STORE_VERSION) {
        const parsed = JSON.parse(raw!);
        await idbSet(`radar-backup-pre-v${STORE_VERSION}`, JSON.stringify({ version: v, at: new Date().toISOString(), state: parsed.state }));
      }
    } catch {
      /* sem IndexedDB: segue (o backup JSON manual continua disponível) */
    }
    return raw;
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
  conciliations?: Conciliation[];
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
  /** Correção = estorno do original + novo lançamento (livro só de inclusão). */
  updateTransaction: (id: string, patch: Partial<Transaction>, reason?: string) => void;
  /** Estorno: o lançamento continua no livro, anulado por um lançamento de estorno. */
  removeTransaction: (id: string, reason?: string) => void;
  removeTransactions: (ids: string[], reason?: string) => number;
  applyAutoPlan: (plan: AutoPlan) => number;
  conciliations: Conciliation[];
  addConciliations: (cs: Conciliation[]) => void;
  beginImport: (b: ImportBatch) => void;
  /** Grava um lote já validado (atômico): operações + ativos novos + contadores do lote. */
  /** Grava a importação inteira numa única operação atômica (tudo ou nada). */
  commitImportChunk: (importId: string, txs: Transaction[], newAssets: Asset[], skipped: number, conciliations?: Conciliation[]) => number;
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
      // Livro só de inclusão: um ativo com lançamentos não é apagado (use "mover para watchlist").
      removeAsset: (id) =>
        set((s) => (s.transactions.some((t) => t.assetId === id || t.targetAssetId === id) ? s : { assets: s.assets.filter((a) => a.id !== id) })),
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
        // duplicidade só contra lançamentos válidos; a numeração (#n) considera o livro inteiro
        const same = activeTransactions(st.transactions).filter((x) => (x.fingerprint || '').split('#')[0] === base);
        if (same.length && !opts.allowDuplicate) return { ok: false, duplicateOf: same[0] };
        const [final] = uniqueFingerprints([{ ...tx, fingerprint: base }], st.transactions);
        set((s) => ({ transactions: [...s.transactions, final], audit: opts.quiet ? s.audit : addAudit(s.audit, { action: 'criar', txId: final.id, summary: describe(final, s.assets), after: final }) }));
        return { ok: true, id: final.id };
      },
      updateTransaction: (id, patch, reason = 'Correção de lançamento') =>
        set((s) => {
          const cur = s.transactions.find((t) => t.id === id);
          if (!cur || cur.type === 'estorno' || s.transactions.some((t) => t.reversalOf === id)) return {};
          const by = deviceLabel();
          const now = new Date().toISOString();
          const next = normalizeTx({ ...cur, ...patch, id: uid(), correctionOf: id, reason, by, createdAt: now, fingerprint: undefined } as Transaction, s.assets);
          const rev = reversal(cur, reason, by);
          const changed: string[] = [];
          for (const k of Object.keys(patch) as (keyof Transaction)[]) if (JSON.stringify(cur[k]) !== JSON.stringify(next[k])) changed.push(k as string);
          if (!changed.length) return {};
          const others = s.transactions.filter((x) => x.id !== id && (x.fingerprint || '').split('#')[0] === fingerprintBase(next)).length;
          next.fingerprint = others ? `${fingerprintBase(next)}#${others + 1}` : fingerprintBase(next);
          const before: Partial<Transaction> = {};
          const after: Partial<Transaction> = {};
          for (const k of changed) {
            (before as any)[k] = (cur as any)[k];
            (after as any)[k] = (next as any)[k];
          }
          return { transactions: [...s.transactions, rev, next], audit: addAudit(s.audit, { action: 'corrigir', txId: next.id, summary: `Correção (estorno + novo): ${describe(next, s.assets)} — motivo: ${reason} (${by})`, before, after }) };
        }),
      removeTransaction: (id, reason = 'Estorno solicitado') => {
        get().removeTransactions([id], reason);
      },
      removeTransactions: (ids, reason = 'Estorno solicitado') => {
        const st = get();
        const already = new Set(st.transactions.filter((t) => t.type === 'estorno').map((t) => t.reversalOf));
        const targets = st.transactions.filter((t) => ids.includes(t.id) && t.type !== 'estorno' && !already.has(t.id));
        if (!targets.length) return 0;
        const by = deviceLabel();
        set((s) => {
          let audit = s.audit;
          for (const t of targets) audit = addAudit(audit, { action: 'estornar', txId: t.id, summary: `Estornado: ${describe(t, s.assets)} — motivo: ${reason} (${by})`, before: t });
          return { transactions: [...s.transactions, ...targets.map((t) => reversal(t, reason, by))], audit };
        });
        return targets.length;
      },
      conciliations: [],
      addConciliations: (cs) => set((s) => ({ conciliations: [...s.conciliations, ...cs], audit: cs.length ? addAudit(s.audit, { action: 'conciliar', summary: `${cs.length} provento(s) conciliado(s) com extrato: ${cs.filter((c) => c.status === 'conferido').length} conferido(s), ${cs.filter((c) => c.status === 'pendente').length} pendência(s).` }) : s.audit })),
      applyAutoPlan: (plan) => {
        if (!plan.create.length && !plan.reverse.length) return 0;
        set((s) => {
          const by = deviceLabel();
          const revs = plan.reverse.map((r) => {
            const t = s.transactions.find((x) => x.id === r.id)!;
            return reversal(t, r.reason, by);
          });
          // os lançamentos estornados neste mesmo plano não bloqueiam a recriação (achado A-04)
          const have = liveFingerprints(s.transactions, new Set(plan.reverse.map((r) => r.id)));
          const fresh = uniqueFingerprints(assignFingerprints(plan.create.map((t) => normalizeTx(t, s.assets))).filter((t) => !have.has(t.fingerprint || '')), s.transactions);
          return {
            transactions: [...s.transactions, ...revs, ...fresh],
            audit: addAudit(s.audit, { action: 'provento_auto', summary: `Proventos automáticos pela data-com: ${fresh.length} lançado(s), ${revs.length} estornado(s) por recálculo/retificação.` }),
          };
        });
        return plan.create.length + plan.reverse.length;
      },
      beginImport: (b) => set((s) => ({ imports: [b, ...s.imports.filter((x) => x.id !== b.id)] })),
      commitImportChunk: (importId, txs, newAssets, skipped, conc = []) => {
        let added = 0;
        set((s) => {
          if (conc.length) s = { ...s, conciliations: [...s.conciliations, ...conc] };
          const tickers = new Set(s.assets.map((a) => a.ticker));
          const assets = [...s.assets, ...newAssets.filter((a) => !tickers.has(a.ticker))];
          const have = liveFingerprints(s.transactions);
          // reenvio/retomada: o que já está gravado e válido é ignorado; o que foi estornado pode voltar (achado A-02)
          const fresh = uniqueFingerprints(txs.filter((t) => !have.has(t.fingerprint || '')).map((t) => normalizeTx({ ...t, importId }, assets)), s.transactions);
          added = fresh.length;
          return {
            assets,
            conciliations: s.conciliations,
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
        const reversed = new Set(st.transactions.filter((t) => t.type === 'estorno').map((t) => t.reversalOf));
        const gone = st.transactions.filter((t) => t.importId === importId && t.type !== 'estorno' && !reversed.has(t.id));
        const by = deviceLabel();
        const reason = `Reversão da importação "${b?.fileName}"`;
        set((s) => ({
          transactions: [...s.transactions, ...gone.map((t) => reversal(t, reason, by))],
          imports: s.imports.map((x) => (x.id === importId ? { ...x, status: 'revertida', revertedAt: new Date().toISOString() } : x)),
          audit: addAudit(s.audit, { action: 'reverter', importId, summary: `${reason}: ${gone.length} operações estornadas (o histórico original foi preservado). ${by}` }),
        }));
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
          conciliations: b.conciliations || [],
        })),
      resetAll: () => set(() => ({ assets: seedAssets(), transactions: [], settings: defaultSettings(), macro: defaultMacro(), snapshots: [], syncLog: [], audit: [], imports: [], conciliations: [] })),
    }),
    {
      name: 'radar-investimentos-v1',
      version: STORE_VERSION,
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ assets: s.assets, transactions: s.transactions, settings: s.settings, macro: s.macro, snapshots: s.snapshots, syncLog: s.syncLog, audit: s.audit, imports: s.imports, conciliations: s.conciliations }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<State>;
        const d = defaultSettings();
        const ps = p.settings;
        // mescla configurações para incorporar novos campos sem perder os do usuário
        const settings: Settings = ps
          ? { ...d, ...ps, profile: { ...d.profile, ...ps.profile }, limits: { ...d.limits, ...ps.limits }, thesisRules: { ...d.thesisRules, ...ps.thesisRules }, scoring: { ...d.scoring, ...ps.scoring }, allocator: { ...d.allocator, ...ps.allocator }, integrations: { ...d.integrations, ...ps.integrations }, weights: { ...d.weights, ...ps.weights }, scenarios: { ...d.scenarios, ...ps.scenarios }, tax: { ...d.tax, ...ps.tax }, dpa: { ...d.dpa, ...ps.dpa }, limits360: { ...d.limits360, ...ps.limits360 }, sell: { ...d.sell, ...ps.sell }, bands: ps.bands && 'margin' in ps.bands ? ps.bands : d.bands }
          : current.settings;
        const assets = p.assets || current.assets;
        return { ...current, ...p, settings, transactions: migrateTransactions(p.transactions || [], assets), audit: p.audit || [], imports: p.imports || [], conciliations: p.conciliations || [] };
      },
      // Migração de esquema reversível: guarda uma cópia integral do estado ANTES de migrar
      // (chave `radar-backup-pre-v<versão>` no IndexedDB), restaurável em Dados & integrações.
      // (a cópia de segurança é gravada em storage.getItem, antes desta função)
      migrate: (persisted: any, version: number) => {
        if (!persisted) return persisted;
        const st = { ...persisted };
        if (version < 3) {
          const ps = st.settings || {};
          st.settings = {
            ...ps,
            bands: { margin: 15 }, // nova régua por margem (Etapa 8)
            defaultDy: { acao: ps.defaultDy?.acao === 6 ? 8 : ps.defaultDy?.acao ?? 8, fii: ps.defaultDy?.fii ?? 8 },
          };
          st.transactions = migrateTransactions(st.transactions || [], st.assets || [], true);
          st.audit = [{ id: uid(), at: new Date().toISOString(), action: 'migrar', summary: `Esquema migrado da versão ${version} para a 3 (livro só de inclusão, nova chave de duplicidade, régua por margem). Cópia de segurança anterior guardada no aparelho.` }, ...(st.audit || [])];
        }
        return st;
      },
      onRehydrateStorage: () => () => {
        useStore.setState({ hydrated: true });
      },
    },
  ),
);

export function makeBackup(): BackupData {
  const s = useStore.getState();
  return { app: 'radar-de-investimentos', version: 3, exportedAt: new Date().toISOString(), assets: s.assets, transactions: s.transactions, settings: s.settings, macro: s.macro, snapshots: s.snapshots, audit: s.audit, imports: s.imports, conciliations: s.conciliations };
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

/** Identifica quem fez a alteração (não há login: usa o aparelho). */
export function deviceLabel(): string {
  try {
    const ua = navigator.userAgent;
    const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Mac/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows' : /Linux/i.test(ua) ? 'Linux' : 'navegador';
    return `aparelho ${os}`;
  } catch {
    return 'sistema';
  }
}

/** Lançamento de estorno que anula `t` (o original permanece no livro). */
function reversal(t: Transaction, reason: string, by: string): Transaction {
  const now = new Date().toISOString();
  return { id: uid(), date: todayISO(), type: 'estorno', category: t.category, assetId: t.assetId, ticker: t.ticker, amount: t.amount, qty: t.qty, reversalOf: t.id, reason, by, notes: `Estorno de ${t.type} de ${t.date}: ${reason}`, fingerprint: `estorno|${t.id}`, createdAt: now, updatedAt: now };
}

/** Restaura a cópia de segurança gravada antes da migração de esquema (reversão). */
export async function restorePreMigrationBackup(): Promise<{ version: number; at: string } | null> {
  const raw = await idbGet('radar-backup-pre-v3');
  if (!raw) return null;
  const b = JSON.parse(raw as string);
  await idbSet('radar-investimentos-v1', JSON.stringify({ state: b.state, version: b.version }));
  return { version: b.version, at: b.at };
}
export async function hasPreMigrationBackup() {
  try {
    return !!(await idbGet('radar-backup-pre-v3'));
  } catch {
    return false;
  }
}
