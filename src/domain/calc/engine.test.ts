import { describe, expect, it } from 'vitest';
import { ceilingPrice, computeBazin, bandFor } from './bazin';
import { computePosition, computePositions } from './positions';
import { makeAsset, defaultSettings, seedAssets } from '../seed';
import type { Asset, Transaction } from '../types';
import { ttmPerUnit, bazinBase, dividendCagr, annualHistory, incomeSummary } from './dividends';
import { computeAllocation } from './allocation';
import { rankAssets, scoreAsset } from './scoring';
import { planContribution } from './allocator';
import { project, goalReach } from './projection';
import { gordon, dcf } from './valuation';
import { overlaps } from './concentration';

const S = defaultSettings();
const AS_OF = '2026-10-31';

const withDivs = (a: Asset, divs: [string, number, boolean?][]) => ({
  ...a,
  distributions: divs.map(([d, v, rec], i) => ({ id: String(i), exDate: d, value: v, type: 'dividendo' as const, recurring: rec ?? true, source: 't' })),
});

describe('Bazin', () => {
  it('preço-teto = provento ÷ DY-alvo (exemplo do enunciado)', () => {
    expect(ceilingPrice(2, 8)).toBeCloseTo(25);
  });
  it('faixas da régua para teto R$ 50', () => {
    const b = S.bands;
    expect(bandFor((43 / 50) * 100, b)).toBe('aguardar');
    expect(bandFor((40 / 50) * 100, b)).toBe('manutencao');
    expect(bandFor((35 / 50) * 100, b)).toBe('oportunidade');
    expect(bandFor((32 / 50) * 100, b)).toBe('extrema');
  });
  it('níveis e distância para a próxima faixa', () => {
    let a = makeAsset({ ticker: 'TEST3', class: 'acao', dyTarget: 8 });
    a = withDivs(a, [['2026-03-01', 2], ['2026-09-01', 2]]); // 4/ano → teto 50
    a.quote = { price: 45, date: AS_OF, source: 't' };
    const r = computeBazin(a, S, AS_OF);
    expect(r.ceiling).toBeCloseTo(50);
    expect(r.band).toBe('aguardar');
    expect(r.levels[1].upperPrice).toBeCloseTo(42.5);
    expect(r.levels[2].upperPrice).toBeCloseTo(37.5);
    expect(r.levels[3].upperPrice).toBeCloseTo(32.5);
    expect(r.nextBand?.distanceAbs).toBeCloseTo(2.5);
    expect(r.dyCurrent).toBeCloseTo((4 / 45) * 100);
  });
  it('ignora extraordinários no preço-teto', () => {
    let a = makeAsset({ ticker: 'X3', class: 'acao' });
    a = withDivs(a, [['2026-02-01', 1], ['2026-08-01', 1], ['2026-09-01', 5, false]]);
    const t = ttmPerUnit(a, AS_OF);
    expect(t.recurring).toBe(2);
    expect(t.extraordinary).toBe(5);
    expect(bazinBase(a, AS_OF).value).toBe(2);
  });
  it('não aplica Bazin a ETF/Tesouro/cripto', () => {
    const etf = makeAsset({ ticker: 'BOVX11', class: 'etf' });
    expect(computeBazin(etf, S, AS_OF).applicable).toBe(false);
  });
});

describe('Posições', () => {
  it('preço médio, venda e proventos', () => {
    const a = makeAsset({ ticker: 'ITSA4', class: 'acao' });
    a.quote = { price: 12, date: AS_OF, source: 't' };
    const txs: Transaction[] = [
      { id: '1', date: '2025-12-05', type: 'compra', assetId: a.id, qty: 10, price: 10, fees: 0, amount: 100 },
      { id: '2', date: '2026-01-05', type: 'compra', assetId: a.id, qty: 10, price: 11, fees: 0, amount: 110 },
      { id: '3', date: '2026-02-05', type: 'venda', assetId: a.id, qty: 5, price: 12, fees: 0, amount: 60 },
      { id: '4', date: '2026-03-05', type: 'dividendo', assetId: a.id, amount: 3 },
    ];
    const p = computePosition(a, txs);
    expect(p.qty).toBe(15);
    expect(p.avgPrice).toBeCloseTo(10.5);
    expect(p.realized).toBeCloseTo(60 - 52.5);
    expect(p.income).toBe(3);
    expect(p.marketValue).toBe(180);
  });
});

describe('Dividendos', () => {
  it('CAGR exige 3 anos completos', () => {
    let a = makeAsset({ ticker: 'X3', class: 'acao' });
    a = withDivs(a, [['2022-05-01', 1], ['2023-05-01', 1.1], ['2024-05-01', 1.21], ['2025-05-01', 1.331]]);
    expect(dividendCagr(annualHistory(a, AS_OF))).toBeCloseTo(10, 1);
  });
  it('renda recebida desde dez/2025', () => {
    const txs: Transaction[] = [
      { id: '1', date: '2026-01-10', type: 'rendimento', assetId: 'x', amount: 10 },
      { id: '2', date: '2026-09-10', type: 'rendimento', assetId: 'x', amount: 20 },
    ];
    const r = incomeSummary([], txs, '2025-12-01', AS_OF);
    expect(r.last12m).toBe(30);
    expect(r.monthsOfHistory).toBe(11);
  });
});

describe('Ranking e aportes', () => {
  const build = () => {
    const assets = seedAssets();
    const good = assets.find((a) => a.ticker === 'BBSE3')!;
    Object.assign(good, withDivs(good, [['2026-02-01', 2.5], ['2026-08-01', 2.5], ['2025-08-01', 4.6], ['2024-08-01', 4.2], ['2023-08-01', 3.9], ['2022-08-01', 3.5]]));
    good.quote = { price: 50, date: AS_OF, source: 't' }; // teto 5/0.06 = 83.3 → 60% extrema
    good.fundamentals = { roe: 40, netMargin: 30, governance: 4, moat: 4, sectorRisk: 2, payout: 70 };
    const bad = assets.find((a) => a.ticker === 'POMO4')!;
    Object.assign(bad, withDivs(bad, [['2026-02-01', 1]]));
    bad.quote = { price: 5, date: AS_OF, source: 't' };
    bad.fundamentals = { roe: 20, netMargin: 10, payout: 140 };
    return { assets, good, bad };
  };
  it('ativo com payout insustentável vai para revisar tese', () => {
    const { assets, bad } = build();
    const positions = computePositions(assets, []);
    const ctx = { assets, positions, settings: S, alloc: computeAllocation(assets, positions, S), asOf: AS_OF };
    expect(scoreAsset(bad, ctx).priority).toBe('revisar');
  });
  it('ativo de qualidade com desconto sobe no ranking e recebe o aporte', () => {
    const { assets, good } = build();
    const positions = computePositions(assets, []);
    const ctx = { assets, positions, settings: S, alloc: computeAllocation(assets, positions, S), asOf: AS_OF };
    const ranking = rankAssets(ctx);
    const r = ranking.find((x) => x.assetId === good.id)!;
    expect(['maxima', 'alta']).toContain(r.priority);
    const plan = planContribution({ amount: 400, date: AS_OF, reserve: 0, maxPerAsset: 400, priorityClasses: [], eligibleIds: null, includeMaintenance: true, mode: 'concentrar', maxAssets: 3 }, ranking, ctx);
    expect(plan.lines[0].asset.ticker).toBe('BBSE3');
    expect(plan.lines[0].qty).toBe(8);
    expect(plan.invested).toBe(400);
  });
  it('sem oportunidades recomenda aguardar', () => {
    const assets = seedAssets();
    const positions = computePositions(assets, []);
    const ctx = { assets, positions, settings: S, alloc: computeAllocation(assets, positions, S), asOf: AS_OF };
    const plan = planContribution({ amount: 400, date: AS_OF, reserve: 0, maxPerAsset: 400, priorityClasses: [], eligibleIds: null, includeMaintenance: true, mode: 'auto', maxAssets: 3 }, rankAssets(ctx), ctx);
    expect(plan.verdict).toBe('aguardar');
    expect(plan.invested).toBe(0);
  });
});

describe('Valuation e projeção', () => {
  it('Gordon e FCD', () => {
    expect(gordon(1, 12, 4)).toBeCloseTo(13);
    expect(gordon(1, 4, 5)).toBeNull();
    expect(dcf(1, 0, 0, 10)).toBeCloseTo(10, 5);
  });
  it('projeção cresce e meta é alcançada', () => {
    const pts = project({ start: '2026-11-01', initial: 5000, monthly: 400, endYear: 2045, p: S.scenarios.moderado });
    expect(pts[pts.length - 1].patrimony).toBeGreaterThan(5000 + 400 * 12 * 19);
    expect(goalReach(pts, 500)).not.toBeNull();
  });
});

describe('Sobreposições', () => {
  it('detecta ITSA4 × ITUB4 e BOVX11 × ações', () => {
    const assets = seedAssets();
    const o = overlaps(assets, computePositions(assets, []));
    expect(o.some((x) => x.kind === 'emissor' && x.tickers.includes('ITSA4') && x.tickers.includes('ITUB4'))).toBe(true);
    expect(o.some((x) => x.kind === 'etf-acoes' && x.tickers[0] === 'BOVX11')).toBe(true);
    expect(o.some((x) => x.kind === 'etf-etf' && x.tickers.includes('IVVB11') && x.tickers.includes('NASD11'))).toBe(true);
  });
});
