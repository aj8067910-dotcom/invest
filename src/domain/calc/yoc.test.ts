import { describe, expect, it } from 'vitest';
import { computePositions } from './positions';
import { fmtMonths, recovery, simulateAporte, yocHistory, yocSummary } from './yoc';
import { defaultSettings, makeAsset } from '../seed';
import type { Transaction } from '../types';
import { priceFmt, qtyFmt } from '../format';
import { parseNum } from '../util';

const S = defaultSettings();
const AS = '2026-10-31';
const mk = () => {
  const a = makeAsset({ ticker: 'TEST3', class: 'acao' });
  a.quote = { price: 25, date: AS, source: 'teste' };
  // 5 anos de R$ 2,00/ação de dividendo recorrente
  a.distributions = [2021, 2022, 2023, 2024, 2025].map((y) => ({ id: `d${y}`, exDate: `${y}-06-30`, payDate: `${y}-07-15`, value: 2, type: 'dividendo' as const, recurring: true, source: 't' }));
  const txs: Transaction[] = [
    { id: 'c1', date: '2025-01-10', type: 'compra', assetId: a.id, ticker: 'TEST3', qty: 100, price: 20, amount: 2000 },
    { id: 'c2', date: '2025-06-10', type: 'compra', assetId: a.id, ticker: 'TEST3', qty: 100, price: 30, amount: 3000 },
    { id: 'v1', date: '2025-09-10', type: 'venda', assetId: a.id, ticker: 'TEST3', qty: 50, price: 32, amount: 1600 },
    { id: 'p1', date: '2025-07-15', type: 'dividendo', assetId: a.id, ticker: 'TEST3', amount: 400, payDate: '2025-07-15', exDate: '2025-06-30' },
    // provisionado (pagamento futuro): não é recebido
    { id: 'p2', date: '2026-12-15', type: 'dividendo', assetId: a.id, ticker: 'TEST3', amount: 300, payDate: '2026-12-15', exDate: '2026-10-01' },
  ];
  return { a, txs };
};

describe('Yield on Cost', () => {
  it('custo pelo PM com vendas; YoC = projetado ÷ custo; recebido sem provisionado', () => {
    const { a, txs } = mk();
    const pos = computePositions([a], txs, AS);
    const y = yocSummary([a], pos, txs, S, AS);
    const r = y.rows[0];
    // PM 25 (5.000/200); vendeu 50 → custo 150 × 25 = 3.750
    expect(r.cost).toBeCloseTo(3750, 6);
    expect(r.projectedAnnual).toBeCloseTo(150 * 2, 6); // 150 ações × R$ 2,00
    expect(r.yoc).toBeCloseTo((300 / 3750) * 100, 6); // 8%
    expect(r.dyMarket).toBeCloseTo((300 / (150 * 25)) * 100, 6);
    expect(y.received).toBeCloseTo(400, 6); // o provisionado de R$ 300 não conta
  });
  it('histórico do YoC realizado usa só o recebido', () => {
    const { a, txs } = mk();
    const h = yocHistory([a], txs, AS);
    const jul = h.find((p) => p.month === '2025-07')!;
    expect(jul.cost).toBeCloseTo(5000, 6);
    expect(jul.yoc12m).toBeCloseTo(8, 6);
    expect(h[h.length - 1].received12m).toBe(0); // pago em 07/2025, fora da janela de 12m em 10/2026
  });
  it('simulação de aporte: R$ 1.000 a R$ 25 → 40 ações; DY editável', () => {
    const { a, txs } = mk();
    const pos = computePositions([a], txs, AS);
    const y = yocSummary([a], pos, txs, S, AS);
    const s = simulateAporte({ asset: a, price: 25, value: 1010, dyPct: 8, position: pos[a.id], perUnit: 2, summary: y, asOf: AS });
    expect(s.qty).toBe(40);
    expect(s.invested).toBe(1000);
    expect(s.annual).toBeCloseTo(80, 6);
    expect(s.assetYocAfter).toBeCloseTo(((300 + 80) / 4750) * 100, 6);
    expect(s.payments.label).toContain('jul');
  });
});

describe('Compensação de queda por proventos', () => {
  it('tempo = perda ÷ proventos mensais', () => {
    const r = recovery({ exposed: 10000, dropPct: 10, annualIncome: 1200 });
    expect(r.loss).toBe(1000);
    expect(r.monthlyIncome).toBe(100);
    expect(r.months).toBe(10);
    expect(fmtMonths(30)).toBe('2 anos e 6 meses (30,0 meses)');
  });
  it('reinvestir encurta o prazo; sem proventos não há prazo', () => {
    const base = recovery({ exposed: 10000, dropPct: 20, annualIncome: 800 }).months!;
    const re = recovery({ exposed: 10000, dropPct: 20, annualIncome: 800, reinvest: true }).months!;
    expect(re).toBeLessThan(base);
    expect(recovery({ exposed: 10000, dropPct: 20, annualIncome: 0 }).months).toBeNull();
  });
});

describe('Criptoativos: 8 casas decimais', () => {
  it('exibe e lê as quantidades sem perder casas', () => {
    expect(qtyFmt(0.00045667, 'cripto')).toBe('0,00045667');
    expect(qtyFmt(42.612885, 'cripto')).toBe('42,61288500');
    expect(qtyFmt(100)).toBe('100');
    expect(parseNum('0,00045667')).toBe(0.00045667);
    expect(parseNum('42,61288500')).toBe(42.612885);
    expect(priceFmt(5.4213, 'cripto').replace(/\s/g, ' ')).toBe('R$ 5,4213');
  });
  it('custo e posição em decimal exato', () => {
    const a = makeAsset({ ticker: 'BTC', class: 'cripto' });
    const pos = computePositions([a], [{ id: 'b', date: '2026-01-02', type: 'compra', assetId: a.id, ticker: 'BTC', qty: 0.00045667, price: 600000, amount: 274.002 }], AS);
    expect(pos[a.id].qty).toBe(0.00045667);
    expect(qtyFmt(pos[a.id].qty, 'cripto')).toBe('0,00045667');
  });
});
