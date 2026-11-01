import { describe, expect, it } from 'vitest';
import { mergeRobotDistributions, ROBOT_SOURCE } from './marketdata';
import { makeAsset } from '../domain/seed';

describe('mesclagem de proventos do robô', () => {
  const robot = [
    { exDate: '2026-01-02', value: 0.1 },
    { exDate: '2026-02-02', value: 0.1 },
    { exDate: '2026-03-02', value: 0.1 },
    { exDate: '2026-04-01', value: 0.1 },
    { exDate: '2026-04-20', value: 2.0 }, // atípico
  ];
  it('marca pagamento atípico novo como extraordinário e não duplica lançamento manual', () => {
    const a = makeAsset({ ticker: 'X3', class: 'acao' });
    a.distributions = [{ id: 'm1', exDate: '2026-01-01', value: 0.1, type: 'dividendo', recurring: true, source: 'Manual' }];
    const out = mergeRobotDistributions(a, robot);
    expect(out.length).toBe(5);
    expect(out.find((d) => d.value === 2)!.recurring).toBe(false);
    expect(out.filter((d) => d.source === ROBOT_SOURCE).length).toBe(4);
  });
  it('preserva a marcação feita pelo usuário em coletas seguintes', () => {
    const a = makeAsset({ ticker: 'X3', class: 'acao' });
    a.distributions = mergeRobotDistributions(a, robot).map((d) => (d.value === 2 ? { ...d, recurring: true } : d));
    const again = mergeRobotDistributions(a, robot);
    expect(again.find((d) => d.value === 2)!.recurring).toBe(true);
    expect(again.length).toBe(5);
  });
});
