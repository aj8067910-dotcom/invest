import { describe, expect, it } from 'vitest';
import { capOf, roomToCap } from './concentration';
import { computePositions } from './positions';
import { computeAllocation } from './allocation';
import { rankAssets, scoreAsset } from './scoring';
import { planContribution } from './allocator';
import { defaultSettings, seedAssets } from '../seed';
import { emptyMarket } from '../market';
import type { Asset, Transaction } from '../types';

const S = defaultSettings();

describe('Teto de participação por ativo', () => {
  it('usa o teto do ativo; vazio cai no limite geral', () => {
    const a = seedAssets()[0];
    expect(capOf(a, S)).toEqual({ pct: S.limits.maxAssetPct, own: false });
    expect(capOf({ ...a, maxWeight: 8 }, S)).toEqual({ pct: 8, own: true });
  });
  it('quanto cabe: 10% de teto, ativo R$ 500 em R$ 10.000 → R$ 555,56', () => {
    expect(roomToCap(10, 500, 10000)).toBeCloseTo(555.5556, 3);
    expect(roomToCap(10, 1200, 10000)).toBe(0);
  });

  const setup = (bbseQty: number, cap: number | null) => {
    const assets = seedAssets();
    const a = assets.find((x) => x.ticker === 'BBSE3')!;
    const b = assets.find((x) => x.ticker === 'ITUB4')!;
    Object.assign(a, { maxWeight: cap, dyTarget: 8, next12mEstimate: 2, useEstimate: true, thesis: 'Tese.', fundamentals: { roe: 30, netMargin: 25, payout: 70 } });
    a.quote = { price: 20, date: '2026-10-31', source: 'teste' };
    b.quote = { price: 40, date: '2026-10-31', source: 'teste' };
    const txs: Transaction[] = [
      { id: 'x1', date: '2026-01-02', type: 'compra', assetId: a.id, ticker: a.ticker, qty: bbseQty, price: 20, amount: bbseQty * 20 },
      { id: 'x2', date: '2026-01-02', type: 'compra', assetId: b.id, ticker: b.ticker, qty: 225, price: 40, amount: 9000 },
    ];
    const positions = computePositions(assets, txs, '2026-10-31');
    const ctx = { assets, positions, settings: S, alloc: computeAllocation(assets, positions, S), market: emptyMarket(), asOf: '2026-10-31' };
    return { a, ctx };
  };

  it('no teto → Aguardar com motivo', () => {
    const { a, ctx } = setup(50, 8); // R$ 1.000 de R$ 10.000 = 10% ≥ 8%
    const r = scoreAsset(a as Asset, ctx);
    expect(r.priority).toBe('aguardar');
    expect(r.reasons.join(' ')).toContain('Teto de participação atingido');
  });
  it('abaixo do teto → aporte limitado ao que cabe', () => {
    const { a, ctx } = setup(25, 8); // R$ 500 de R$ 9.500
    const plan = planContribution({ amount: 400, date: '2026-10-31', reserve: 0, maxPerAsset: 400, priorityClasses: [], eligibleIds: [a.id], includeMaintenance: true, mode: 'concentrar', maxAssets: 1 }, rankAssets(ctx), ctx);
    const line = plan.lines.find((l) => l.asset.id === a.id);
    // 8% de (9.500 + 400) = 792 − 500 = 292 → no máximo 14 cotas de R$ 20
    expect(line?.cost ?? 0).toBeLessThanOrEqual(292);
  });
});
