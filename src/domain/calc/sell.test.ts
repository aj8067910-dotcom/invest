import { describe, expect, it } from 'vitest';
import { evaluateSell } from './sell';
import { computePositions } from './positions';
import { defaultSettings, makeAsset } from '../seed';
import { emptyMarket } from '../market';
import type { Transaction } from '../types';

const S = defaultSettings();
const AS = '2026-10-31';

const setup = (price: number, extra: Record<string, unknown> = {}) => {
  const a = makeAsset({ ticker: 'VEND3', class: 'acao' });
  Object.assign(a, { status: 'venda', sector: 'Indústria' }, extra);
  a.quote = { price, date: AS, source: 't' };
  // DPA 2,00/ano por 5 anos → saída 6% = R$ 33,33
  a.distributions = [2021, 2022, 2023, 2024, 2025].map((y) => ({ id: `d${y}`, exDate: `${y}-06-30`, payDate: `${y}-07-15`, value: 2, type: 'dividendo' as const, recurring: true, source: 't' }));
  a.annualPrices = { 2021: 20, 2022: 20, 2023: 20, 2024: 20, 2025: 20 };
  const m = emptyMarket();
  // LPA 2 e VPA 10 em todos os anos → P/L médio 10, P/VP médio 2; Graham = √(22,5×2×10) = 21,21
  m.companies.VEND3 = { ticker: 'VEND3', codeCVM: '1', name: 'V', segment: null, financial: false, unitShares: 1, source: 'CVM', dataBase: '2025-12-31', collectedAt: AS,
    years: [2021, 2022, 2023, 2024, 2025].map((y) => ({ year: y, totalAssets: 2000, equity: 1000, netIncome: 200, shares: 100, dividendsPaid: 120, ebit: 300, depreciation: 50, shortDebt: 100, longDebt: 200, cash: 100, revenue: 1000 })) } as any;
  m.series = { cdi: [['2024-02', 1], ['2024-03', 1]], ipca: [['2024-02', 0.4]] };
  m.ntnb = { rate: 7.5, maturity: '2035-05-15', date: AS, source: 't' };
  const eff = { ...a, fundamentals: { lpa: 2, vpa: 10 } };
  const txs: Transaction[] = [{ id: 'c1', date: '2024-01-10', type: 'compra', assetId: a.id, ticker: 'VEND3', qty: 100, price: 20, amount: 2000 }];
  const pos = computePositions([a], txs, AS);
  return evaluateSell({ asset: a, eff, position: pos[a.id], txs, market: m, settings: S, asOf: AS });
};

describe('Oportunidade de Venda', () => {
  it('cotação acima da saída Bazin e de Graham, múltiplos acima da média → VENDER', () => {
    const r = setup(36); // DY 5,6% < 6%; prêmio Graham +70%; P/L 18 vs 10; P/VP 3,6 vs 2
    expect(r.exitPrice).toBeCloseTo(33.333, 2);
    expect(r.graham).toBeCloseTo(21.213, 2);
    expect(r.criteria.find((c) => c.key === 'bazin')!.signal).toBe(true);
    expect(r.criteria.find((c) => c.key === 'graham')!.signal).toBe(true);
    expect(r.criteria.find((c) => c.key === 'multiplos')!.signal).toBe(true);
    expect(r.status).toBe('vender');
    expect(r.triggerPrice).toBeNull();
  });
  it('retorno positivo, só 1 sinal → AGUARDAR, com preço-gatilho', () => {
    const r = setup(21); // prêmio Graham −1%; DY 9,5%; P/L 10,5 (+5%)
    expect(r.totalReturnPct).toBeGreaterThan(0);
    expect(r.signals).toBeLessThan(2);
    expect(r.status).toBe('aguardar');
    expect(r.triggerPrice).not.toBeNull();
  });
  it('retorno negativo → NÃO VENDER, mesmo com sinais', () => {
    expect(setup(15).status).toBe('nao_vender');
  });
  it('meta atingida basta (com retorno positivo)', () => {
    const r = setup(21, { sellTarget: 4 }); // retorno 5%
    expect(r.metaHit).toBe(true);
    expect(r.status).toBe('vender');
  });
  it('IR: venda de ações até R$ 20 mil no mês é isenta', () => {
    const r = setup(36);
    expect(r.taxEstimate).toBe(0);
    expect(r.taxNote).toContain('isento');
  });
});
