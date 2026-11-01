// Regras do livro de operações: categoria, identificação única (impressão digital),
// ordem cronológica de processamento e normalização de lançamentos.
import type { Asset, AssetClass, OpCategory, Transaction, TxType } from './types';
import { EVENT_TX, INCOME_TX } from './types';

export function categoryOf(t: Pick<Transaction, 'type' | 'rfMovement'>, assetClass?: AssetClass | null): OpCategory {
  if (INCOME_TX.includes(t.type) && t.type !== 'juros') return 'proventos';
  if (t.type === 'juros') return assetClass === 'tesouro' ? 'renda_fixa' : 'proventos';
  if (t.type === 'amortizacao') return assetClass === 'tesouro' ? 'renda_fixa' : 'proventos';
  if (t.type === 'aporte' || t.type === 'retirada' || t.type === 'reinvestimento') return 'aportes';
  if (EVENT_TX.includes(t.type)) return 'eventos';
  if (t.type === 'transferencia' || t.type === 'ajuste') return 'transferencias';
  if (assetClass === 'tesouro' || t.rfMovement) return 'renda_fixa';
  if (assetClass === 'fii') return 'fiis';
  if (assetClass === 'etf') return 'etfs';
  return 'acoes'; // ações e cripto
}

const r2 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(Math.round(v * 100) / 100));
const r6 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(Math.round(v * 1e6) / 1e6));

/**
 * Base da impressão digital: o "Identificador da operação" quando informado; senão os campos
 * que definem a operação. Operações idênticas no mesmo dia recebem sufixo #2, #3…
 */
export function fingerprintBase(t: Transaction): string {
  const cat = t.category || categoryOf(t);
  if (t.extId) return `${cat}|id:${String(t.extId).trim().toLowerCase()}`;
  return [cat, t.date, t.type, (t.ticker || '').toUpperCase(), r6(t.qty), r6(t.price), r2(t.amount), (t.broker || '').trim().toLowerCase(), t.rfMovement || '', t.exDate || ''].join('|');
}

/** Atribui impressões digitais com contador de ocorrência, na ordem dada. */
export function assignFingerprints<T extends Transaction>(txs: T[], start?: Map<string, number>): T[] {
  const seen = new Map(start || []);
  return txs.map((t) => {
    const base = fingerprintBase(t);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { ...t, fingerprint: n === 1 ? base : `${base}#${n}` };
  });
}

/** Ordem de processamento dentro do mesmo dia: abertura → eventos → compras → vendas → demais. */
const RANK: Partial<Record<TxType, number>> = {
  saldo_inicial: 0,
  desdobramento: 1,
  grupamento: 1,
  bonificacao: 1,
  evento_outro: 1,
  subscricao: 2,
  compra: 2,
  ajuste: 3,
  transferencia: 3,
  venda: 4,
};
export const txOrder = (a: Transaction, b: Transaction) =>
  a.date.localeCompare(b.date) || (RANK[a.type] ?? 5) - (RANK[b.type] ?? 5) || (a.createdAt || '').localeCompare(b.createdAt || '');

/** Garante categoria, carimbos de data e consistência mínima de um lançamento. */
export function normalizeTx(t: Transaction, assets: Asset[]): Transaction {
  const a = t.assetId ? assets.find((x) => x.id === t.assetId) : null;
  const now = new Date().toISOString();
  return {
    ...t,
    ticker: a ? a.ticker : t.ticker ?? null,
    category: t.category || categoryOf(t, a?.class),
    createdAt: t.createdAt || now,
    updatedAt: now,
  };
}

/** Migração: operações antigas ganham categoria, carimbo e impressão digital. */
export function migrateTransactions(txs: Transaction[], assets: Asset[]): Transaction[] {
  const norm = txs.map((t) => (t.category && t.fingerprint && t.createdAt ? t : normalizeTx({ ...t, createdAt: t.createdAt || '2000-01-01T00:00:00.000Z' }, assets)));
  const missing = norm.filter((t) => !t.fingerprint);
  if (!missing.length) return norm;
  const counts = new Map<string, number>();
  for (const t of norm) if (t.fingerprint) counts.set(t.fingerprint.split('#')[0], (counts.get(t.fingerprint.split('#')[0]) || 0) + 1);
  const fixed = new Map(assignFingerprints(missing, counts).map((t) => [t.id, t.fingerprint]));
  return norm.map((t) => (t.fingerprint ? t : { ...t, fingerprint: fixed.get(t.id) }));
}
