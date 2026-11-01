// Reconstrução da carteira a partir do livro de lançamentos (fonte única da verdade).
//
// Fundamentos:
// - Preço médio ponderado com custos (critério da Receita Federal — IN RFB 1.585/2015, art. 58):
//   PM_novo = (Q_atual × PM_atual + Q_compra × P_compra + custos) ÷ (Q_atual + Q_compra).
// - Venda não altera o PM; resultado realizado = (Q × P_venda − custos) − Q × PM.
// - Day trade: compra e venda do mesmo ativo no mesmo pregão; apurado em cesta própria
//   (IN RFB 1.585/2015, art. 56, §1º), usando os preços médios do dia.
// - Desdobramento/grupamento: muda a quantidade, mantém o custo total. Bonificação: soma ao custo
//   o valor atribuído pela companhia (Lei 9.249/1995, art. 10, parágrafo único). Amortização de FII:
//   devolução de capital, reduz o custo. Troca de ticker, incorporação e cisão preservam o custo.
// Todo cálculo em Decimal; números só na saída (exibição).
import type { Asset, AssetClass, Transaction } from '../types';
import { INCOME_TX, TRANSFER_EVENTS } from '../types';
import { activeTransactions, isReceived, txOrder } from '../ledger';
import { D, Decimal, N, ZERO } from '../money';
import { isNum, todayISO } from '../util';

export type Basket = 'acoes' | 'day_trade' | 'fii' | 'etf' | 'cripto' | 'renda_fixa';
export const BASKET_LABEL: Record<Basket, string> = {
  acoes: 'Ações (operações comuns)',
  day_trade: 'Day trade',
  fii: 'FIIs',
  etf: 'ETFs',
  cripto: 'Criptoativos',
  renda_fixa: 'Renda fixa',
};
export const basketOf = (c: AssetClass): Basket => (c === 'fii' ? 'fii' : c === 'etf' ? 'etf' : c === 'cripto' ? 'cripto' : c === 'tesouro' ? 'renda_fixa' : 'acoes');

export interface LedgerRow {
  tx: Transaction;
  qtyAfter: number;
  avgAfter: number;
  costAfter: number;
  realized: number; // resultado realizado nesta operação
  basket?: Basket;
  note?: string;
}

export interface Divergence {
  txId: string;
  date: string;
  declared: number;
  computed: number;
}

export interface Review {
  txId: string;
  date: string;
  message: string;
}

export interface RealizedEntry {
  date: string;
  basket: Basket;
  value: number;
  sales: number; // valor de venda (para limites de isenção)
}

export interface Position {
  assetId: string;
  qty: number;
  avgPrice: number;
  costBasis: number;
  qtyBought: number;
  qtySold: number;
  totalBought: number;
  totalSold: number;
  realized: number;
  realizedByBasket: Partial<Record<Basket, number>>;
  realizedEntries: RealizedEntry[];
  income: number; // proventos recebidos (líquidos, data de pagamento ≤ hoje)
  incomeProvisioned: number; // proventos provisionados (data-com passada, pagamento futuro)
  amortized: number;
  reinvested: number;
  price: number | null;
  hasQuote: boolean;
  valueOnly: boolean;
  marketValue: number;
  unrealized: number | null;
  totalReturn: number;
  totalReturnPct: number | null;
  firstBuy: string | null;
  ledger: LedgerRow[];
  divergences: Divergence[];
  reviews: Review[];
}

const EPS = new Decimal('1e-9');
const isTrade = (t: Transaction) => (t.type === 'compra' || t.type === 'venda') && !t.rfMovement;

/**
 * Processa o livro de um ativo. `txs` já filtrado (ativos, sem estornados) e ordenado.
 * Devolve também as entradas sintéticas para outros ativos (troca, incorporação, cisão).
 */
function run(asset: Asset, txs: Transaction[], asOf: string) {
  let qty = ZERO;
  let cost = ZERO;
  let qtyBought = ZERO;
  let qtySold = ZERO;
  let totalBought = ZERO;
  let totalSold = ZERO;
  let income = ZERO;
  let provisioned = ZERO;
  let amortized = ZERO;
  let reinvested = ZERO;
  let valueOnly = false;
  let firstBuy: string | null = null;
  const realizedEntries: RealizedEntry[] = [];
  const ledger: LedgerRow[] = [];
  const divergences: Divergence[] = [];
  const reviews: Review[] = [];
  const outgoing: Transaction[] = [];
  const review = (t: Transaction, message: string) => reviews.push({ txId: t.id, date: t.date, message });
  const isRf = asset.class === 'tesouro';
  const swing = basketOf(asset.class);
  const realize = (t: Transaction, basket: Basket, value: Decimal, sales: Decimal) => realizedEntries.push({ date: t.date, basket, value: N(value), sales: N(sales) });

  const net = (t: Transaction, sell: boolean) =>
    isNum(t.amount) && t.amount > 0 ? D(t.amount) : D(t.qty).times(D(t.price)).plus(sell ? D(t.fees).negated() : D(t.fees));

  // agrupa por data para identificar day trade
  let i = 0;
  while (i < txs.length) {
    const date = txs[i].date;
    let j = i;
    while (j < txs.length && txs[j].date === date) j++;
    const group = txs.slice(i, j);
    i = j;
    const buys = group.filter((t) => t.type === 'compra' && isTrade(t) && D(t.qty).greaterThan(0));
    const sells = group.filter((t) => t.type === 'venda' && isTrade(t) && D(t.qty).greaterThan(0));
    const dayTrade = !isRf && buys.length > 0 && sells.length > 0;
    let dtDone = false;

    for (const t of group) {
      const q = D(t.qty);
      let realizedHere = ZERO;
      let basket: Basket | undefined;
      let note: string | undefined;
      if (t.review) review(t, t.review);

      if (dayTrade && (buys.includes(t) || sells.includes(t))) {
        if (!dtDone) {
          dtDone = true;
          const bq = buys.reduce((s, x) => s.plus(D(x.qty)), ZERO);
          const bc = buys.reduce((s, x) => s.plus(net(x, false)), ZERO);
          const sq = sells.reduce((s, x) => s.plus(D(x.qty)), ZERO);
          const sv = sells.reduce((s, x) => s.plus(net(x, true)), ZERO);
          const dtQty = Decimal.min(bq, sq);
          const buyAvg = bc.dividedBy(bq);
          const sellAvg = sv.dividedBy(sq);
          const dt = dtQty.times(sellAvg.minus(buyAvg));
          realize(t, 'day_trade', dt, dtQty.times(sellAvg));
          realizedHere = dt;
          basket = 'day_trade';
          qtyBought = qtyBought.plus(bq);
          totalBought = totalBought.plus(bc);
          qtySold = qtySold.plus(sq);
          totalSold = totalSold.plus(sv);
          // sobra de compra entra na posição; sobra de venda sai da posição anterior ao PM
          const restBuy = bq.minus(dtQty);
          const restSell = sq.minus(dtQty);
          if (restBuy.greaterThan(0)) {
            qty = qty.plus(restBuy);
            cost = cost.plus(restBuy.times(buyAvg));
          }
          if (restSell.greaterThan(0)) {
            if (qty.lessThanOrEqualTo(EPS)) review(t, `Venda de ${N(restSell)} além do day trade sem posição anterior.`);
            const s = Decimal.min(restSell, qty);
            if (s.greaterThan(0)) {
              const avg = cost.dividedBy(qty);
              const r = s.times(sellAvg).minus(avg.times(s));
              realize(t, swing, r, s.times(sellAvg));
              realizedHere = realizedHere.plus(r);
              cost = cost.minus(avg.times(s));
              qty = qty.minus(s);
            }
          }
          firstBuy ||= date;
          note = `day trade de ${N(dtQty)} (resultado ${N(dt).toFixed(2)})`;
        }
      } else
        switch (t.type) {
          case 'compra':
          case 'saldo_inicial':
          case 'subscricao':
          case 'direito_subscricao': {
            const value = t.type === 'direito_subscricao' ? D(t.amount) : net(t, false);
            if (q.lessThanOrEqualTo(0)) {
              if (isRf || t.rfMovement) {
                valueOnly = true;
                cost = cost.plus(value);
                totalBought = totalBought.plus(value);
                note = 'aplicação por valor (sem quantidade)';
              } else review(t, 'Lançamento sem quantidade: não entrou na posição.');
            } else {
              qty = qty.plus(q);
              cost = cost.plus(value);
              qtyBought = qtyBought.plus(q);
              totalBought = totalBought.plus(value);
              if (t.type === 'subscricao' && !value.greaterThan(0)) review(t, 'Subscrição sem preço de emissão: entrou com custo zero.');
            }
            if (t.reinvest) reinvested = reinvested.plus(value);
            if (t.type === 'compra' || t.type === 'saldo_inicial') firstBuy ||= t.date;
            break;
          }
          case 'venda':
          case 'leilao_fracao': {
            const total = t.rfMovement === 'resgate_total' || t.rfMovement === 'vencimento';
            if ((valueOnly && q.lessThanOrEqualTo(0)) || (total && q.lessThanOrEqualTo(0))) {
              const proceeds = D(t.amount);
              if (total) {
                realizedHere = proceeds.minus(cost);
                realize(t, swing, realizedHere, proceeds);
                cost = ZERO;
                qty = ZERO;
                valueOnly = false;
              } else {
                cost = cost.minus(Decimal.min(cost, proceeds));
                review(t, 'Resgate parcial sem quantidade: custo reduzido pelo valor resgatado; resultado não calculado.');
              }
              totalSold = totalSold.plus(proceeds);
              break;
            }
            if (q.lessThanOrEqualTo(0)) {
              review(t, 'Venda sem quantidade: não processada.');
              break;
            }
            if (qty.lessThanOrEqualTo(EPS)) {
              review(t, `Venda de ${N(q)} sem posição registrada antes de ${t.date}. O histórico da B3 começa em 01/11/2019: lance a POSIÇÃO INICIAL (saldo inicial) com o custo de aquisição.`);
              break;
            }
            const sellQty = Decimal.min(q, qty);
            if (q.greaterThan(qty.plus(EPS))) review(t, `Venda de ${N(q)} maior que a posição de ${N(qty)}. Processada só a quantidade existente; verifique compras ou saldo inicial ausentes.`);
            const avg = cost.dividedBy(qty);
            const proceeds = net(t, true).times(sellQty).dividedBy(q);
            realizedHere = proceeds.minus(avg.times(sellQty));
            basket = swing;
            realize(t, swing, realizedHere, proceeds);
            totalSold = totalSold.plus(proceeds);
            cost = cost.minus(avg.times(sellQty));
            qty = qty.minus(sellQty);
            qtySold = qtySold.plus(sellQty);
            if (qty.lessThan(EPS)) {
              qty = ZERO;
              cost = ZERO;
            }
            break;
          }
          case 'desdobramento':
          case 'grupamento': {
            const before = qty;
            if (isNum(t.factor) && t.factor > 0) {
              const f = D(t.factor);
              qty = t.type === 'desdobramento' ? qty.times(f) : f.greaterThanOrEqualTo(1) ? qty.dividedBy(f) : qty.times(f);
            } else if (isNum(t.qty) && t.qty !== 0) qty = qty.plus(t.type === 'grupamento' ? q.abs().negated() : q.abs());
            else review(t, 'Desdobramento/grupamento sem fator nem quantidade: ignorado.');
            if (t.type === 'grupamento' && asset.class !== 'cripto' && !qty.isInteger())
              review(t, `Grupamento gerou fração (${qty.toFixed(4)}). Frações vão a leilão: lance o "Leilão de frações" com o valor recebido.`);
            if (isNum(t.qtyBefore) && D(t.qtyBefore).minus(before).abs().greaterThan(EPS)) review(t, `Quantidade anterior informada (${t.qtyBefore}) difere da calculada (${N(before)}).`);
            note = `${N(before)} → ${N(qty)}`;
            break;
          }
          case 'bonificacao': {
            let added = q.greaterThan(0) ? q : ZERO;
            if (added.isZero() && isNum(t.factor) && t.factor > 0) added = qty.times(t.factor > 1 ? D(t.factor).dividedBy(100) : D(t.factor)).floor();
            if (added.isZero()) {
              review(t, 'Bonificação sem quantidade nem fator: ignorada.');
              break;
            }
            const attributed = D(t.amount).greaterThan(0) ? D(t.amount) : added.times(D(t.price));
            if (!attributed.greaterThan(0)) review(t, 'Bonificação sem custo atribuído: ações somadas com custo zero. Informe o custo unitário divulgado pela empresa.');
            qty = qty.plus(added);
            cost = cost.plus(attributed);
            qtyBought = qtyBought.plus(added);
            note = `+${N(added)} ações bonificadas`;
            break;
          }
          case 'troca_ticker':
          case 'incorporacao':
          case 'cisao': {
            if ((t as any).incoming) {
              qty = qty.plus(q);
              cost = cost.plus(D(t.amount));
              note = `entrada por ${t.type.replace('_', ' ')}`;
              break;
            }
            if (!t.targetAssetId) {
              review(t, 'Evento sem ativo de destino: posição não transferida.');
              break;
            }
            const f = isNum(t.factor) && t.factor > 0 ? D(t.factor) : D(1);
            if (t.type === 'cisao') {
              const share = D(t.costShare).dividedBy(100);
              const movedCost = cost.times(share);
              outgoing.push({ ...t, id: t.id + ':in', assetId: t.targetAssetId, qty: N(qty.times(f)), amount: N(movedCost), incoming: true } as Transaction);
              cost = cost.minus(movedCost);
              note = `cisão: ${N(share.times(100))}% do custo para o novo ativo`;
            } else {
              outgoing.push({ ...t, id: t.id + ':in', assetId: t.targetAssetId, qty: N(qty.times(f)), amount: N(cost), incoming: true } as Transaction);
              note = `${N(qty)} → ${N(qty.times(f))} no ativo de destino (custo preservado)`;
              qty = ZERO;
              cost = ZERO;
            }
            break;
          }
          case 'evento_outro':
          case 'ajuste': {
            if (!isNum(t.qty) || t.qty === 0) {
              if (t.type === 'ajuste') review(t, 'Ajuste sem quantidade: ignorado.');
              break;
            }
            const avg = qty.greaterThan(EPS) ? cost.dividedBy(qty) : ZERO;
            if (q.greaterThan(0)) cost = cost.plus(isNum(t.price) ? q.times(t.price) : D(t.amount));
            else cost = Decimal.max(ZERO, cost.minus(avg.times(Decimal.min(q.negated(), qty))));
            qty = Decimal.max(ZERO, qty.plus(q));
            review(t, `${t.type === 'ajuste' ? 'Ajuste manual' : 'Evento'} de ${N(q)} na quantidade: confira o efeito no custo.`);
            break;
          }
          case 'amortizacao':
            if (isReceived(t, asOf)) {
              cost = Decimal.max(ZERO, cost.minus(D(t.amount)));
              amortized = amortized.plus(D(t.amount));
            } else provisioned = provisioned.plus(D(t.amount));
            break;
          case 'transferencia':
            note = `custódia ${t.fromInstitution || '?'} → ${t.toInstitution || '?'} (sem efeito na posição)`;
            break;
          default:
            if (INCOME_TX.includes(t.type)) {
              if (isReceived(t, asOf)) income = income.plus(D(t.amount));
              else provisioned = provisioned.plus(D(t.amount));
            }
        }
      if (isNum(t.declaredPosition) && (t.type === 'compra' || t.type === 'venda' || t.type === 'saldo_inicial') && D(t.declaredPosition).minus(qty).abs().greaterThan(EPS))
        divergences.push({ txId: t.id, date: t.date, declared: t.declaredPosition, computed: N(qty) });
      ledger.push({ tx: t, qtyAfter: N(qty), avgAfter: qty.greaterThan(EPS) ? N(cost.dividedBy(qty)) : 0, costAfter: N(cost), realized: N(realizedHere), basket, note });
    }
  }

  const price = isNum(asset.quote.price) ? asset.quote.price : null;
  const hasQuote = price !== null && !valueOnly;
  const marketValue = hasQuote ? qty.times(price!) : cost;
  const unrealized = hasQuote ? marketValue.minus(cost) : null;
  const realized = realizedEntries.reduce((s, r) => s.plus(r.value), ZERO);
  const byBasket: Partial<Record<Basket, number>> = {};
  for (const r of realizedEntries) byBasket[r.basket] = N(D(byBasket[r.basket] || 0).plus(r.value));
  const totalReturn = (unrealized ?? ZERO).plus(realized).plus(income);
  const position: Position = {
    assetId: asset.id,
    qty: N(qty),
    avgPrice: qty.greaterThan(EPS) ? N(cost.dividedBy(qty)) : 0,
    costBasis: N(cost),
    qtyBought: N(qtyBought),
    qtySold: N(qtySold),
    totalBought: N(totalBought),
    totalSold: N(totalSold),
    realized: N(realized),
    realizedByBasket: byBasket,
    realizedEntries,
    income: N(income),
    incomeProvisioned: N(provisioned),
    amortized: N(amortized),
    reinvested: N(reinvested),
    price,
    hasQuote,
    valueOnly: valueOnly && cost.greaterThan(0),
    marketValue: N(marketValue),
    unrealized: unrealized ? N(unrealized) : null,
    totalReturn: N(totalReturn),
    totalReturnPct: totalBought.greaterThan(0) ? N(totalReturn.dividedBy(totalBought).times(100)) : null,
    firstBuy,
    ledger,
    divergences,
    reviews,
  };
  return { position, outgoing };
}

/** Uma posição isolada (sem eventos vindos de outros ativos). */
export function computePosition(asset: Asset, txs: Transaction[], preSorted = false, asOf = todayISO()): Position {
  const list = (preSorted ? txs : activeTransactions(txs).filter((t) => t.assetId === asset.id)).slice().sort(txOrder);
  return run(asset, list, asOf).position;
}

/**
 * Livro por ativo já com as entradas de troca de ticker, incorporação e cisão vindas de outros ativos.
 * Processa os ativos de origem antes dos de destino.
 */
export function expandLedger(assets: Asset[], txs: Transaction[], asOf = todayISO()) {
  const active = activeTransactions(txs);
  const by = new Map<string, Transaction[]>();
  for (const t of active) if (t.assetId) (by.get(t.assetId) || by.set(t.assetId, []).get(t.assetId)!).push(t);
  const targets = new Map<string, Set<string>>(); // destino → origens
  for (const t of active) if (TRANSFER_EVENTS.includes(t.type) && t.targetAssetId && t.assetId) (targets.get(t.targetAssetId) || targets.set(t.targetAssetId, new Set()).get(t.targetAssetId)!).add(t.assetId);
  const done = new Set<string>();
  const out = new Map<string, Position>();
  const lists = new Map<string, Transaction[]>();
  let pending = assets.slice();
  let guard = assets.length + 2;
  while (pending.length && guard-- > 0) {
    const ready = pending.filter((a) => [...(targets.get(a.id) || [])].every((src) => done.has(src) || src === a.id));
    const batch = ready.length ? ready : pending; // ciclo: processa assim mesmo
    for (const a of batch) {
      const list = (by.get(a.id) || []).slice().sort(txOrder);
      lists.set(a.id, list);
      const r = run(a, list, asOf);
      out.set(a.id, r.position);
      for (const o of r.outgoing) (by.get(o.assetId!) || by.set(o.assetId!, []).get(o.assetId!)!).push(o);
      done.add(a.id);
    }
    pending = pending.filter((a) => !done.has(a.id));
  }
  return { positions: out, lists };
}

export const isHeld = (p: Position | undefined) => !!p && (p.qty > 1e-9 || (p.valueOnly && p.costBasis > 0));

export function computePositions(assets: Asset[], txs: Transaction[], asOf = todayISO()) {
  const { positions } = expandLedger(assets, txs, asOf);
  const map: Record<string, Position> = {};
  for (const a of assets) map[a.id] = positions.get(a.id)!;
  return map;
}

/** Quantidade em carteira no FECHAMENTO do pregão `date` (inclui operações com data de pregão ≤ date). */
export function positionAt(asset: Asset, list: Transaction[], date: string): number {
  const upTo = list.filter((t) => t.date <= date && !INCOME_TX.includes(t.type) && t.type !== 'amortizacao');
  return run(asset, upTo, date).position.qty;
}

export interface PortfolioTotals {
  marketValue: number;
  costBasis: number;
  income: number;
  incomeProvisioned: number;
  realized: number;
  unrealized: number;
  missingQuotes: string[];
  deposits: number; // aportes externos (bruto)
  withdrawals: number;
  netContributed: number; // capital aportado = aportes − retiradas (reinvestimento não conta)
  accumulatedResult: number; // patrimônio + retiradas − aportes
  reinvestedIncome: number;
  cash: number;
}

export function portfolioTotals(assets: Asset[], positions: Record<string, Position>, txs: Transaction[]): PortfolioTotals {
  let mv = ZERO;
  let cb = ZERO;
  let inc = ZERO;
  let prov = ZERO;
  let real = ZERO;
  let unr = ZERO;
  const missingQuotes: string[] = [];
  for (const a of assets) {
    const p = positions[a.id];
    if (!p) continue;
    inc = inc.plus(p.income);
    prov = prov.plus(p.incomeProvisioned);
    real = real.plus(p.realized);
    if (!isHeld(p) || a.isReserve) continue;
    mv = mv.plus(p.marketValue);
    cb = cb.plus(p.costBasis);
    unr = unr.plus(p.unrealized ?? 0);
    if (!p.hasQuote) missingQuotes.push(a.ticker);
  }
  const active = activeTransactions(txs);
  const sum = (type: Transaction['type']) => active.filter((t) => t.type === type).reduce((s, t) => s.plus(D(t.amount)), ZERO);
  const deposits = sum('aporte');
  const withdrawals = sum('retirada');
  const reinvestedIncome = sum('reinvestimento').plus(active.filter((t) => t.type === 'compra' && t.reinvest).reduce((s, t) => s.plus(D(t.amount)), ZERO));
  const buys = sum('compra').plus(sum('subscricao'));
  const sells = sum('venda').plus(sum('leilao_fracao'));
  const amort = sum('amortizacao');
  const cash = deposits.greaterThan(0) ? deposits.minus(withdrawals).plus(inc).plus(sells).plus(amort).minus(buys) : ZERO;
  return {
    marketValue: N(mv),
    costBasis: N(cb),
    income: N(inc),
    incomeProvisioned: N(prov),
    realized: N(real),
    unrealized: N(unr),
    missingQuotes,
    deposits: N(deposits),
    withdrawals: N(withdrawals),
    netContributed: N(deposits.minus(withdrawals)),
    accumulatedResult: N(mv.plus(withdrawals).minus(deposits)),
    reinvestedIncome: N(reinvestedIncome),
    cash: N(cash),
  };
}
