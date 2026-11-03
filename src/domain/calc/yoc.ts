// Yield on Cost, projeção de renda e compensação de quedas por proventos.
//
// Regras:
// - Custo de aquisição = custo da posição pelo preço médio da Receita (IN RFB 1.585/2015, art. 58):
//   compras com taxas, menos o custo médio das quantidades vendidas. Vem do mesmo livro da Central de Operações.
// - Recebido (realizado) = proventos lançados com data de pagamento até hoje, líquidos de IR.
//   Provisionado e projetado NUNCA entram como recebido.
// - Projetado = quantidade atual × DPA de referência LÍQUIDO (o mesmo do preço-teto), só recorrentes.
// - YoC = proventos anuais projetados ÷ custo de aquisição (nunca o valor de mercado).
import type { Asset, Settings, Transaction } from '../types';
import { INCOME_TX } from '../types';
import { D, Decimal, N, ZERO } from '../money';
import { addMonths, isNum, todayISO } from '../util';
import { activeTransactions, isReceived } from '../ledger';
import { computePositions, isHeld, type Position } from './positions';
import { netPerUnit, referenceDpa } from './bazin';

export const unitStep = (a: Asset) => (a.class === 'cripto' ? 1e-8 : a.class === 'tesouro' ? 0.01 : 1);

export interface ProjectedUnit {
  perUnit: number | null; // R$ por unidade ao ano, líquido
  label: string;
  kind: 'real' | 'estimativa' | 'ausente';
}

/** Provento anual LÍQUIDO por unidade usado em toda projeção (mesma base do preço-teto). */
export function projectedPerUnit(a: Asset, s: Settings, asOf = todayISO()): ProjectedUnit {
  if (a.class === 'tesouro' || a.class === 'cripto') return { perUnit: null, label: 'Sem proventos periódicos', kind: 'ausente' };
  const r = referenceDpa(a, s, asOf);
  if (isNum(r.value) && r.value > 0) return { perUnit: r.value, label: r.label, kind: r.kind === 'estimativa' ? 'estimativa' : 'real' };
  // sem anos completos: usa os últimos 12 meses
  const start = addMonths(asOf, -12);
  const v = a.distributions.filter((d) => d.recurring && d.type !== 'amortizacao' && d.exDate > start && d.exDate <= asOf).reduce((x, d) => x.plus(netPerUnit(d, a, s)), ZERO);
  return v.greaterThan(0) ? { perUnit: N(v), label: 'Últimos 12 meses (líquido)', kind: 'real' } : { perUnit: null, label: 'Sem histórico de proventos', kind: 'ausente' };
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Meses em que o ativo costuma pagar (últimos 24 meses, data de pagamento ou data-com). */
export function paymentCalendar(a: Asset, asOf = todayISO()): { months: number[]; perYear: number; label: string } {
  const start = addMonths(asOf, -24);
  const ds = a.distributions.filter((d) => d.recurring && d.type !== 'amortizacao' && d.exDate > start && d.exDate <= asOf);
  const set = new Set(ds.map((d) => Number((d.payDate || d.exDate).slice(5, 7))));
  const months = [...set].sort((x, y) => x - y);
  const perYear = new Set(ds.map((d) => (d.payDate || d.exDate).slice(0, 7))).size / 2;
  const label = !months.length ? 'sem histórico' : perYear >= 10 ? 'mensal' : `${months.map((m) => MONTHS[m - 1]).join(', ')} (~${Math.max(1, Math.round(perYear))}×/ano)`;
  return { months, perYear, label };
}

export interface YocRow {
  asset: Asset;
  qty: number;
  avgPrice: number;
  cost: number; // custo de aquisição atual
  marketValue: number;
  perUnit: number | null;
  basis: string;
  projectedAnnual: number;
  dyMarket: number | null; // projetado ÷ valor de mercado
  yoc: number | null; // projetado ÷ custo
  received: number; // total recebido (realizado) desde o início
  received12m: number;
  yocRealized12m: number | null; // recebido 12m ÷ custo
  firstBuy: string | null;
  buys: number;
}

export interface YocSummary {
  rows: YocRow[];
  cost: number;
  marketValue: number;
  projectedAnnual: number;
  projectedMonthly: number;
  yoc: number | null;
  dyMarket: number | null;
  received: number;
  received12m: number;
  avgMonthly12m: number;
  avgMonthlySinceStart: number;
  monthsSinceStart: number;
  incomeCost: number; // custo só dos ativos que pagam proventos
  yocIncomeAssets: number | null;
}

const monthsBetween = (a: string, b: string) => Math.max(1, (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)) + 1);

export function yocSummary(assets: Asset[], positions: Record<string, Position>, allTxs: Transaction[], s: Settings, asOf = todayISO()): YocSummary {
  const txs = activeTransactions(allTxs);
  const y1 = addMonths(asOf, -12);
  const received = txs.filter((t) => INCOME_TX.includes(t.type) && isReceived(t, asOf));
  const rows: YocRow[] = [];
  let cost = ZERO, mv = ZERO, proj = ZERO, incomeCost = ZERO;
  for (const a of assets) {
    const p = positions[a.id];
    const rec = received.filter((t) => t.assetId === a.id);
    const recAll = rec.reduce((x, t) => x.plus(D(t.amount)), ZERO);
    if (!isHeld(p) && recAll.isZero()) continue;
    if (a.isReserve) continue;
    const buys = txs.filter((t) => t.assetId === a.id && (t.type === 'compra' || t.type === 'saldo_inicial' || t.type === 'subscricao'));
    const u = projectedPerUnit(a, s, asOf);
    const qty = isHeld(p) ? p.qty : 0;
    const c = isHeld(p) ? D(p.costBasis) : ZERO;
    const m = isHeld(p) ? D(p.marketValue) : ZERO;
    const pa = u.perUnit ? D(u.perUnit).times(qty) : ZERO;
    const r12 = rec.filter((t) => t.date > y1).reduce((x, t) => x.plus(D(t.amount)), ZERO);
    rows.push({
      asset: a, qty, avgPrice: isHeld(p) ? p.avgPrice : 0, cost: N(c), marketValue: N(m), perUnit: u.perUnit, basis: u.label,
      projectedAnnual: N(pa),
      dyMarket: m.greaterThan(0) && pa.greaterThan(0) ? N(pa.dividedBy(m).times(100)) : null,
      yoc: c.greaterThan(0) && u.perUnit ? N(pa.dividedBy(c).times(100)) : null,
      received: N(recAll), received12m: N(r12),
      yocRealized12m: c.greaterThan(0) ? N(r12.dividedBy(c).times(100)) : null,
      firstBuy: buys.map((t) => t.date).sort()[0] || null, buys: buys.length,
    });
    cost = cost.plus(c); mv = mv.plus(m); proj = proj.plus(pa);
    if (pa.greaterThan(0)) incomeCost = incomeCost.plus(c);
  }
  rows.sort((x, y) => y.projectedAnnual - x.projectedAnnual || y.received - x.received);
  const recTotal = received.reduce((x, t) => x.plus(D(t.amount)), ZERO);
  const rec12 = received.filter((t) => t.date > y1).reduce((x, t) => x.plus(D(t.amount)), ZERO);
  const first = txs.map((t) => t.date).sort()[0] || asOf;
  const months = monthsBetween(first, asOf);
  return {
    rows, cost: N(cost), marketValue: N(mv), projectedAnnual: N(proj), projectedMonthly: N(proj.dividedBy(12)),
    yoc: cost.greaterThan(0) ? N(proj.dividedBy(cost).times(100)) : null,
    dyMarket: mv.greaterThan(0) ? N(proj.dividedBy(mv).times(100)) : null,
    received: N(recTotal), received12m: N(rec12), avgMonthly12m: N(rec12.dividedBy(12)),
    avgMonthlySinceStart: N(recTotal.dividedBy(months)), monthsSinceStart: months,
    incomeCost: N(incomeCost), yocIncomeAssets: incomeCost.greaterThan(0) ? N(proj.dividedBy(incomeCost).times(100)) : null,
  };
}

export interface YocPoint {
  month: string;
  cost: number;
  received12m: number;
  receivedMonth: number;
  yoc12m: number | null; // recebido nos 12 meses até o mês ÷ custo no fim do mês (realizado)
}

/**
 * Evolução histórica do YoC (REALIZADO): para cada fim de mês, proventos recebidos nos 12 meses
 * anteriores ÷ custo de aquisição naquela data. Usa só o que foi efetivamente pago.
 */
export function yocHistory(assets: Asset[], allTxs: Transaction[], asOf = todayISO(), assetId?: string): YocPoint[] {
  const txs = activeTransactions(allTxs);
  if (!txs.length) return [];
  const first = txs.map((t) => t.date).sort()[0];
  const out: YocPoint[] = [];
  const inc = txs.filter((t) => INCOME_TX.includes(t.type) && !(t.auto && !t.payDate) && (!assetId || t.assetId === assetId));
  const sel = assets.filter((a) => !a.isReserve && (!assetId || a.id === assetId));
  for (let m = first.slice(0, 7); m <= asOf.slice(0, 7); m = addMonths(m + '-15', 1).slice(0, 7)) {
    const end = endOfMonth(m) > asOf ? asOf : endOfMonth(m);
    const pos = computePositions(assets, txs.filter((t) => t.date <= end), end); // só o que existia até o fim do mês
    const cost = sel.reduce((x, a) => (isHeld(pos[a.id]) ? x.plus(D(pos[a.id].costBasis)) : x), ZERO);
    const from = addMonths(end, -12);
    const r12 = inc.filter((t) => t.date > from && t.date <= end).reduce((x, t) => x.plus(D(t.amount)), ZERO);
    const rm = inc.filter((t) => t.date.slice(0, 7) === m && t.date <= end).reduce((x, t) => x.plus(D(t.amount)), ZERO);
    out.push({ month: m, cost: N(cost), received12m: N(r12), receivedMonth: N(rm), yoc12m: cost.greaterThan(0) ? N(r12.dividedBy(cost).times(100)) : null });
  }
  return out;
}

function endOfMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// ───────────── simulação de aporte ─────────────

export interface AporteSim {
  qty: number;
  invested: number;
  dyUsed: number | null; // % sobre o preço de compra
  annual: number;
  monthlyEquivalent: number;
  perPayment: number | null;
  payments: { months: number[]; perYear: number; label: string };
  portfolioAnnualBefore: number;
  portfolioAnnualAfter: number;
  incomeIncreasePct: number | null;
  assetYocBefore: number | null;
  assetYocAfter: number | null;
  portfolioYocBefore: number | null;
  portfolioYocAfter: number | null;
}

export function simulateAporte(o: { asset: Asset; price: number; qty?: number | null; value?: number | null; dyPct: number | null; position?: Position; perUnit: number | null; summary: YocSummary; asOf?: string }): AporteSim {
  const step = unitStep(o.asset);
  const price = D(o.price);
  const qty = isNum(o.qty) && o.qty > 0 ? o.qty : isNum(o.value) && o.value > 0 ? N(D(o.value).dividedBy(price).dividedBy(step).floor().times(step)) : 0;
  const invested = D(qty).times(price);
  const annual = isNum(o.dyPct) ? invested.times(o.dyPct).dividedBy(100) : ZERO;
  const payments = paymentCalendar(o.asset, o.asOf);
  const held = isHeld(o.position) ? o.position! : null;
  const assetCost = held ? D(held.costBasis) : ZERO;
  const assetProj = held && o.perUnit ? D(o.perUnit).times(held.qty) : ZERO;
  const S = o.summary;
  const pct = (a: Decimal, b: Decimal) => (b.greaterThan(0) ? N(a.dividedBy(b).times(100)) : null);
  const before = D(S.projectedAnnual);
  return {
    qty, invested: N(invested), dyUsed: o.dyPct, annual: N(annual), monthlyEquivalent: N(annual.dividedBy(12)),
    perPayment: payments.perYear >= 0.5 ? N(annual.dividedBy(Math.max(1, Math.round(payments.perYear)))) : null,
    payments,
    portfolioAnnualBefore: N(before), portfolioAnnualAfter: N(before.plus(annual)),
    incomeIncreasePct: before.greaterThan(0) ? N(annual.dividedBy(before).times(100)) : null,
    assetYocBefore: pct(assetProj, assetCost), assetYocAfter: pct(assetProj.plus(annual), assetCost.plus(invested)),
    portfolioYocBefore: pct(before, D(S.cost)), portfolioYocAfter: pct(before.plus(annual), D(S.cost).plus(invested)),
  };
}

// ───────────── compensação de queda por proventos ─────────────

export interface RecoveryResult {
  dropPct: number;
  exposed: number;
  loss: number;
  annualIncome: number;
  monthlyIncome: number;
  months: number | null; // perda ÷ proventos mensais (ou simulação mês a mês com as opções)
  label: string;
}

/**
 * Tempo de compensação = perda simulada ÷ proventos mensais estimados.
 * Equivalência financeira: NÃO é a recuperação da cotação nem do patrimônio de mercado.
 * Opções (desligadas por padrão): reinvestir os proventos e aportes mensais, ambos comprando
 * ao preço já em queda; aumentam a renda mês a mês. Aportes não contam como compensação.
 */
export function recovery(o: { exposed: number; dropPct: number; annualIncome: number; reinvest?: boolean; monthlyContribution?: number }): RecoveryResult {
  const exposed = D(o.exposed);
  const loss = exposed.times(o.dropPct).dividedBy(100);
  const monthly = D(o.annualIncome).dividedBy(12);
  let months: number | null = null;
  if (loss.isZero()) months = 0;
  else if (monthly.greaterThan(0)) {
    const extra = o.reinvest || (o.monthlyContribution ?? 0) > 0;
    if (!extra) months = N(loss.dividedBy(monthly));
    else {
      // rendimento mensal sobre o preço em queda (o mesmo provento por ação, cotação menor)
      const after = exposed.minus(loss);
      const yM = after.greaterThan(0) ? D(o.annualIncome).dividedBy(after).dividedBy(12) : ZERO;
      let inc = monthly, acc = ZERO, t = 0, last = monthly;
      while (acc.lessThan(loss) && t < 1200) {
        t++;
        acc = acc.plus(inc);
        last = inc;
        const add = (o.reinvest ? inc : ZERO).plus(D(o.monthlyContribution ?? 0));
        inc = inc.plus(add.times(yM));
      }
      // fração do último mês que sobrou
      months = acc.greaterThanOrEqualTo(loss) ? t - N(acc.minus(loss).dividedBy(last)) : null;
    }
  }
  return { dropPct: o.dropPct, exposed: o.exposed, loss: N(loss), annualIncome: o.annualIncome, monthlyIncome: N(monthly), months, label: fmtMonths(months) };
}

export function fmtMonths(m: number | null): string {
  if (m === null) return 'sem proventos estimados';
  if (m <= 0) return '—';
  if (m < 12) return `${m.toFixed(1).replace('.', ',')} meses`;
  let y = Math.floor(m / 12);
  let r = Math.round(m - y * 12);
  if (r === 12) { y++; r = 0; }
  return `${y} ${y === 1 ? 'ano' : 'anos'}${r ? ` e ${r} ${r === 1 ? 'mês' : 'meses'}` : ''} (${m.toFixed(1).replace('.', ',')} meses)`;
}

// ───────────── número mágico (efeito bola de neve) ─────────────

export interface Snowball {
  price: number;
  monthlyPerUnit: number | null; // rendimento mensal líquido por cota usado na conta
  basis: string;
  lastPerUnit: number | null;
  magic: number | null; // cotas para que 1 mês de rendimento compre 1 cota nova
  magicLast: number | null; // idem, usando só o último rendimento
  held: number;
  missing: number | null;
  costMissing: number | null;
  progress: number | null; // %
  monthsWithContribution: number | null; // aportando + reinvestindo tudo, à cotação atual
}

/**
 * Número mágico = cotação ÷ rendimento mensal por cota, arredondado para cima. A partir dele, o rendimento
 * de cada mês compra ao menos uma cota nova sem dinheiro novo. Base: média dos rendimentos recorrentes
 * líquidos dos últimos 12 meses ÷ 12 (mais estável que o último pagamento, que também é mostrado).
 */
export function snowball(a: Asset, s: Settings, held: number, monthlyContribution: number, asOf = todayISO()): Snowball | null {
  const price = isNum(a.quote.price) && a.quote.price > 0 ? a.quote.price : null;
  if (!price) return null;
  const start = addMonths(asOf, -12);
  const rec = a.distributions.filter((d) => d.recurring && d.type !== 'amortizacao' && d.exDate <= asOf).sort((x, y) => x.exDate.localeCompare(y.exDate));
  const last = rec.length ? N(netPerUnit(rec[rec.length - 1], a, s)) : null;
  const y12 = rec.filter((d) => d.exDate > start).reduce((x, d) => x.plus(netPerUnit(d, a, s)), ZERO);
  const monthly = y12.greaterThan(0) ? N(y12.dividedBy(12)) : last;
  const basis = y12.greaterThan(0) ? 'média dos últimos 12 meses (líquida) ÷ 12' : 'último rendimento';
  const magicOf = (m: number | null) => (m && m > 0 ? N(D(price).dividedBy(m).ceil()) : null);
  const magic = magicOf(monthly);
  const have = Math.floor(held);
  const missing = magic === null ? null : Math.max(0, magic - have);
  let months: number | null = null;
  if (magic !== null && missing === 0) months = 0;
  else if (magic !== null && monthly && monthlyContribution > 0) {
    // aporta todo mês e reinveste todo o rendimento; sobra fica em caixa para o mês seguinte
    let q = have, cash = 0, t = 0;
    while (q < magic && t < 1200) {
      t++;
      cash += monthlyContribution + q * monthly;
      const buy = Math.floor(cash / price);
      q += buy;
      cash -= buy * price;
    }
    months = q >= magic ? t : null;
  }
  return {
    price, monthlyPerUnit: monthly, basis, lastPerUnit: last, magic, magicLast: magicOf(last), held: have,
    missing, costMissing: missing === null ? null : N(D(missing).times(price)),
    progress: magic ? Math.min(100, (have / magic) * 100) : null, monthsWithContribution: months,
  };
}
