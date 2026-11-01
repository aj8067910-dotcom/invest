import { useMemo } from 'react';
import { useStore } from './store';
import { computePositions, portfolioTotals } from '../domain/calc/positions';
import { computeAllocation } from '../domain/calc/allocation';
import { rankAssets, type ScoreContext } from '../domain/calc/scoring';
import { forwardIncome, incomeSummary } from '../domain/calc/dividends';
import { concentrationAlerts } from '../domain/calc/concentration';
import { todayISO } from '../domain/util';

export function useDerived() {
  const assets = useStore((s) => s.assets);
  const transactions = useStore((s) => s.transactions);
  const settings = useStore((s) => s.settings);
  return useMemo(() => {
    const asOf = todayISO();
    const positions = computePositions(assets, transactions);
    const totals = portfolioTotals(assets, positions, transactions);
    const alloc = computeAllocation(assets, positions, settings);
    const ctx: ScoreContext = { assets, positions, settings, alloc, asOf };
    const ranking = rankAssets(ctx);
    const scoreById = Object.fromEntries(ranking.map((r) => [r.assetId, r]));
    // início do histórico: o que vier primeiro entre a data configurada e a operação mais antiga importada
    const historyStart = transactions.reduce((m, t) => (t.date < m ? t.date : m), settings.profile.startDate);
    const income = incomeSummary(assets, transactions, historyStart, asOf);
    const forward = forwardIncome(assets, positions, asOf);
    const concAlerts = concentrationAlerts(assets, positions, settings);
    return { asOf, historyStart, assets, transactions, settings, positions, totals, alloc, ctx, ranking, scoreById, income, forward, concAlerts };
  }, [assets, transactions, settings]);
}

export type Derived = ReturnType<typeof useDerived>;
