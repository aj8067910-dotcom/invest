// Séries históricas reconstruídas a partir do livro de operações.
import type { Transaction } from '../types';
import { INCOME_TX } from '../types';
import type { Position } from './positions';
import { addMonths, monthKey, todayISO } from '../util';

export interface CashMonth {
  month: string;
  aportes: number; // dinheiro novo externo
  retiradas: number;
  reinvestido: number; // proventos reaplicados (não é dinheiro novo)
  compras: number;
  vendas: number;
  proventos: number;
}

const emptyMonth = (month: string): CashMonth => ({ month, aportes: 0, retiradas: 0, reinvestido: 0, compras: 0, vendas: 0, proventos: 0 });

export function monthlyCashflows(txs: Transaction[], asOf = todayISO()): CashMonth[] {
  if (!txs.length) return [];
  const first = txs.reduce((m, t) => (t.date < m ? t.date : m), txs[0].date);
  const rows: CashMonth[] = [];
  const idx = new Map<string, number>();
  for (let d = monthKey(first) + '-01'; monthKey(d) <= monthKey(asOf); d = addMonths(d, 1)) {
    idx.set(monthKey(d), rows.length);
    rows.push(emptyMonth(monthKey(d)));
  }
  for (const t of txs) {
    const i = idx.get(monthKey(t.date));
    if (i === undefined) continue;
    const r = rows[i];
    if (t.type === 'aporte') r.aportes += t.amount;
    else if (t.type === 'retirada') r.retiradas += t.amount;
    else if (t.type === 'reinvestimento') r.reinvestido += t.amount;
    else if (t.type === 'compra' || t.type === 'subscricao') {
      r.compras += t.amount;
      if (t.reinvest) r.reinvestido += t.amount;
    } else if (t.type === 'venda') r.vendas += t.amount;
    else if (INCOME_TX.includes(t.type)) r.proventos += t.amount;
  }
  return rows;
}

export function yearlyCashflows(months: CashMonth[]): (CashMonth & { year: string })[] {
  const map = new Map<string, CashMonth & { year: string }>();
  for (const m of months) {
    const y = m.month.slice(0, 4);
    const r = map.get(y) || { ...emptyMonth(y), year: y };
    r.aportes += m.aportes;
    r.retiradas += m.retiradas;
    r.reinvestido += m.reinvestido;
    r.compras += m.compras;
    r.vendas += m.vendas;
    r.proventos += m.proventos;
    map.set(y, r);
  }
  return [...map.values()];
}

/** Custo investido ao fim de cada mês (soma dos custos das posições), reconstruído pelo histórico. */
export function investedSeries(positions: Record<string, Position>, asOf = todayISO()): { month: string; invested: number; aportesAcum: number }[] {
  const events: { date: string; assetId: string; cost: number }[] = [];
  for (const p of Object.values(positions)) for (const l of p.ledger) events.push({ date: l.tx.date, assetId: p.assetId, cost: l.costAfter });
  if (!events.length) return [];
  events.sort((a, b) => a.date.localeCompare(b.date));
  const cur = new Map<string, number>();
  const out: { month: string; invested: number; aportesAcum: number }[] = [];
  let i = 0;
  for (let d = monthKey(events[0].date) + '-01'; monthKey(d) <= monthKey(asOf); d = addMonths(d, 1)) {
    const m = monthKey(d);
    while (i < events.length && monthKey(events[i].date) <= m) {
      cur.set(events[i].assetId, events[i].cost);
      i++;
    }
    out.push({ month: m, invested: [...cur.values()].reduce((s, v) => s + v, 0), aportesAcum: 0 });
  }
  return out;
}
