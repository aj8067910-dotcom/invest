import type { Asset, Transaction, Distribution } from '../types';
import { INCOME_TX } from '../types';
import { activeTransactions, isReceived } from '../ledger';
import { D, Decimal, N, ZERO } from '../money';
import { addMonths, isNum, median, monthKey, todayISO } from '../util';
import { isHeld, type Position } from './positions';

const shiftDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return todayISO(d);
};

export interface Ttm {
  recurring: number;
  extraordinary: number;
  total: number;
  count: number;
  extraShare: number; // % do total que é extraordinário
}

export function ttmPerUnit(asset: Asset, asOf = todayISO(), offsetDays = 0): Ttm {
  const end = shiftDays(asOf, -offsetDays);
  const start = shiftDays(end, -365);
  let recurring = 0;
  let extraordinary = 0;
  let count = 0;
  for (const d of asset.distributions) {
    if (d.type === 'amortizacao') continue; // devolução de capital, não é provento
    if (d.exDate > start && d.exDate <= end) {
      count++;
      if (d.recurring) recurring += d.value;
      else extraordinary += d.value;
    }
  }
  const total = recurring + extraordinary;
  return { recurring, extraordinary, total, count, extraShare: total > 0 ? (extraordinary / total) * 100 : 0 };
}

export interface BazinBase {
  value: number | null;
  kind: 'real' | 'estimativa' | 'ausente';
  label: string;
}

/** Provento anual por unidade usado no preço-teto. Nunca inclui extraordinários. */
export function bazinBase(asset: Asset, asOf = todayISO()): BazinBase {
  if (asset.useEstimate && isNum(asset.next12mEstimate) && asset.next12mEstimate > 0)
    return { value: asset.next12mEstimate, kind: 'estimativa', label: 'Estimativa recorrente 12m (manual)' };
  const t = ttmPerUnit(asset, asOf);
  if (t.recurring > 0) return { value: t.recurring, kind: 'real', label: 'Recorrentes pagos nos últimos 12m' };
  if (isNum(asset.next12mEstimate) && asset.next12mEstimate > 0)
    return { value: asset.next12mEstimate, kind: 'estimativa', label: 'Estimativa 12m (sem histórico de 12m)' };
  return { value: null, kind: 'ausente', label: 'Sem proventos cadastrados' };
}

export interface YearRow {
  year: number;
  recurring: number;
  extraordinary: number;
  total: number;
  payments: number;
  avgPrice: number | null;
  dy: number | null; // DY recorrente sobre preço médio do ano
  complete: boolean;
}

export function annualHistory(asset: Asset, asOf = todayISO()): YearRow[] {
  const curYear = Number(asOf.slice(0, 4));
  const map = new Map<number, YearRow>();
  for (const d of asset.distributions) {
    if (d.type === 'amortizacao') continue;
    const y = Number(d.exDate.slice(0, 4));
    const r = map.get(y) || { year: y, recurring: 0, extraordinary: 0, total: 0, payments: 0, avgPrice: null, dy: null, complete: y < curYear };
    if (d.recurring) r.recurring += d.value;
    else r.extraordinary += d.value;
    r.total += d.value;
    r.payments++;
    map.set(y, r);
  }
  for (const [y, p] of Object.entries(asset.annualPrices || {})) {
    const yr = Number(y);
    if (!map.has(yr) && isNum(p)) map.set(yr, { year: yr, recurring: 0, extraordinary: 0, total: 0, payments: 0, avgPrice: null, dy: null, complete: yr < curYear });
  }
  const rows = [...map.values()].sort((a, b) => a.year - b.year);
  for (const r of rows) {
    const p = asset.annualPrices?.[String(r.year)];
    if (isNum(p) && p > 0) {
      r.avgPrice = p;
      r.dy = (r.recurring / p) * 100;
    }
  }
  return rows;
}

/** CAGR dos proventos recorrentes nos anos completos (até `years` anos). */
export function dividendCagr(rows: YearRow[], years = 5): number | null {
  const full = rows.filter((r) => r.complete && r.recurring > 0).slice(-years);
  if (full.length < 3) return null;
  const first = full[0];
  const last = full[full.length - 1];
  const n = last.year - first.year;
  if (n <= 0) return null;
  return (Math.pow(last.recurring / first.recurring, 1 / n) - 1) * 100;
}

export function avgDy(rows: YearRow[], years: number): number | null {
  const valid = rows.filter((r) => r.complete && r.dy !== null).slice(-years);
  if (valid.length < years) return null;
  return valid.reduce((s, r) => s + (r.dy as number), 0) / valid.length;
}

/** Anos consecutivos (até o último completo) com pagamento recorrente. */
export function consecutiveYears(rows: YearRow[]): number {
  const full = rows.filter((r) => r.complete);
  let n = 0;
  for (let i = full.length - 1; i >= 0; i--) {
    if (full[i].recurring > 0 && (i === full.length - 1 || full[i + 1].year === full[i].year + 1)) n++;
    else break;
  }
  return n;
}

export function paymentFrequency(asset: Asset, asOf = todayISO()): { perYear: number; label: string } {
  const start = shiftDays(asOf, -730);
  const months = new Set(
    asset.distributions.filter((d) => d.exDate > start && d.exDate <= asOf && d.type !== 'amortizacao').map((d) => monthKey(d.exDate)),
  );
  const perYear = months.size / 2;
  let label = 'Sem histórico';
  if (perYear >= 10) label = 'Mensal';
  else if (perYear >= 3.5) label = 'Trimestral ou maior';
  else if (perYear >= 1.5) label = 'Semestral';
  else if (perYear >= 0.5) label = 'Anual';
  else if (perYear > 0) label = 'Irregular';
  return { perYear, label };
}

/**
 * Sugere marcação de extraordinário. Um pagamento é atípico quando é bem maior (> 2,5×) que a
 * mediana dos pagamentos dos 3 anos ao redor E não tem um equivalente (mesma ordem de grandeza)
 * na mesma época do ano anterior ou seguinte. Assim, JCP complementares semestrais ou anuais que
 * se repetem todo ano continuam recorrentes; um dividendo pontual vira extraordinário.
 */
export function suspectExtraordinary(asset: Asset): Set<string> {
  const out = new Set<string>();
  const DAY = 86400000;
  const ds = asset.distributions.filter((d) => d.type !== 'amortizacao').map((d) => ({ d, t: new Date(d.exDate + 'T12:00:00').getTime() }));
  for (const { d, t } of ds) {
    const others = ds.filter((o) => o.d.id !== d.id && Math.abs(o.t - t) < 3 * 365 * DAY);
    if (others.length < 3) continue;
    const m = median(others.map((o) => o.d.value));
    if (!(m > 0 && d.value > 2.5 * m)) continue;
    const repeats = ds.some(
      (o) => o.d.id !== d.id && Math.abs(Math.abs(o.t - t) - 365 * DAY) <= 75 * DAY && o.d.value >= d.value / 2.5 && o.d.value <= d.value * 2.5,
    );
    if (!repeats) out.add(d.id);
  }
  return out;
}

export function dividendDrop(asset: Asset, asOf = todayISO()): number | null {
  const cur = ttmPerUnit(asset, asOf).recurring;
  const prev = ttmPerUnit(asset, asOf, 365).recurring;
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

// ─────────────────────── Carteira consolidada ───────────────────────

export interface MonthIncome {
  month: string; // yyyy-mm
  received: number;
  byType: Record<string, number>;
}

export function monthlyReceived(txs: Transaction[], startISO: string, asOf = todayISO()): MonthIncome[] {
  const start = monthKey(startISO);
  const end = monthKey(asOf);
  const rows: MonthIncome[] = [];
  let cur = start + '-01';
  while (monthKey(cur) <= end) {
    rows.push({ month: monthKey(cur), received: 0, byType: {} });
    cur = addMonths(cur, 1);
  }
  const idx = new Map(rows.map((r, i) => [r.month, i]));
  for (const t of activeTransactions(txs)) {
    if (!INCOME_TX.includes(t.type) || !isReceived(t, asOf)) continue;
    const i = idx.get(monthKey(t.date));
    if (i === undefined) continue;
    rows[i].received += t.amount;
    rows[i].byType[t.type] = (rows[i].byType[t.type] || 0) + t.amount;
  }
  return rows;
}

export interface IncomeSummary {
  lastMonth: number;
  last12m: number;
  prev12m: number;
  avgMonthly12m: number;
  monthsOfHistory: number;
  growthPct: number | null; // últimos 12m ÷ 12m anteriores − 1
  growthLabel: string;
  totalReceived: number;
  provisioned: number;
  byAsset: { assetId: string; ticker: string; value: number; share: number }[];
  top1Share: number;
  top3Share: number;
}

/**
 * Renda passiva recebida (pela DATA DE PAGAMENTO, valores líquidos).
 * - Média mensal = soma dos últimos 12 meses ÷ 12 (janela móvel, mesmo com histórico menor).
 * - Crescimento = últimos 12 meses ÷ 12 meses anteriores − 1; só com 24 meses de histórico.
 */
export function incomeSummary(assets: Asset[], txs: Transaction[], startISO: string, asOf = todayISO()): IncomeSummary {
  const active = activeTransactions(txs);
  const rows = monthlyReceived(active, startISO, asOf);
  const lastFull = rows.length >= 2 ? rows[rows.length - 2] : rows[rows.length - 1];
  const y1 = addMonths(asOf, -12);
  const y2 = addMonths(asOf, -24);
  const inc = active.filter((t) => INCOME_TX.includes(t.type));
  const received = inc.filter((t) => isReceived(t, asOf));
  const sumD = (xs: Transaction[]) => xs.reduce((acc, t) => acc.plus(D(t.amount)), ZERO);
  const last12m = N(sumD(received.filter((t) => t.date > y1)));
  const prev12m = N(sumD(received.filter((t) => t.date > y2 && t.date <= y1)));
  const provisioned = N(sumD(inc.filter((t) => !isReceived(t, asOf))));
  let growthPct: number | null = null;
  let growthLabel = '12 meses ÷ 12 meses anteriores − 1';
  if (startISO > y2) growthLabel = 'histórico insuficiente (precisa de 24 meses)';
  else if (prev12m > 0) growthPct = (last12m / prev12m - 1) * 100;
  else growthLabel = 'sem proventos nos 12 meses anteriores';

  const totals = new Map<string, Decimal>();
  for (const t of received) if (t.assetId) totals.set(t.assetId, (totals.get(t.assetId) || ZERO).plus(D(t.amount)));
  const total = [...totals.values()].reduce((x, v) => x.plus(v), ZERO);
  const byAsset = [...totals.entries()]
    .map(([assetId, v]) => ({ assetId, ticker: assets.find((a) => a.id === assetId)?.ticker || '?', value: N(v), share: total.isZero() ? 0 : N(v.dividedBy(total).times(100)) }))
    .sort((a, b) => b.value - a.value);
  return {
    lastMonth: lastFull?.received ?? 0,
    last12m,
    prev12m,
    avgMonthly12m: N(D(last12m).dividedBy(12)),
    monthsOfHistory: rows.length,
    growthPct,
    growthLabel,
    totalReceived: N(total),
    provisioned,
    byAsset,
    top1Share: byAsset[0]?.share ?? 0,
    top3Share: byAsset.slice(0, 3).reduce((x, a) => x + a.share, 0),
  };
}

export interface ForwardIncome {
  assetId: string;
  ticker: string;
  perUnit: number;
  qty: number;
  annual: number;
  monthly: number;
  share: number;
  kind: 'real' | 'estimativa';
}

/** Renda ESTIMADA para os próximos 12 meses: quantidade atual × provento recorrente por unidade. */
export function forwardIncome(assets: Asset[], positions: Record<string, Position>, asOf = todayISO()): { rows: ForwardIncome[]; annual: number; monthly: number } {
  const rows: ForwardIncome[] = [];
  for (const a of assets) {
    const p = positions[a.id];
    if (!isHeld(p) || p.qty <= 0) continue;
    const b = bazinBase(a, asOf);
    let perUnit = b.value ?? 0;
    let kind: 'real' | 'estimativa' = b.kind === 'real' ? 'real' : 'estimativa';
    if (a.class === 'tesouro' || a.class === 'cripto') continue; // sem proventos periódicos (IPCA+ sem cupom)
    if (perUnit <= 0) continue;
    rows.push({ assetId: a.id, ticker: a.ticker, perUnit, qty: p.qty, annual: perUnit * p.qty, monthly: (perUnit * p.qty) / 12, share: 0, kind });
  }
  const annual = rows.reduce((s, r) => s + r.annual, 0);
  for (const r of rows) r.share = annual ? (r.annual / annual) * 100 : 0;
  rows.sort((a, b) => b.annual - a.annual);
  return { rows, annual, monthly: annual / 12 };
}

/** Série consolidada de proventos por unidade × quantidade atual, por ano (visão "pro forma"). */
export function portfolioAnnualProForma(assets: Asset[], positions: Record<string, Position>): { year: number; recorrente: number; extraordinario: number }[] {
  const map = new Map<number, { year: number; recorrente: number; extraordinario: number }>();
  for (const a of assets) {
    const p = positions[a.id];
    if (!isHeld(p) || p.qty <= 0) continue;
    for (const d of a.distributions as Distribution[]) {
      if (d.type === 'amortizacao') continue;
      const y = Number(d.exDate.slice(0, 4));
      const r = map.get(y) || { year: y, recorrente: 0, extraordinario: 0 };
      if (d.recurring) r.recorrente += d.value * p.qty;
      else r.extraordinario += d.value * p.qty;
      map.set(y, r);
    }
  }
  return [...map.values()].sort((a, b) => a.year - b.year);
}
