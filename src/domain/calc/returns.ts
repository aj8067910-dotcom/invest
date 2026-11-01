// Rentabilidade da carteira.
// - TWR (time-weighted return, por cotização): neutraliza o efeito dos aportes e retiradas; é a
//   medida usada por fundos (CVM, Resolução 175/2022, cota diária) e pelo padrão GIPS (CFA Institute).
//   Convenção mensal: o fluxo do mês entra no INÍCIO do mês; r_m = (V_fim + proventos_m) ÷ (V_início + fluxo_m) − 1.
// - TIR/XIRR (money-weighted): retorno do dinheiro efetivamente investido, com as datas reais dos fluxos.
import type { Asset, Transaction } from '../types';
import { INCOME_TX } from '../types';
import { activeTransactions, isReceived } from '../ledger';
import type { Position } from './positions';
import { addMonths, monthKey, todayISO } from '../util';
import { D, Decimal, N, ZERO } from '../money';

export interface TwrPeriod {
  month: string;
  startValue: number;
  flow: number; // aporte líquido nos ativos (compras − vendas) no início do período
  endValue: number;
  income: number; // proventos e amortizações recebidos no período
}

/** TWR acumulada a partir de períodos encadeados. */
export function twr(periods: TwrPeriod[]): { total: number; monthly: { month: string; r: number; acc: number }[] } {
  let acc = new Decimal(1);
  const monthly: { month: string; r: number; acc: number }[] = [];
  for (const p of periods) {
    const base = D(p.startValue).plus(p.flow);
    if (base.lessThanOrEqualTo(0)) {
      monthly.push({ month: p.month, r: 0, acc: N(acc.minus(1)) });
      continue;
    }
    const r = D(p.endValue).plus(p.income).dividedBy(base).minus(1);
    acc = acc.times(r.plus(1));
    monthly.push({ month: p.month, r: N(r), acc: N(acc.minus(1)) });
  }
  return { total: N(acc.minus(1)), monthly };
}

/** XIRR: taxa anual que zera o valor presente dos fluxos (Newton com fallback em bissecção). */
export function xirr(flows: { date: string; value: number }[]): number | null {
  if (flows.length < 2 || !flows.some((f) => f.value < 0) || !flows.some((f) => f.value > 0)) return null;
  const t0 = new Date(flows[0].date + 'T12:00:00Z').getTime();
  const yrs = flows.map((f) => (new Date(f.date + 'T12:00:00Z').getTime() - t0) / (365 * 86400000));
  const npv = (r: number) => flows.reduce((s, f, i) => s + f.value / Math.pow(1 + r, yrs[i]), 0);
  const dnpv = (r: number) => flows.reduce((s, f, i) => s - (yrs[i] * f.value) / Math.pow(1 + r, yrs[i] + 1), 0);
  let r = 0.1;
  for (let k = 0; k < 60; k++) {
    const v = npv(r);
    const dv = dnpv(r);
    if (!Number.isFinite(v) || !Number.isFinite(dv) || dv === 0) break;
    const nr = r - v / dv;
    if (Math.abs(nr - r) < 1e-10 && nr > -0.9999) return nr;
    r = nr;
    if (r <= -0.9999) break;
  }
  // bissecção
  let lo = -0.9999;
  let hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Acumula uma série mensal de taxas (%/mês) entre dois meses (inclusive). */
export function accumulate(series: [string, number][] | undefined, fromMonth: string, toMonth: string): number | null {
  if (!series?.length) return null;
  const xs = series.filter(([m]) => m >= fromMonth && m <= toMonth);
  if (!xs.length) return null;
  return N(xs.reduce((a, [, v]) => a.times(D(v).dividedBy(100).plus(1)), new Decimal(1)).minus(1));
}

export interface ReturnsResult {
  twr: number | null;
  twrMonthly: { month: string; r: number; acc: number }[];
  xirr: number | null;
  from: string | null;
  cdi: number | null; // CDI acumulado no mesmo período
  approximated: string[]; // ativos avaliados a custo por falta de preço histórico
}

/**
 * Monta os períodos mensais a partir do livro e de preços de fim de mês.
 * `monthEndPrice(ticker, 'aaaa-mm')` devolve o preço de fechamento do mês (fonte: B3/Yahoo/Tesouro) ou null.
 */
export function portfolioReturns(
  assets: Asset[],
  positions: Record<string, Position>,
  txs: Transaction[],
  monthEndPrice: (ticker: string, month: string) => number | null,
  cdiMonthly?: [string, number][],
  asOf = todayISO(),
): ReturnsResult {
  const active = activeTransactions(txs).filter((t) => t.assetId);
  const empty: ReturnsResult = { twr: null, twrMonthly: [], xirr: null, from: null, cdi: null, approximated: [] };
  if (!active.length) return empty;
  const first = active.reduce((m, t) => (t.date < m ? t.date : m), active[0].date);
  const approximated = new Set<string>();
  const byAsset = assets.map((a) => ({ a, rows: positions[a.id]?.ledger || [] })).filter((x) => x.rows.length && !x.a.isReserve);
  const valueAt = (month: string, isCurrent: boolean) => {
    let v = ZERO;
    const end = month + '-31';
    for (const { a, rows } of byAsset) {
      let last = null as (typeof rows)[number] | null;
      for (const r of rows) if (r.tx.date <= end) last = r;
      if (!last || (last.qtyAfter <= 0 && last.costAfter <= 0)) continue;
      if (positions[a.id].valueOnly) {
        v = v.plus(last.costAfter);
        continue;
      }
      const px = isCurrent && a.quote.price ? a.quote.price : monthEndPrice(a.ticker, month);
      if (px === null || px === undefined) {
        approximated.add(a.ticker);
        v = v.plus(last.costAfter);
      } else v = v.plus(D(last.qtyAfter).times(px));
    }
    return v;
  };
  const periods: TwrPeriod[] = [];
  const cur = monthKey(asOf);
  let prevEnd = ZERO;
  for (let d = monthKey(first) + '-01'; monthKey(d) <= cur; d = addMonths(d, 1)) {
    const m = monthKey(d);
    let flow = ZERO;
    let income = ZERO;
    for (const t of active) {
      if (monthKey(t.date) !== m) continue;
      if (t.type === 'compra' || t.type === 'saldo_inicial' || t.type === 'subscricao') flow = flow.plus(t.amount);
      else if (t.type === 'venda' || t.type === 'leilao_fracao') flow = flow.minus(t.amount);
      else if ((INCOME_TX.includes(t.type) || t.type === 'amortizacao') && isReceived(t, asOf)) income = income.plus(t.amount);
    }
    const endV = valueAt(m, m === cur);
    periods.push({ month: m, startValue: N(prevEnd), flow: N(flow), endValue: N(endV), income: N(income) });
    prevEnd = endV;
  }
  const t = twr(periods);
  const flows = active
    .flatMap((x) => {
      if (x.type === 'compra' || x.type === 'saldo_inicial' || x.type === 'subscricao') return [{ date: x.date, value: -x.amount }];
      if (x.type === 'venda' || x.type === 'leilao_fracao') return [{ date: x.date, value: x.amount }];
      if ((INCOME_TX.includes(x.type) || x.type === 'amortizacao') && isReceived(x, asOf)) return [{ date: x.date, value: x.amount }];
      return [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  flows.push({ date: asOf, value: N(prevEnd) });
  return { twr: t.total, twrMonthly: t.monthly, xirr: xirr(flows), from: first, cdi: accumulate(cdiMonthly, monthKey(first), cur), approximated: [...approximated] };
}

/** Capital necessário para uma renda mensal com um DY anual: renda × 12 ÷ DY. */
export const capitalForIncome = (monthlyIncome: number, dyPct: number) => (dyPct > 0 ? N(D(monthlyIncome).times(12).dividedBy(D(dyPct).dividedBy(100))) : null);
