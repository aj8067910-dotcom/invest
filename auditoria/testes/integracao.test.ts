// AUDITORIA — Seção 15: o mesmo dado precisa dar o mesmo número em todos os módulos.
import { describe, expect, it } from 'vitest';
import { computePositions, portfolioTotals } from '../../src/domain/calc/positions';
import { incomeSummary } from '../../src/domain/calc/dividends';
import { yocSummary, realYield } from '../../src/domain/calc/yoc';
import { breakdown } from '../../src/domain/calc/breakdown';
import { computeAllocation } from '../../src/domain/calc/allocation';
import { defaultSettings, seedAssets } from '../../src/domain/seed';
import { emptyMarket } from '../../src/domain/market';
import type { Transaction } from '../../src/domain/types';

const AS = '2026-10-31';
const S = defaultSettings();
const assets = seedAssets();
const by = (t: string) => assets.find((a) => a.ticker === t)!;
const px: Record<string, number> = { ITUB4: 40, MXRF11: 9, BBSE3: 35, VALE3: 60 };
for (const [t, p] of Object.entries(px)) by(t).quote = { price: p, date: AS, source: 'fixture' };
let n = 0;
const tx = (t: string, o: Partial<Transaction>): Transaction => ({ id: `i${++n}`, date: '2025-01-02', type: 'compra', assetId: by(t).id, ticker: t, amount: 0, ...o });
const txs: Transaction[] = [
  { id: 'ap', date: '2025-01-01', type: 'aporte', amount: 10000 } as Transaction,
  tx('ITUB4', { qty: 100, price: 30, amount: 3000 }),
  tx('MXRF11', { qty: 300, price: 10, amount: 3000 }),
  tx('BBSE3', { date: '2025-06-01', qty: 50, price: 32, amount: 1600 }),
  tx('VALE3', { date: '2025-03-01', qty: 20, price: 70, amount: 1400 }),
  tx('VALE3', { date: '2025-09-01', type: 'venda', qty: 20, price: 65, amount: 1300 }), // posição encerrada com prejuízo
  tx('ITUB4', { date: '2026-02-10', type: 'jcp', amount: 41.25 }),
  tx('MXRF11', { date: '2026-03-15', type: 'rendimento', amount: 30 }),
  tx('MXRF11', { date: '2025-03-15', type: 'rendimento', amount: 30 }),
  tx('BBSE3', { date: '2026-12-10', type: 'dividendo', amount: 80, payDate: '2026-12-10' }), // pagamento futuro: provisionado
];
const pos = computePositions(assets, txs, AS);
const tot = portfolioTotals(assets, pos, txs);
const inc = incomeSummary(assets, txs, '2025-01-01', AS);
const y = yocSummary(assets, pos, txs, S, AS);
const m = emptyMarket();

describe('Seção 15 — consistência entre módulos', () => {
  it('proventos recebidos: Painel = Dividendos = Yield on Cost = soma das posições (provisionado fora)', () => {
    const sumPos = Object.values(pos).reduce((s, p) => s + p.income, 0);
    expect(sumPos).toBeCloseTo(101.25, 10);
    expect(inc.totalReceived).toBeCloseTo(sumPos, 10);
    expect(y.received).toBeCloseTo(sumPos, 10);
    expect(tot.income).toBeCloseTo(sumPos, 10);
    expect(tot.incomeProvisioned).toBeCloseTo(80, 10);
    expect(inc.last12m).toBeCloseTo(y.received12m, 10);
  });
  it('patrimônio: Painel = Rendimento (carteira) = Alocação', () => {
    const cart = breakdown('carteira', assets, pos, y, m)[0];
    const alloc = computeAllocation(assets, pos, S);
    expect(cart.marketValue).toBeCloseTo(tot.marketValue, 10);
    expect(alloc.total).toBeCloseTo(tot.marketValue, 10);
    expect(tot.marketValue).toBeCloseTo(100 * 40 + 300 * 9 + 50 * 35, 10);
  });
  it('retorno total: soma por ativo = soma por classe = carteira (inclui posição encerrada)', () => {
    const sum = (lv: 'ativo' | 'classe' | 'setor' | 'carteira') => breakdown(lv, assets, pos, y, m).reduce((s, r) => s + r.totalReturn, 0);
    const expected = (4000 - 3000) + (2700 - 3000) + (1750 - 1600) + (1300 - 1400) + 101.25;
    expect(sum('carteira')).toBeCloseTo(expected, 8);
    expect(sum('ativo')).toBeCloseTo(expected, 8);
    expect(sum('classe')).toBeCloseTo(expected, 8);
    expect(sum('setor')).toBeCloseTo(expected, 8);
  });
  it('[ACHADO A-03] DY médio real: proventos recebidos ÷ (capital investido × tempo em carteira), anualizado', () => {
    // ITUB4: 3.000 por 667 dias (02/01/2025→31/10/2026); MXRF11: 3.000 por 667 dias; BBSE3: 1.600 por 517 dias;
    // VALE3: 1.400 por 184 dias (01/03→01/09/2025). Proventos recebidos: 101,25
    const capYears = (3000 * 667 + 3000 * 667 + 1600 * 517 + 1400 * 184) / 365;
    const r = realYield(assets, txs, AS);
    expect(r.portfolio).toBeCloseTo((101.25 / capYears) * 100, 6);
    const mx = r.byAsset.find((x) => x.assetId === by('MXRF11').id)!;
    expect(mx.yieldPct).toBeCloseTo((60 / ((3000 * 667) / 365)) * 100, 6);
  });
});
