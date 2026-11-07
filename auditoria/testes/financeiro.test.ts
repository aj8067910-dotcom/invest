// AUDITORIA — Seções 5, 6 e 7: fórmulas financeiras confrontadas com cálculo independente.
import { describe, expect, it } from 'vitest';
import { computePositions } from '../../src/domain/calc/positions';
import { computeBazin, bandForMargin, netPerUnit } from '../../src/domain/calc/bazin';
import { projectedPerUnit, yocSummary } from '../../src/domain/calc/yoc';
import { twr, xirr, accumulate } from '../../src/domain/calc/returns';
import { computeAllocation } from '../../src/domain/calc/allocation';
import { rankAssets, scoreAsset } from '../../src/domain/calc/scoring';
import { planContribution } from '../../src/domain/calc/allocator';
import { defaultSettings, makeAsset, seedAssets } from '../../src/domain/seed';
import { emptyMarket } from '../../src/domain/market';
import type { Settings, Transaction } from '../../src/domain/types';

const AS = '2026-10-31';
const S = defaultSettings();

describe('5.1 Preço médio (fórmula independente)', () => {
  it('Σ custo ÷ Σ quantidade, venda não altera PM, desdobramento mantém custo', () => {
    const a = makeAsset({ ticker: 'PMED3', class: 'acao' });
    const txs: Transaction[] = [
      { id: '1', date: '2025-01-02', type: 'compra', assetId: a.id, qty: 33, price: 17.27, fees: 2.13, amount: 33 * 17.27 + 2.13 },
      { id: '2', date: '2025-02-02', type: 'compra', assetId: a.id, qty: 71, price: 19.91, fees: 0.97, amount: 71 * 19.91 + 0.97 },
      { id: '3', date: '2025-03-02', type: 'venda', assetId: a.id, qty: 40, price: 22, fees: 0, amount: 880 },
      { id: '4', date: '2025-04-02', type: 'grupamento', assetId: a.id, factor: 4 },
    ];
    const cost = 33 * 17.27 + 2.13 + 71 * 19.91 + 0.97;
    const pm = cost / 104;
    const p = computePositions([a], txs, AS)[a.id];
    expect(p.qty).toBe(16); // 64 ÷ 4
    expect(p.costBasis).toBeCloseTo(pm * 64, 9);
    expect(p.avgPrice).toBeCloseTo((pm * 64) / 16, 9);
    expect(p.realized).toBeCloseTo(880 - 40 * pm, 9);
  });
});

describe('5.2 Indicadores de DY distintos', () => {
  const a = makeAsset({ ticker: 'DYDY3', class: 'acao' });
  a.quote = { price: 20, date: AS, source: 'fixture' };
  // 5 anos: R$ 1,00 dividendo + R$ 0,50 JCP por ano (JCP líquido 0,5 × 0,825 = 0,4125) → 1,4125/ano líquido
  a.distributions = [2021, 2022, 2023, 2024, 2025].flatMap((y) => [
    { id: `d${y}`, exDate: `${y}-05-02`, payDate: `${y}-05-20`, value: 1, type: 'dividendo' as const, recurring: true, source: 'f' },
    { id: `j${y}`, exDate: `${y}-11-02`, payDate: `${y}-11-20`, value: 0.5, type: 'jcp' as const, recurring: true, source: 'f' },
  ]);
  const txs: Transaction[] = [
    { id: 'c', date: '2025-01-02', type: 'compra', assetId: a.id, qty: 100, price: 16, amount: 1600 },
    { id: 'p1', date: '2025-05-20', type: 'dividendo', assetId: a.id, amount: 100 },
    { id: 'p2', date: '2025-11-20', type: 'jcp', assetId: a.id, amount: 41.25 },
  ];
  const pos = computePositions([a], txs, AS);
  it('JCP líquido de 17,5%', () => expect(netPerUnit(a.distributions[1], a, S).toNumber()).toBeCloseTo(0.4125, 10));
  it('DY atual (12m, sobre a cotação), DY projetado (DPA de referência), YoC (sobre o custo), YoC realizado (recebido ÷ custo)', () => {
    const bz = computeBazin(a, S, AS);
    expect(bz.dyCurrent).toBeCloseTo((0.4125 / 20) * 100, 8); // nos 12m até 31/10/2026 só há o JCP de 11/2025
    const u = projectedPerUnit(a, S, AS);
    expect(u.perUnit).toBeCloseTo(1.4125, 10);
    const y = yocSummary([a], pos, txs, S, AS);
    expect(y.rows[0].dyMarket).toBeCloseTo((141.25 / 2000) * 100, 8);
    expect(y.rows[0].yoc).toBeCloseTo((141.25 / 1600) * 100, 8);
    expect(y.rows[0].yocRealized12m).toBeCloseTo((41.25 / 1600) * 100, 8);
    expect(y.received).toBeCloseTo(141.25, 10);
  });
});

describe('5.4 Bazin: preço-teto = DPA ÷ DY e o DY configurado altera o resultado', () => {
  const mk = (s: Settings) => {
    const a = makeAsset({ ticker: 'BZIN3', class: 'acao' });
    a.quote = { price: 18, date: AS, source: 'fixture' };
    a.distributions = [2021, 2022, 2023, 2024, 2025].map((y) => ({ id: `${y}`, exDate: `${y}-06-01`, payDate: null, value: 1.2, type: 'dividendo' as const, recurring: true, source: 'f' }));
    return computeBazin(a, s, AS);
  };
  it('DY 6% → teto 20; DY 8% → teto 15; margem e faixa recalculadas', () => {
    const s6 = { ...S, defaultDy: { ...S.defaultDy, acao: 6 } };
    const s8 = { ...S, defaultDy: { ...S.defaultDy, acao: 8 } };
    const b6 = mk(s6), b8 = mk(s8);
    expect(b6.ceiling).toBeCloseTo(20, 10);
    expect(b8.ceiling).toBeCloseTo(15, 10);
    expect(b6.margin).toBeCloseTo(10, 10); // (20 − 18) ÷ 20
    expect(b6.band).toBe('manutencao');
    expect(b8.band).toBe('aguardar');
    expect(b6.opportunityPrice).toBeCloseTo(17, 10); // 20 × (1 − 15%)
  });
  it('sem proventos: sem teto e com motivo (não inventa)', () => {
    const a = makeAsset({ ticker: 'NADA3', class: 'acao' });
    a.quote = { price: 10, date: AS, source: 'fixture' };
    const b = computeBazin(a, S, AS);
    expect(b.ceiling).toBeNull();
    expect(b.band).toBeNull();
  });
});

describe('7. Régua de decisão: limiares configuráveis', () => {
  it('margem < 0 aguardar; 0 a 15% manutenção; ≥ 15% oportunidade; margem exigida editável', () => {
    expect(bandForMargin(-0.01, { margin: 15 })).toBe('aguardar');
    expect(bandForMargin(0, { margin: 15 })).toBe('manutencao');
    expect(bandForMargin(14.99, { margin: 15 })).toBe('manutencao');
    expect(bandForMargin(15, { margin: 15 })).toBe('oportunidade');
    expect(bandForMargin(12, { margin: 10 })).toBe('oportunidade');
  });
  it('preço baixo sozinho não basta: alerta de endividamento rebaixa (não é só preço)', () => {
    const assets = seedAssets();
    const a = assets.find((x) => x.ticker === 'POMO4')!;
    Object.assign(a, { dyTarget: 8, next12mEstimate: 2, useEstimate: true, thesis: 'Tese.', fundamentals: { roe: 30, netMargin: 18, payout: 70, netDebtEbitda: 4.2 } });
    a.quote = { price: 15, date: AS, source: 'fixture' }; // margem 40%
    const positions = computePositions(assets, []);
    const ctx = { assets, positions, settings: S, alloc: computeAllocation(assets, positions, S), market: emptyMarket(), asOf: AS };
    expect(scoreAsset(a, ctx).priority).toBe('aguardar');
  });
});

describe('5.5 Rentabilidade: TWR e TIR contra cálculo independente', () => {
  it('XIRR de −1.000 → +1.100 em 365 dias = 10%', () => {
    expect(xirr([{ date: '2025-01-01', value: -1000 }, { date: '2026-01-01', value: 1100 }])!).toBeCloseTo(0.1, 6);
  });
  it('TWR neutraliza aporte: +10% e depois 0% com aporte grande = 10%', () => {
    const r = twr([
      { month: '2025-01', startValue: 0, flow: 1000, endValue: 1100, income: 0 },
      { month: '2025-02', startValue: 1100, flow: 10000, endValue: 11100, income: 0 },
    ]);
    expect(r.total).toBeCloseTo(0.1, 10);
  });
  it('CDI acumulado composto', () => {
    expect(accumulate([['2025-01', 1], ['2025-02', 1]], '2025-01', '2025-02')!).toBeCloseTo(0.0201, 10);
  });
});

describe('6. Central de aportes reage aos parâmetros', () => {
  const setup = (price: number, amount: number, dy = 8) => {
    const assets = seedAssets();
    const a = assets.find((x) => x.ticker === 'BBSE3')!;
    Object.assign(a, { dyTarget: dy, next12mEstimate: 2, useEstimate: true, thesis: 'Tese.', fundamentals: { roe: 30, netMargin: 25, payout: 70 } });
    a.quote = { price, date: AS, source: 'fixture' };
    const positions = computePositions(assets, []);
    const ctx = { assets, positions, settings: S, alloc: computeAllocation(assets, positions, S), market: emptyMarket(), asOf: AS };
    return planContribution({ amount, date: AS, reserve: 0, maxPerAsset: amount, priorityClasses: [], eligibleIds: [a.id], includeMaintenance: false, mode: 'concentrar', maxAssets: 1 }, rankAssets(ctx), ctx);
  };
  it('preço abaixo do preço de oportunidade compra; acima do teto aguarda', () => {
    expect(setup(20, 400).lines.length).toBe(1); // teto 25, margem 20%
    expect(setup(26, 400).lines.length).toBe(0);
  });
  it('valor do aporte muda a quantidade (arredondamento para cima, decisão documentada)', () => {
    expect(setup(20, 400).lines[0].qty).toBe(20);
    expect(setup(20, 1000).lines[0].qty).toBe(50);
  });
  it('DY-alvo maior reduz o teto e pode tirar o ativo da compra', () => {
    expect(setup(20, 400, 10).lines.length).toBe(0); // teto 20 → margem 0% → manutenção (excluída)
  });
});
