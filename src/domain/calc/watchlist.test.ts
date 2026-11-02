import { describe, expect, it } from 'vitest';
import { computePositions } from './positions';
import { computeAllocation } from './allocation';
import { rankAssets } from './scoring';
import { planContribution } from './allocator';
import { defaultSettings, seedAssets } from '../seed';
import { emptyMarket } from '../market';

const S = defaultSettings();
const plan = (price: number) => {
  const assets = seedAssets();
  const a = assets.find((x) => x.ticker === 'BBSE3')!;
  Object.assign(a, { status: 'watchlist', dyTarget: 8, next12mEstimate: 2, useEstimate: true, thesis: 'Tese.', fundamentals: { roe: 30, netMargin: 25, payout: 70 } });
  a.quote = { price, date: '2026-10-31', source: 'teste' };
  const positions = computePositions(assets, []);
  const ctx = { assets, positions, settings: S, alloc: computeAllocation(assets, positions, S), market: emptyMarket(), asOf: '2026-10-31' };
  const p = planContribution({ amount: 400, date: '2026-10-31', reserve: 0, maxPerAsset: 400, priorityClasses: [], eligibleIds: [a.id], includeMaintenance: true, mode: 'concentrar', maxAssets: 1 }, rankAssets(ctx), ctx);
  return { p, a };
};

describe('Watchlist na Central de aportes', () => {
  it('em Manutenção (margem 12%) não entra, mesmo com "incluir manutenção"', () => {
    const { p } = plan(22);
    expect(p.lines.length).toBe(0);
    expect(p.excluded[0].reason).toContain('Watchlist: só entra no aporte em Oportunidade');
  });
  it('em Oportunidade (margem 18%) entra', () => {
    const { p, a } = plan(20.5);
    expect(p.lines.map((l) => l.asset.id)).toContain(a.id);
  });
});
