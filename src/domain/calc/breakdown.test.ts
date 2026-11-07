import { describe, expect, it } from 'vitest';
import { breakdown, classify } from './breakdown';
import { computePositions } from './positions';
import { yocSummary } from './yoc';
import { defaultSettings, makeAsset } from '../seed';
import { emptyMarket } from '../market';
import type { Transaction } from '../types';

const S = defaultSettings();
const AS = '2026-10-31';

describe('Rendimento por nível', () => {
  const a = makeAsset({ ticker: 'BANC4', class: 'acao' });
  const b = makeAsset({ ticker: 'SEGU3', class: 'acao' });
  const f = makeAsset({ ticker: 'LOGI11', class: 'fii' });
  Object.assign(f, { fiiSegment: 'Logística', fiiType: 'tijolo' });
  a.quote = { price: 12, date: AS, source: 't' };
  b.quote = { price: 9, date: AS, source: 't' };
  f.quote = { price: 100, date: AS, source: 't' };
  const m = emptyMarket();
  m.classification = { BANC4: { setor: 'Financeiro', subsetor: 'Intermediários Financeiros', segmento: 'Bancos', source: 'B3' }, SEGU3: { setor: 'Financeiro', subsetor: 'Previdência e Seguros', segmento: 'Seguradoras', source: 'B3' } };
  const txs: Transaction[] = [
    { id: '1', date: '2025-01-02', type: 'compra', assetId: a.id, ticker: 'BANC4', qty: 100, price: 10, amount: 1000 },
    { id: '2', date: '2025-01-02', type: 'compra', assetId: b.id, ticker: 'SEGU3', qty: 100, price: 10, amount: 1000 },
    { id: '3', date: '2025-06-02', type: 'dividendo', assetId: b.id, ticker: 'SEGU3', amount: 50 },
    { id: '4', date: '2025-01-02', type: 'compra', assetId: f.id, ticker: 'LOGI11', qty: 10, price: 100, amount: 1000 },
  ];
  const assets = [a, b, f];
  const pos = computePositions(assets, txs, AS);
  const y = yocSummary(assets, pos, txs, S, AS);
  it('classificação B3 para ações; segmento de atuação para FII', () => {
    expect(classify(a, m)).toEqual({ setor: 'Financeiro', segmento: 'Bancos' });
    expect(classify(f, m).segmento).toBe('Logística');
  });
  it('setor soma os ativos; retorno = valorização + proventos', () => {
    const fin = breakdown('setor', assets, pos, y, m).find((r) => r.key === 'Financeiro')!;
    // BANC4 +200; SEGU3 −100 + 50 → +150 sobre 2.000 = 7,5%
    expect(fin.totalReturn).toBeCloseTo(150, 6);
    expect(fin.totalReturnPct).toBeCloseTo(7.5, 6);
    const cart = breakdown('carteira', assets, pos, y, m)[0];
    expect(cart.totalReturn).toBeCloseTo(150, 6); // FII sem variação
    expect(breakdown('segmento', assets, pos, y, m).map((r) => r.key).sort()).toEqual(['Bancos', 'Logística', 'Seguradoras']);
  });
});
