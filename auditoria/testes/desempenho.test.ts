// AUDITORIA — Seção 13: desempenho com histórico grande (fixture de 10.000 operações em 11 anos).
import { describe, expect, it } from 'vitest';
import { computePositions, portfolioTotals } from '../../src/domain/calc/positions';
import { yocHistory, yocSummary } from '../../src/domain/calc/yoc';
import { portfolioReturns } from '../../src/domain/calc/returns';
import { incomeSummary } from '../../src/domain/calc/dividends';
import { rankAssets } from '../../src/domain/calc/scoring';
import { computeAllocation } from '../../src/domain/calc/allocation';
import { defaultSettings, seedAssets } from '../../src/domain/seed';
import { emptyMarket } from '../../src/domain/market';
import type { Transaction } from '../../src/domain/types';

const AS = '2026-10-31';
const S = defaultSettings();
const assets = seedAssets();
const held = assets.filter((a) => a.class === 'acao' || a.class === 'fii').slice(0, 20);
held.forEach((a, i) => (a.quote = { price: 10 + i, date: AS, source: 'fixture' }));
const txs: Transaction[] = [];
for (let i = 0; i < 10000; i++) {
  const a = held[i % held.length];
  const d = new Date(Date.UTC(2015, 0, 2) + Math.floor(i * 0.4) * 86400000).toISOString().slice(0, 10);
  txs.push(i % 7 === 6 ? { id: `p${i}`, date: d, type: 'dividendo', assetId: a.id, ticker: a.ticker, amount: 5 } : { id: `c${i}`, date: d, type: 'compra', assetId: a.id, ticker: a.ticker, qty: 1, price: 10, amount: 10 });
}
const time = (f: () => unknown) => { const t = performance.now(); f(); return performance.now() - t; };

describe('Seção 13 — desempenho (10.000 operações, 20 ativos, 11 anos)', () => {
  it('mede cada etapa do painel', () => {
    let pos: ReturnType<typeof computePositions> = {};
    const r: Record<string, number> = {};
    r.posicoes = time(() => (pos = computePositions(assets, txs, AS)));
    r.totais = time(() => portfolioTotals(assets, pos, txs));
    r.proventos = time(() => incomeSummary(assets, txs, '2015-01-01', AS));
    r.ranking = time(() => rankAssets({ assets, positions: pos, settings: S, alloc: computeAllocation(assets, pos, S), market: emptyMarket(), asOf: AS }));
    r.rentabilidade = time(() => portfolioReturns(assets, pos, txs, () => null, undefined, AS));
    r.yoc = time(() => yocSummary(assets, pos, txs, S, AS));
    r.yocHistorico = time(() => yocHistory(assets, txs, AS));
    console.log('[desempenho ms]', JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v)]))));
    expect(r.posicoes).toBeLessThan(2000);
    expect(r.yocHistorico).toBeLessThan(3000); // tela Dividendos não pode travar
  }, 60000);
});
