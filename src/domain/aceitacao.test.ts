// Testes de aceitação (18 casos da especificação) + livro só de inclusão e idempotência.
import { describe, expect, it } from 'vitest';
import { computePosition, computePositions, positionAt } from './calc/positions';
import { computeBazin } from './calc/bazin';
import { provTax, dividendMonthlyIR } from './tax';
import { twr, capitalForIncome } from './calc/returns';
import { planContribution } from './calc/allocator';
import { computeAllocation } from './calc/allocation';
import { rankAssets, scoreAsset } from './calc/scoring';
import { altmanZEM, analyze } from './calc/analysis360';
import { planAutoProventos, provStatus, type CalendarItem } from './calc/proventos';
import { activeTransactions } from './ledger';
import { defaultSettings, makeAsset, seedAssets } from './seed';
import { emptyMarket } from './market';
import type { Asset, Transaction } from './types';
import { useStore } from '../store/store';

const S = defaultSettings();
let n = 0;
const tx = (a: Asset, o: Partial<Transaction>): Transaction => ({ id: `t${++n}`, date: '2026-01-01', type: 'compra', assetId: a.id, ticker: a.ticker, amount: 0, ...o });

describe('Preço médio, venda e eventos (casos 1–4)', () => {
  const a = makeAsset({ ticker: 'CASO3', class: 'acao' });
  const t1 = tx(a, { date: '2026-01-02', qty: 100, price: 10, fees: 1, amount: 1001 });
  const t2 = tx(a, { date: '2026-01-05', qty: 50, price: 13, fees: 0.5, amount: 650.5 });
  const t3 = tx(a, { date: '2026-01-10', type: 'venda', qty: 60, price: 15, fees: 0.6, amount: 899.4 });
  const t4 = tx(a, { date: '2026-01-15', type: 'desdobramento', factor: 2 });
  const t5 = tx(a, { date: '2026-01-20', type: 'bonificacao', factor: 0.1, price: 4 });
  it('1. PM = R$ 11,01', () => expect(computePosition(a, [t1, t2]).avgPrice).toBeCloseTo(11.01, 10));
  it('2. venda: realizado R$ 238,80; restam 90 a R$ 11,01', () => {
    const p = computePosition(a, [t1, t2, t3]);
    expect(p.realized).toBeCloseTo(238.8, 10);
    expect(p.qty).toBe(90);
    expect(p.avgPrice).toBeCloseTo(11.01, 10);
  });
  it('3. desdobramento 1:2: 180 ações, PM R$ 5,505, custo R$ 990,90', () => {
    const p = computePosition(a, [t1, t2, t3, t4]);
    expect(p.qty).toBe(180);
    expect(p.avgPrice).toBeCloseTo(5.505, 10);
    expect(p.costBasis).toBeCloseTo(990.9, 10);
  });
  it('4. bonificação de 10% a R$ 4,00: 198 ações, custo R$ 1.062,90, PM R$ 5,37', () => {
    const p = computePosition(a, [t1, t2, t3, t4, t5]);
    expect(p.qty).toBe(198);
    expect(p.costBasis).toBeCloseTo(1062.9, 10);
    expect(Math.round(p.avgPrice * 100) / 100).toBe(5.37);
  });
});

describe('Preço-teto, régua e classificação (casos 5, 9, 12)', () => {
  const mk = (price: number, extra: Partial<Asset> = {}, ticker = 'BBSE3') => {
    const assets = seedAssets();
    const a = assets.find((x) => x.ticker === ticker)!;
    Object.assign(a, { dyTarget: 8, next12mEstimate: 2, useEstimate: true, thesis: 'Tese registrada.', fundamentals: { roe: 30, netMargin: 25, payout: 70 }, ...extra });
    a.quote = { price, date: '2026-10-31', source: 'teste' };
    const positions = computePositions(assets, []);
    const ctx = { assets, positions, settings: S, alloc: computeAllocation(assets, positions, S), market: emptyMarket(), asOf: '2026-10-31' };
    return { a, ctx, assets };
  };
  it('5. teto R$ 25,00 e oportunidade R$ 21,25; R$ 26 Aguardar; R$ 22 Manutenção (12%); R$ 20,50 Oportunidade (18%)', () => {
    const r26 = computeBazin(mk(26).a, S);
    expect(r26.ceiling).toBeCloseTo(25);
    expect(r26.opportunityPrice).toBeCloseTo(21.25);
    expect(r26.band).toBe('aguardar');
    const c22 = mk(22);
    expect(computeBazin(c22.a, S).margin).toBeCloseTo(12);
    expect(scoreAsset(c22.a, c22.ctx).priority).toBe('manutencao');
    const c20 = mk(20.5);
    expect(computeBazin(c20.a, S).margin).toBeCloseTo(18);
    expect(scoreAsset(c20.a, c20.ctx).priority).toBe('oportunidade');
  });
  it('5b. sem tese registrada, a margem de 18% não basta: Manutenção', () => {
    const c = mk(20.5, { thesis: '' });
    const r = scoreAsset(c.a, c.ctx);
    expect(r.priority).toBe('manutencao');
    expect(r.quality.failures.join(' ')).toContain('tese');
  });
  it('9. aporte de R$ 400 a R$ 21,25 → 19 cotas (R$ 403,75)', () => {
    const c = mk(21.25);
    const plan = planContribution({ amount: 400, date: '2026-10-31', reserve: 0, maxPerAsset: 400, priorityClasses: [], eligibleIds: [c.a.id], includeMaintenance: true, mode: 'concentrar', maxAssets: 1 }, rankAssets(c.ctx), c.ctx);
    expect(plan.lines[0].qty).toBe(19);
    expect(plan.lines[0].cost).toBeCloseTo(403.75, 10);
  });
  it('12. margem de 18% com Dív. Líq./EBITDA 3,8x → Aguardar, motivo "endividamento acima de 3,5x"', () => {
    const c = mk(20.5, { fundamentals: { roe: 30, netMargin: 18, payout: 70, netDebtEbitda: 3.8 } }, 'POMO4'); // empresa não financeira
    const r = scoreAsset(c.a, c.ctx);
    expect(r.priority).toBe('aguardar');
    expect(r.reasons.join(' ')).toContain('endividamento acima de 3,5x');
  });
});

describe('Tributação, rentabilidade e metas (casos 6, 7, 8, 10, 11)', () => {
  it('6. JCP bruto R$ 1,00 → líquido R$ 0,825', () => expect(provTax('jcp', 1, S.tax).net.toNumber()).toBe(0.825));
  it('7. TWR acumulada = 8,9%', () => {
    const r = twr([
      { month: '2026-01', startValue: 0, flow: 1000, endValue: 1100, income: 0 },
      { month: '2026-02', startValue: 1100, flow: 1000, endValue: 2079, income: 0 },
    ]);
    expect(r.total).toBeCloseTo(0.089, 10);
  });
  it('8. renda de R$ 1.000/mês com DY de 8% → capital necessário R$ 150.000', () => expect(capitalForIncome(1000, 8)).toBe(150000));
  it('10. dividendos de R$ 50.000,01 de uma empresa no mês → IR R$ 5.000,00', () => expect(dividendMonthlyIR(50000.01, S.tax).toNumber()).toBe(5000));
  it('10b. até R$ 50.000,00 → isento', () => expect(dividendMonthlyIR(50000, S.tax).toNumber()).toBe(0));
  it('11. Altman Z″ emergentes = 6,55 (zona segura)', () => {
    const z = altmanZEM(0.15, 0.2, 0.12, 0.818);
    expect(Math.round(z * 100) / 100).toBe(6.55);
    expect(z).toBeGreaterThan(S.limits360.altmanSafe);
  });
});

describe('Qualidade do lucro (caso 13)', () => {
  it('13. FCO R$ 80 e lucro R$ 100 por dois anos → alerta amarelo', () => {
    const a = makeAsset({ ticker: 'QLD3', class: 'acao', sector: 'Varejo' });
    a.quote = { price: 10, date: '2026-10-31', source: 't' };
    const m = emptyMarket();
    m.companies.QLD3 = { ticker: 'QLD3', codeCVM: null, name: 'Q', segment: 'NM', financial: false, source: 'teste', dataBase: '2025-12-31', collectedAt: '', years: [
      { year: 2024, netIncome: 100, fco: 80, totalAssets: 1000, revenue: 500 },
      { year: 2025, netIncome: 100, fco: 80, totalAssets: 1000, revenue: 500 },
    ] };
    const an = analyze(a, S, m, computeBazin(a, S), undefined);
    const q = an.blocks.find((b) => b.key === 'qualidade')!.items.find((i) => i.key === 'fcoNi')!;
    expect(q.status).toBe('amarelo');
    expect(q.value).toBeCloseTo(0.8);
  });
});

describe('Lançamento automático de proventos pela data-com (casos 14–18)', () => {
  const setup = (ops: Partial<Transaction>[], item: Partial<CalendarItem>, asOf = '2026-04-15') => {
    const a = makeAsset({ ticker: 'PROV3', class: 'acao', issuer: 'Prov SA' });
    const txs = ops.map((o) => tx(a, o));
    const cal = { PROV3: [{ type: 'dividendo', perUnit: 0.5, dataCom: '2026-04-10', dataEx: '2026-04-13', payDate: '2026-05-20', source: 'B3', collectedAt: '2026-04-10T00:00:00Z', ...item } as CalendarItem] };
    return { a, txs, cal, plan: planAutoProventos([a], txs, cal, S, asOf) };
  };
  it('14. 100 em 08/04 + 50 em 10/04 (data-com) + 30 em 11/04 → 150 elegíveis, bruto R$ 75,00, PROVISIONADO', () => {
    const { plan } = setup([{ date: '2026-04-08', qty: 100, price: 10, amount: 1000 }, { date: '2026-04-10', qty: 50, price: 10, amount: 500 }, { date: '2026-04-11', qty: 30, price: 10, amount: 300 }], {});
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].qty).toBe(150);
    expect(plan.create[0].gross).toBe(75);
    expect(provStatus(plan.create[0], '2026-04-15')).toBe('provisionado');
    expect(provStatus(plan.create[0], '2026-05-20')).toBe('recebido');
  });
  it('15. 200 ações; venda de 80 na data-com → 120; venda na data-ex → 200', () => {
    const buy = { date: '2026-03-01', qty: 200, price: 10, amount: 2000 };
    expect(setup([buy, { date: '2026-04-10', type: 'venda', qty: 80, price: 11, amount: 880 }], {}).plan.create[0].qty).toBe(120);
    expect(setup([buy, { date: '2026-04-13', type: 'venda', qty: 80, price: 11, amount: 880 }], {}).plan.create[0].qty).toBe(200);
  });
  it('16. JCP de R$ 0,40 para 150 ações → bruto R$ 60,00, IR R$ 10,50, líquido R$ 49,50', () => {
    const { plan } = setup([{ date: '2026-03-01', qty: 150, price: 10, amount: 1500 }], { type: 'jcp', perUnit: 0.4 });
    expect(plan.create[0].gross).toBe(60);
    expect(plan.create[0].ir).toBe(10.5);
    expect(plan.create[0].amount).toBe(49.5);
  });
  it('17. desdobramento 1:2 depois da data-com não altera o provento devido', () => {
    const { plan, a, txs } = setup([{ date: '2026-03-01', qty: 100, price: 10, amount: 1000 }, { date: '2026-04-14', type: 'desdobramento', factor: 2 }], {});
    expect(plan.create[0].qty).toBe(100);
    expect(plan.create[0].gross).toBe(50);
    expect(positionAt(a, txs, '2026-04-20')).toBe(200);
  });
  it('18. provento manual com a mesma chave → um único registro e divergência apontada', () => {
    const { plan } = setup([{ date: '2026-03-01', qty: 100, price: 10, amount: 1000 }, { date: '2026-05-20', type: 'dividendo', amount: 48, payDate: '2026-05-20' }], {}, '2026-06-01');
    expect(plan.create).toHaveLength(0);
    expect(plan.divergences).toHaveLength(1);
    expect(plan.divergences[0].computed).toBe(50);
    expect(plan.divergences[0].manual).toBe(48);
  });
  it('idempotente: aplicar o plano e recalcular não gera nada novo', () => {
    const { a, txs, cal, plan } = setup([{ date: '2026-03-01', qty: 100, price: 10, amount: 1000 }], {});
    const after = [...txs, ...plan.create];
    const again = planAutoProventos([a], after, cal, S, '2026-04-15');
    expect(again.create).toHaveLength(0);
    expect(again.reverse).toHaveLength(0);
  });
  it('retificação: valor por ação alterado pela companhia → estorno do anterior + novo lançamento', () => {
    const { a, txs, plan } = setup([{ date: '2026-03-01', qty: 100, price: 10, amount: 1000 }], {});
    const after = [...txs, ...plan.create];
    const cal2 = { PROV3: [{ type: 'dividendo', perUnit: 0.55, dataCom: '2026-04-10', payDate: '2026-05-20', source: 'B3', collectedAt: '' } as CalendarItem] };
    const again = planAutoProventos([a], after, cal2, S, '2026-04-15');
    expect(again.reverse).toHaveLength(1);
    expect(again.create[0].gross).toBe(55);
  });
  it('dividendos acima de R$ 50 mil no mês da mesma empresa: 10% sobre o total', () => {
    const { plan } = setup([{ date: '2026-03-01', qty: 100001, price: 10, amount: 1000010 }], { perUnit: 0.5 });
    expect(plan.create[0].gross).toBe(50000.5);
    expect(plan.create[0].ir).toBe(5000.05);
  });
});

describe('Livro só de inclusão', () => {
  it('estorno não apaga; correção = estorno + novo; cálculos ignoram o estornado', () => {
    useStore.setState({ transactions: [], audit: [] });
    const a = useStore.getState().assets.find((x) => x.ticker === 'ITUB4')!;
    const r = useStore.getState().addTransaction({ date: '2026-01-05', type: 'compra', assetId: a.id, qty: 10, price: 30, fees: 0, amount: 300 });
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    useStore.getState().updateTransaction(id, { price: 31, amount: 310 }, 'preço digitado errado');
    let all = useStore.getState().transactions;
    expect(all).toHaveLength(3); // original + estorno + corrigido
    expect(all.find((t) => t.id === id)!.price).toBe(30); // original intacto
    const act = activeTransactions(all);
    expect(act).toHaveLength(1);
    expect(act[0].price).toBe(31);
    expect(act[0].correctionOf).toBe(id);
    useStore.getState().removeTransaction(act[0].id, 'lançado por engano');
    all = useStore.getState().transactions;
    expect(all).toHaveLength(4);
    expect(activeTransactions(all)).toHaveLength(0);
    expect(useStore.getState().audit.map((e) => e.action)).toEqual(['estornar', 'corrigir', 'criar']);
  });
});
