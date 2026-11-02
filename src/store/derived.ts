import { useMemo } from 'react';
import { useStore } from './store';
import { useMarket } from './market';
import { computePositions, portfolioTotals } from '../domain/calc/positions';
import { computeAllocation } from '../domain/calc/allocation';
import { rankAssets, type ScoreContext } from '../domain/calc/scoring';
import { incomeSummary } from '../domain/calc/dividends';
import { yocSummary } from '../domain/calc/yoc';
import { concentrationAlerts } from '../domain/calc/concentration';
import { portfolioReturns } from '../domain/calc/returns';
import { planAutoProventos } from '../domain/calc/proventos';
import { activeTransactions, isReceived } from '../domain/ledger';
import { INCOME_TX } from '../domain/types';
import { D, N, ZERO } from '../domain/money';
import { addMonths, todayISO } from '../domain/util';
import type { MarketData } from '../domain/market';
import { withCvmFundamentals } from '../domain/calc/cvmFundamentals';

export function useDerived() {
  const assets = useStore((s) => s.assets);
  const allTransactions = useStore((s) => s.transactions);
  const settings = useStore((s) => s.settings);
  const conciliations = useStore((s) => s.conciliations);
  const marketState = useMarket();
  return useMemo(() => {
    const market: MarketData = marketState;
    const asOf = todayISO();
    // só lançamentos válidos (estornados e estornos ficam fora dos cálculos)
    const transactions = activeTransactions(allTransactions);
    const positions = computePositions(assets, transactions, asOf);
    const totals = portfolioTotals(assets, positions, transactions);
    const alloc = computeAllocation(assets, positions, settings);
    // fundamentos efetivos: CVM (primária) → manual (reserva). d.assets continua com o cadastro original.
    const fund = Object.fromEntries(assets.map((a) => [a.id, withCvmFundamentals(a, market)]));
    const effAssets = assets.map((a) => fund[a.id].asset);
    const ctx: ScoreContext = { assets: effAssets, positions, settings, alloc, market, asOf };
    const ranking = rankAssets(ctx);
    const scoreById = Object.fromEntries(ranking.map((r) => [r.assetId, r]));
    const historyStart = transactions.reduce((m, t) => (t.date < m ? t.date : m), settings.profile.startDate);
    const income = incomeSummary(assets, transactions, historyStart, asOf);
    // renda projetada: mesma base líquida do preço-teto (DPA de referência), usada no Painel, Dividendos e Central de aportes
    const yoc = yocSummary(assets, positions, allTransactions, settings, asOf);
    const fwRows = yoc.rows.filter((r) => r.projectedAnnual > 0).map((r) => ({ assetId: r.asset.id, ticker: r.asset.ticker, perUnit: r.perUnit as number, qty: r.qty, annual: r.projectedAnnual, monthly: r.projectedAnnual / 12, share: yoc.projectedAnnual ? (r.projectedAnnual / yoc.projectedAnnual) * 100 : 0, kind: 'real' as const }));
    const forward = { rows: fwRows, annual: yoc.projectedAnnual, monthly: yoc.projectedMonthly };
    const concAlerts = concentrationAlerts(assets, positions, settings);
    // DY da carteira = proventos LÍQUIDOS recebidos em 12 meses ÷ patrimônio atual; Yield on Cost ÷ custo
    const y1 = addMonths(asOf, -12);
    const net12 = transactions.filter((t) => INCOME_TX.includes(t.type) && isReceived(t, asOf) && t.date > y1).reduce((s, t) => s.plus(D(t.amount)), ZERO);
    const dyPortfolio = totals.marketValue > 0 ? N(net12.dividedBy(totals.marketValue).times(100)) : null;
    const yieldOnCost = yoc.yoc; // projetado ÷ custo de aquisição
    const yieldOnCostRealized = totals.costBasis > 0 ? N(net12.dividedBy(totals.costBasis).times(100)) : null;
    const monthEnd = (tk: string, m: string) => {
      const rows = market.monthEnd?.[tk];
      if (!rows) return null;
      let v: number | null = null;
      for (const [mm, p] of rows) if (mm <= m) v = p;
      return v;
    };
    const returns = portfolioReturns(assets, positions, transactions, monthEnd, market.series?.cdi, asOf);
    const autoPreview = Object.keys(market.calendar || {}).length ? planAutoProventos(assets, allTransactions, market.calendar, settings, asOf) : null;
    const conferred = new Set(conciliations.filter((c) => c.status === 'conferido').map((c) => c.txId));
    return { asOf, historyStart, assets, fund, yoc, transactions, allTransactions, settings, positions, totals, alloc, ctx, ranking, scoreById, income, forward, concAlerts, market, dyPortfolio, yieldOnCost, yieldOnCostRealized, returns, upcoming: autoPreview?.upcoming || [], provDivergences: autoPreview?.divergences || [], conciliations, conferred };
  }, [assets, allTransactions, settings, marketState, conciliations]);
}

export type Derived = ReturnType<typeof useDerived>;
