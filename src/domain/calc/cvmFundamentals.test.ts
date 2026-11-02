import { describe, expect, it } from 'vitest';
import { cvmFundamentals, withCvmFundamentals } from './cvmFundamentals';
import { emptyMarket } from '../market';
import { makeAsset } from '../seed';

const market = () => {
  const m = emptyMarket();
  m.companies.TEST3 = {
    ticker: 'TEST3', codeCVM: '1', name: 'Teste', segment: null, financial: false, unitShares: 1, source: 'CVM — DFP', dataBase: '2025-12-31', collectedAt: '2026-01-01',
    years: [
      { year: 2021, totalAssets: 1000, netIncome: 50, revenue: 500, shares: 100 },
      { year: 2025, totalAssets: 2000, equity: 800, netIncome: 100, revenue: 1000, ebit: 180, depreciation: 20, shortDebt: 100, longDebt: 400, cash: 100, fco: 150, capex: 50, dividendsPaid: 60, shares: 100 },
    ],
  } as any;
  return m;
};

describe('Indicadores calculados da CVM', () => {
  const a = makeAsset({ ticker: 'TEST3', class: 'acao' });
  a.quote = { price: 10, date: '2026-10-31', source: 'teste' };
  it('payout, dívida líquida/EBITDA, FCL, LPA, P/L', () => {
    const f = cvmFundamentals(a, market())!;
    expect(f.year).toBe(2025);
    expect(f.values.payout).toBeCloseTo(60); // só 2025 tem dividendos pagos
    expect(f.values.netDebtEbitda).toBeCloseTo(400 / 200);
    expect(f.values.fcf).toBeCloseTo(100 / 1e6);
    expect(f.values.lpa).toBeCloseTo(1);
    expect(f.values.pl).toBeCloseTo(10);
    expect(f.values.roe).toBeCloseTo(12.5); // 2021 sem PL → PL do fim
    expect(f.values.earningsGrowth).toBeCloseTo((Math.pow(2, 1 / 4) - 1) * 100);
  });
  it('CVM tem prioridade; manual só preenche o que a CVM não tem', () => {
    const b = { ...a, fundamentals: { payout: 99, moat: 4 } };
    const r = withCvmFundamentals(b, market());
    expect(r.asset.fundamentals.payout).toBeCloseTo(60);
    expect(r.src.payout).toBe('cvm');
    expect(r.asset.fundamentals.moat).toBe(4);
    expect(r.src.moat).toBe('manual');
    expect(b.fundamentals.payout).toBe(99); // cadastro original intacto
  });
});
