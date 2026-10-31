import type { Asset, AssetClass, Settings } from '../types';
import { CLASS_ORDER } from '../types';
import type { Position } from './positions';

export interface ClassAlloc {
  cls: AssetClass;
  value: number;
  current: number; // %
  target: number; // %
  diff: number; // current − target (p.p.)
  gapValue: number; // R$ que faltam para o alvo (negativo = excesso)
  status: 'sub' | 'sobre' | 'ok';
  afterContribution: number; // % se o próximo aporte for todo para esta classe
}

export interface AllocationResult {
  total: number;
  rows: ClassAlloc[];
  priorityClass: AssetClass | null;
  targetSum: number;
}

export function computeAllocation(assets: Asset[], positions: Record<string, Position>, s: Settings, contribution = s.profile.monthlyContribution, tolerance = 2): AllocationResult {
  const values: Record<AssetClass, number> = { acao: 0, fii: 0, tesouro: 0, etf: 0, cripto: 0 };
  for (const a of assets) {
    const p = positions[a.id];
    if (p && p.qty > 0) values[a.class] += p.marketValue;
  }
  const total = Object.values(values).reduce((x, y) => x + y, 0);
  const targetSum = CLASS_ORDER.reduce((x, c) => x + (s.targetAllocation[c] || 0), 0);
  const rows: ClassAlloc[] = CLASS_ORDER.map((cls) => {
    const value = values[cls];
    const current = total > 0 ? (value / total) * 100 : 0;
    const target = s.targetAllocation[cls] || 0;
    const diff = current - target;
    const gapValue = ((total + contribution) * target) / 100 - value;
    return {
      cls,
      value,
      current,
      target,
      diff,
      gapValue,
      status: diff < -tolerance ? 'sub' : diff > tolerance ? 'sobre' : 'ok',
      afterContribution: total + contribution > 0 ? ((value + contribution) / (total + contribution)) * 100 : 0,
    };
  });
  const sorted = [...rows].filter((r) => r.target > 0).sort((a, b) => b.gapValue - a.gapValue);
  return { total, rows, priorityClass: sorted[0] && sorted[0].gapValue > 0 ? sorted[0].cls : null, targetSum };
}

/** Pontuação 0–100 de quanto a classe precisa de recursos (100 = muito subalocada). */
export function classNeedScore(alloc: AllocationResult, cls: AssetClass): number {
  const r = alloc.rows.find((x) => x.cls === cls);
  if (!r) return 50;
  if (alloc.total <= 0) return r.target > 0 ? 70 : 0;
  // diff −10 p.p. → 100 ; 0 → 55 ; +10 p.p. → 0
  const v = 55 - r.diff * 5.5;
  return Math.max(0, Math.min(100, v));
}
