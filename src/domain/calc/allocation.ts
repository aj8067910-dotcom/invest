import type { Asset, AssetClass, Exposure, Settings } from '../types';
import { CLASS_ORDER } from '../types';
import { isHeld, type Position } from './positions';

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

/**
 * Alocação por classe (veículo) contra as metas, com banda de tolerância configurável (padrão ±5 p.p.).
 * A reserva de emergência fica fora do cálculo. Fora da banda, os aportes vão para o maior déficit;
 * nunca se sugere venda (rebalanceamento por aportes).
 */
export function computeAllocation(assets: Asset[], positions: Record<string, Position>, s: Settings, contribution = s.profile.monthlyContribution, tolerance = s.allocationBand ?? 5): AllocationResult {
  const values: Record<AssetClass, number> = { acao: 0, fii: 0, tesouro: 0, etf: 0, cripto: 0 };
  for (const a of assets) {
    const p = positions[a.id];
    if (isHeld(p) && !a.isReserve) values[a.class] += p.marketValue;
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

/** Exposição econômica (ex.: BOVX11 = ações Brasil; ACWI11 e IVVB11 = internacional). */
export function economicExposure(assets: Asset[], positions: Record<string, Position>) {
  const out = new Map<Exposure, number>();
  let total = 0;
  for (const a of assets) {
    const p = positions[a.id];
    if (!isHeld(p) || a.isReserve) continue;
    const e: Exposure = a.exposure || (a.class === 'fii' ? 'fii' : a.class === 'tesouro' ? 'renda_fixa' : a.class === 'cripto' ? 'cripto' : a.international ? 'internacional' : 'acoes_br');
    out.set(e, (out.get(e) || 0) + p.marketValue);
    total += p.marketValue;
  }
  return [...out.entries()].map(([key, value]) => ({ key, value, pct: total ? (value / total) * 100 : 0 })).sort((x, y) => y.value - x.value);
}

export function reserveTotal(assets: Asset[], positions: Record<string, Position>) {
  return assets.filter((a) => a.isReserve && isHeld(positions[a.id])).reduce((s, a) => s + positions[a.id].marketValue, 0);
}
