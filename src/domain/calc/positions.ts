import type { Asset, Transaction } from '../types';
import { INCOME_TX } from '../types';
import { txOrder } from '../ledger';
import { isNum } from '../util';

export interface LedgerRow {
  tx: Transaction;
  qtyAfter: number;
  avgAfter: number;
  costAfter: number;
  realized: number; // resultado realizado nesta operação
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

export interface Position {
  assetId: string;
  qty: number;
  avgPrice: number; // preço médio (inclui taxas)
  costBasis: number; // custo da posição atual
  qtyBought: number;
  qtySold: number;
  totalBought: number; // soma de todas as aquisições
  totalSold: number;
  realized: number; // lucro/prejuízo realizado em vendas
  income: number; // proventos recebidos (líquidos)
  amortized: number; // capital devolvido por amortizações
  reinvested: number; // compras feitas com proventos
  price: number | null;
  hasQuote: boolean;
  valueOnly: boolean; // renda fixa lançada só por valor (sem quantidade): avaliada a custo
  marketValue: number;
  unrealized: number | null;
  totalReturn: number;
  totalReturnPct: number | null;
  firstBuy: string | null;
  ledger: LedgerRow[];
  divergences: Divergence[];
  reviews: Review[];
}

const EPS = 1e-9;

/**
 * Reconstrói a posição de um ativo processando o histórico em ordem cronológica
 * (método do preço médio, padrão da Receita Federal):
 * - compras e saldo inicial somam quantidade e custo (com taxas); vendas não mudam o preço médio;
 * - desdobramento/grupamento mudam a quantidade sem mudar o custo; bonificação soma o custo atribuído;
 * - amortização devolve capital (reduz custo); proventos são renda e não mexem na posição;
 * - transferência de custódia não altera quantidade nem custo;
 * - o que não pode ser calculado com segurança vai para a lista de revisão.
 */
export function computePosition(asset: Asset, txs: Transaction[], preSorted = false): Position {
  const list = (preSorted ? txs : txs.filter((t) => t.assetId === asset.id)).slice().sort(txOrder);
  let qty = 0;
  let cost = 0;
  let qtyBought = 0;
  let qtySold = 0;
  let totalBought = 0;
  let totalSold = 0;
  let realized = 0;
  let income = 0;
  let amortized = 0;
  let reinvested = 0;
  let valueOnly = false;
  let firstBuy: string | null = null;
  const ledger: LedgerRow[] = [];
  const divergences: Divergence[] = [];
  const reviews: Review[] = [];
  const review = (t: Transaction, message: string) => reviews.push({ txId: t.id, date: t.date, message });
  const isRf = asset.class === 'tesouro';

  for (const t of list) {
    const q = isNum(t.qty) ? t.qty : 0;
    let realizedHere = 0;
    let note: string | undefined;
    if (t.review) review(t, t.review);

    switch (t.type) {
      case 'compra':
      case 'saldo_inicial':
      case 'subscricao': {
        const value = isNum(t.amount) && t.amount > 0 ? t.amount : q * (t.price ?? 0) + (t.fees ?? 0);
        if (q <= 0) {
          if (isRf || t.rfMovement) {
            valueOnly = true; // aplicação em renda fixa informada só por valor
            cost += value;
            totalBought += value;
            note = 'aplicação por valor (sem quantidade)';
          } else review(t, `${t.type === 'subscricao' ? 'Subscrição' : 'Compra'} sem quantidade: não entrou na posição.`);
        } else {
          qty += q;
          cost += value;
          qtyBought += q;
          totalBought += value;
          if (t.type === 'subscricao' && !(value > 0)) review(t, 'Subscrição sem preço/valor: ações somadas com custo zero (preço médio subestimado).');
        }
        if (t.reinvest) reinvested += value;
        if (t.type !== 'subscricao') firstBuy ||= t.date;
        break;
      }
      case 'venda': {
        const total = t.rfMovement === 'resgate_total' || t.rfMovement === 'vencimento';
        if ((valueOnly && q <= 0) || (total && q <= 0)) {
          // resgate de renda fixa por valor
          const proceeds = t.amount;
          if (total) {
            realizedHere = proceeds - cost;
            cost = 0;
            qty = 0;
            valueOnly = false;
          } else {
            const reduce = Math.min(cost, proceeds);
            cost -= reduce;
            review(t, 'Resgate parcial sem quantidade: custo reduzido pelo valor resgatado; resultado não calculado.');
          }
          totalSold += proceeds;
          break;
        }
        if (q <= 0) {
          review(t, 'Venda sem quantidade: não processada.');
          break;
        }
        if (qty <= EPS) {
          review(t, `Venda de ${q} sem posição registrada antes de ${t.date}. Falta histórico anterior? Lance um saldo inicial.`);
          break;
        }
        const sellQty = Math.min(q, qty);
        if (q > qty + EPS) review(t, `Venda de ${q} maior que a posição de ${+qty.toFixed(8)}. Processada só a quantidade existente; verifique compras ou saldo inicial ausentes.`);
        const avg = cost / qty;
        const gross = isNum(t.amount) && t.amount > 0 ? t.amount : q * (t.price ?? 0) - (t.fees ?? 0);
        const proceeds = (gross * sellQty) / q;
        realizedHere = proceeds - avg * sellQty;
        totalSold += proceeds;
        cost -= avg * sellQty;
        qty -= sellQty;
        qtySold += sellQty;
        if (qty < EPS) {
          qty = 0;
          cost = 0;
        }
        break;
      }
      case 'desdobramento':
      case 'grupamento': {
        const before = qty;
        if (isNum(t.factor) && t.factor > 0) {
          qty = t.type === 'desdobramento' ? qty * t.factor : t.factor >= 1 ? qty / t.factor : qty * t.factor;
        } else if (isNum(t.qty) && t.qty !== 0) {
          qty += t.type === 'grupamento' ? -Math.abs(t.qty) : Math.abs(t.qty);
        } else review(t, `${t.type === 'desdobramento' ? 'Desdobramento' : 'Grupamento'} sem fator nem quantidade: ignorado.`);
        if (t.type === 'grupamento' && asset.class !== 'cripto' && Math.abs(qty - Math.round(qty)) > 1e-6) {
          review(t, `Grupamento gerou fração (${qty.toFixed(4)}). Frações costumam ir a leilão: registre a venda da fração se ocorreu.`);
        }
        if (isNum(t.qtyBefore) && Math.abs(t.qtyBefore - before) > 1e-6) review(t, `Quantidade anterior informada (${t.qtyBefore}) difere da calculada (${+before.toFixed(8)}).`);
        note = `${+before.toFixed(8)} → ${+qty.toFixed(8)}`;
        break;
      }
      case 'bonificacao': {
        let added = isNum(t.qty) && t.qty > 0 ? t.qty : 0;
        if (!added && isNum(t.factor) && t.factor > 0) added = Math.floor(qty * (t.factor > 1 ? t.factor / 100 : t.factor) + 1e-9);
        if (!added) {
          review(t, 'Bonificação sem quantidade nem fator: ignorada.');
          break;
        }
        const attributed = isNum(t.amount) && t.amount > 0 ? t.amount : added * (t.price ?? 0);
        if (!(attributed > 0)) review(t, 'Bonificação sem custo atribuído: ações somadas com custo zero. Informe o custo unitário divulgado pela empresa.');
        qty += added;
        cost += attributed;
        qtyBought += added;
        note = `+${added} ações bonificadas`;
        break;
      }
      case 'evento_outro':
      case 'ajuste': {
        if (!isNum(t.qty) || t.qty === 0) {
          if (t.type === 'ajuste') review(t, 'Ajuste sem quantidade: ignorado.');
          break;
        }
        const avg = qty > EPS ? cost / qty : 0;
        if (t.qty > 0) cost += isNum(t.price) ? t.qty * t.price : isNum(t.amount) && t.amount > 0 ? t.amount : 0;
        else cost = Math.max(0, cost - avg * Math.min(-t.qty, qty));
        qty = Math.max(0, qty + t.qty);
        review(t, `${t.type === 'ajuste' ? 'Ajuste manual' : 'Evento'} de ${t.qty > 0 ? '+' : ''}${t.qty} na quantidade: confira o efeito no custo.`);
        break;
      }
      case 'amortizacao':
        cost = Math.max(0, cost - t.amount);
        amortized += t.amount;
        break;
      case 'transferencia':
        note = `custódia ${t.fromInstitution || '?'} → ${t.toInstitution || '?'} (sem efeito na posição)`;
        break;
      default:
        if (INCOME_TX.includes(t.type)) income += t.amount;
    }
    if (isNum(t.declaredPosition) && (t.type === 'compra' || t.type === 'venda' || t.type === 'saldo_inicial') && Math.abs(t.declaredPosition - qty) > 1e-6)
      divergences.push({ txId: t.id, date: t.date, declared: t.declaredPosition, computed: qty });
    realized += realizedHere;
    ledger.push({ tx: t, qtyAfter: qty, avgAfter: qty > EPS ? cost / qty : 0, costAfter: cost, realized: realizedHere, note });
  }

  const price = isNum(asset.quote.price) ? asset.quote.price : null;
  const hasQuote = price !== null && !valueOnly;
  const marketValue = hasQuote ? qty * price! : cost;
  const unrealized = hasQuote ? marketValue - cost : null;
  const totalReturn = (unrealized ?? 0) + realized + income;
  const held = qty > EPS || (valueOnly && cost > 0);
  return {
    assetId: asset.id,
    qty: held && valueOnly && qty <= EPS ? 0 : qty,
    avgPrice: qty > EPS ? cost / qty : 0,
    costBasis: cost,
    qtyBought,
    qtySold,
    totalBought,
    totalSold,
    realized,
    income,
    amortized,
    reinvested,
    price,
    hasQuote,
    valueOnly: valueOnly && cost > 0,
    marketValue,
    unrealized,
    totalReturn,
    totalReturnPct: totalBought > 0 ? (totalReturn / totalBought) * 100 : null,
    firstBuy,
    ledger,
    divergences,
    reviews,
  };
}

/** Ativo tem posição? (inclui renda fixa avaliada só por valor) */
export const isHeld = (p: Position | undefined) => !!p && (p.qty > EPS || (p.valueOnly && p.costBasis > 0));

export function computePositions(assets: Asset[], txs: Transaction[]) {
  const by = new Map<string, Transaction[]>();
  for (const t of txs) if (t.assetId) (by.get(t.assetId) || by.set(t.assetId, []).get(t.assetId)!).push(t);
  const map: Record<string, Position> = {};
  for (const a of assets) map[a.id] = computePosition(a, by.get(a.id) || [], true);
  return map;
}

export interface PortfolioTotals {
  marketValue: number;
  costBasis: number;
  income: number;
  realized: number;
  unrealized: number;
  missingQuotes: string[];
  deposits: number; // aportes externos
  withdrawals: number;
  reinvestedIncome: number; // proventos reaplicados (não é dinheiro novo)
  cash: number; // saldo não investido estimado
}

export function portfolioTotals(assets: Asset[], positions: Record<string, Position>, txs: Transaction[]): PortfolioTotals {
  let marketValue = 0;
  let costBasis = 0;
  let income = 0;
  let realized = 0;
  let unrealized = 0;
  const missingQuotes: string[] = [];
  for (const a of assets) {
    const p = positions[a.id];
    if (!p) continue;
    income += p.income;
    realized += p.realized;
    if (!isHeld(p)) continue;
    marketValue += p.marketValue;
    costBasis += p.costBasis;
    unrealized += p.unrealized ?? 0;
    if (!p.hasQuote) missingQuotes.push(a.ticker);
  }
  const sum = (type: Transaction['type']) => txs.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
  const deposits = sum('aporte');
  const withdrawals = sum('retirada');
  const reinvestedIncome = sum('reinvestimento') + txs.filter((t) => t.type === 'compra' && t.reinvest).reduce((s, t) => s + t.amount, 0);
  const buys = sum('compra') + sum('subscricao');
  const sells = sum('venda');
  const amort = sum('amortizacao');
  const cash = deposits > 0 ? deposits - withdrawals + income + sells + amort - buys : 0;
  return { marketValue, costBasis, income, realized, unrealized, missingQuotes, deposits, withdrawals, reinvestedIncome, cash };
}
