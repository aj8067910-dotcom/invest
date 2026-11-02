import { describe, expect, it } from 'vitest';
import { planAutoProventos, provStatus, type CalendarItem } from './proventos';
import { defaultSettings, makeAsset } from '../seed';
import type { Transaction } from '../types';

const S = defaultSettings();
const AS = '2026-10-31';

describe('Proventos históricos sem data de pagamento', () => {
  const a = makeAsset({ ticker: 'HIST3', class: 'acao' });
  const buy: Transaction = { id: 'c1', date: '2024-01-05', type: 'compra', assetId: a.id, ticker: 'HIST3', qty: 100, price: 10, amount: 1000 };
  const cal: Record<string, CalendarItem[]> = {
    HIST3: [
      { type: 'dividendo', perUnit: 0.5, dataCom: '2024-06-28', payDate: null, source: 'Yahoo Finance (fallback)', collectedAt: '2026-10-31T00:00:00Z' },
      { type: 'dividendo', perUnit: 0.4, dataCom: '2026-10-20', payDate: null, source: 'B3', collectedAt: '2026-10-31T00:00:00Z' },
    ],
  };
  it('Yahoo antigo vira recebido com data estimada; B3 "a definir" continua provisionado; rodar de novo não duplica', () => {
    const plan = planAutoProventos([a], [buy], cal, S, AS);
    const old = plan.create.find((t) => t.exDate === '2024-06-28')!;
    const fresh = plan.create.find((t) => t.exDate === '2026-10-20')!;
    expect(old.payDate).toBe('2024-07-28');
    expect(old.reliability).toBe('estimada');
    expect(provStatus(old, AS)).toBe('recebido');
    expect(fresh.payDate).toBeNull();
    expect(provStatus(fresh, AS)).toBe('provisionado');
    const again = planAutoProventos([a], [buy, ...plan.create], cal, S, AS);
    expect(again.create.length + again.reverse.length).toBe(0);
  });
  it('lançamento antigo sem data é estornado e relançado com a data estimada (uma vez)', () => {
    const plan = planAutoProventos([a], [buy], cal, S, AS);
    const legacy = { ...plan.create.find((t) => t.exDate === '2024-06-28')!, payDate: null, date: '2024-06-28' };
    const p2 = planAutoProventos([a], [buy, legacy, plan.create[1]], cal, S, AS);
    expect(p2.reverse.map((r) => r.id)).toEqual([legacy.id]);
    expect(p2.reverse[0].reason).toContain('Data de pagamento estimada');
    expect(p2.create[0].payDate).toBe('2024-07-28');
  });
});
