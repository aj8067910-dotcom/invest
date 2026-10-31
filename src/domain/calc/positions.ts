import type { Asset, Transaction } from '../types';
import { INCOME_TX } from '../types';
import { isNum } from '../util';

export interface Position {
  assetId: string;
  qty: number;
  avgPrice: number; // preço médio (inclui taxas)
  costBasis: number; // custo da posição atual
  totalBought: number; // soma de todas as compras
  totalSold: number;
  realized: number; // lucro/prejuízo realizado em vendas
  income: number; // proventos recebidos (líquidos)
  reinvested: number; // compras feitas com proventos
  price: number | null;
  hasQuote: boolean;
  marketValue: number; // qty × cotação (ou custo se sem cotação)
  unrealized: number | null;
  totalReturn: number; // valorização + realizado + proventos
  totalReturnPct: number | null;
  firstBuy: string | null;
}

/**
 * Reconstrói a posição a partir do histórico (método do preço médio, padrão da Receita).
 * Vendas não alteram o preço médio; o resultado é lucro realizado.
 */
export function computePosition(asset: Asset, txs: Transaction[]): Position {
  const list = txs
    .filter((t) => t.assetId === asset.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  let qty = 0;
  let cost = 0;
  let totalBought = 0;
  let totalSold = 0;
  let realized = 0;
  let income = 0;
  let reinvested = 0;
  let firstBuy: string | null = null;

  for (const t of list) {
    const q = t.qty ?? 0;
    if (t.type === 'compra') {
      const value = isNum(t.amount) && t.amount > 0 ? t.amount : q * (t.price ?? 0) + (t.fees ?? 0);
      qty += q;
      cost += value;
      totalBought += value;
      if (t.reinvest) reinvested += value;
      firstBuy ||= t.date;
    } else if (t.type === 'venda') {
      if (qty <= 0) continue;
      const sellQty = Math.min(q, qty);
      const avg = cost / qty;
      const proceeds = isNum(t.amount) && t.amount > 0 ? t.amount : sellQty * (t.price ?? 0) - (t.fees ?? 0);
      realized += proceeds - avg * sellQty;
      totalSold += proceeds;
      cost -= avg * sellQty;
      qty -= sellQty;
      if (qty < 1e-9) {
        qty = 0;
        cost = 0;
      }
    } else if (INCOME_TX.includes(t.type)) {
      income += t.amount;
    } else if (t.type === 'amortizacao') {
      // amortização devolve capital: reduz custo, não é renda
      cost = Math.max(0, cost - t.amount);
    }
  }

  const price = isNum(asset.quote.price) ? asset.quote.price : null;
  const hasQuote = price !== null;
  const marketValue = hasQuote ? qty * price! : cost;
  const unrealized = hasQuote ? marketValue - cost : null;
  const totalReturn = (unrealized ?? 0) + realized + income;
  return {
    assetId: asset.id,
    qty,
    avgPrice: qty > 0 ? cost / qty : 0,
    costBasis: cost,
    totalBought,
    totalSold,
    realized,
    income,
    reinvested,
    price,
    hasQuote,
    marketValue,
    unrealized,
    totalReturn,
    totalReturnPct: totalBought > 0 ? (totalReturn / totalBought) * 100 : null,
    firstBuy,
  };
}

export function computePositions(assets: Asset[], txs: Transaction[]) {
  const map: Record<string, Position> = {};
  for (const a of assets) map[a.id] = computePosition(a, txs);
  return map;
}

export interface PortfolioTotals {
  marketValue: number;
  costBasis: number;
  income: number;
  realized: number;
  unrealized: number;
  missingQuotes: string[];
  deposits: number;
  withdrawals: number;
  cash: number; // saldo não investido estimado (aportes + proventos + vendas − compras)
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
    if (p.qty <= 0) continue;
    marketValue += p.marketValue;
    costBasis += p.costBasis;
    unrealized += p.unrealized ?? 0;
    if (!p.hasQuote) missingQuotes.push(a.ticker);
  }
  const deposits = txs.filter((t) => t.type === 'aporte').reduce((s, t) => s + t.amount, 0);
  const withdrawals = txs.filter((t) => t.type === 'retirada').reduce((s, t) => s + t.amount, 0);
  const buys = txs.filter((t) => t.type === 'compra').reduce((s, t) => s + t.amount, 0);
  const sells = txs.filter((t) => t.type === 'venda').reduce((s, t) => s + t.amount, 0);
  const amort = txs.filter((t) => t.type === 'amortizacao').reduce((s, t) => s + t.amount, 0);
  const cash = deposits > 0 ? deposits - withdrawals + income + sells + amort - buys : 0;
  return { marketValue, costBasis, income, realized, unrealized, missingQuotes, deposits, withdrawals, cash };
}
