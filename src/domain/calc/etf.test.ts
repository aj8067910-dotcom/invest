import { describe, expect, it } from 'vitest';
import { provTax } from '../tax';
import { netPerUnit } from './bazin';
import { projectedPerUnit } from './yoc';
import { planAutoProventos } from './proventos';
import { defaultSettings, seedAssets } from '../seed';
import type { Transaction } from '../types';

const S = defaultSettings();

describe('ETF que distribui (SPYI11)', () => {
  const a = seedAssets().find((x) => x.ticker === 'SPYI11')!;
  it('está na lista padrão como ETF internacional que distribui, na watchlist', () => {
    expect(a.class).toBe('etf');
    expect(a.status).toBe('watchlist');
    expect(a.etf?.distributes).toBe(true);
    expect(a.international).toBe(true);
  });
  it('IR de 15% na fonte sobre o rendimento (editável)', () => {
    const t = provTax('rendimento', 100, S.tax, { etfRate: 15 });
    expect(t.ir.toNumber()).toBeCloseTo(15, 10);
    expect(provTax('rendimento', 100, S.tax, { etfRate: 0 }).ir.toNumber()).toBe(0);
    expect(netPerUnit({ id: 'x', exDate: '2026-10-20', value: 1, type: 'rendimento', recurring: true, source: 'B3' }, a, S).toNumber()).toBeCloseTo(0.85, 10);
  });
  it('provento automático do ETF sai líquido de 15%', () => {
    const buy: Transaction = { id: 'c', date: '2026-09-01', type: 'compra', assetId: a.id, ticker: 'SPYI11', qty: 10, price: 110, amount: 1100 };
    const plan = planAutoProventos([a], [buy], { SPYI11: [{ type: 'rendimento', perUnit: 1.0044, dataCom: '2026-10-20', payDate: '2026-11-10', source: 'B3', collectedAt: '2026-11-21' }] }, S, '2026-11-21');
    expect(plan.create[0].gross).toBeCloseTo(10.04, 10);
    expect(plan.create[0].ir).toBeCloseTo(1.51, 10);
    expect(plan.create[0].amount).toBeCloseTo(8.53, 10);
  });
  it('projeção de renda usa o valor líquido', () => {
    const b = { ...a, distributions: [{ id: '1', exDate: '2026-10-20', payDate: null, value: 1, type: 'rendimento' as const, recurring: true, source: 'B3' }] };
    expect(projectedPerUnit(b, S, '2026-11-21').perUnit).toBeCloseTo(0.85, 10);
  });
});
