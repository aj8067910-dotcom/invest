// AUDITORIA — Seção 3: reconstrução do histórico de operações.
// Valores esperados calculados à mão (comentários), independentes do código auditado.
import { describe, expect, it } from 'vitest';
import { computePositions, portfolioTotals } from '../../src/domain/calc/positions';
import { activeTransactions } from '../../src/domain/ledger';
import { buildRecords, autoMap, detectKind, materialize, SHEETS, type RawSheet } from '../../src/domain/opsheet';
import { makeAsset, seedAssets } from '../../src/domain/seed';
import type { OpCategory, Transaction } from '../../src/domain/types';

const AS = '2026-10-31';
const X = makeAsset({ ticker: 'AUDT3', class: 'acao' });
X.quote = { price: 7.5, date: AS, source: 'fixture' };
let n = 0;
const t = (o: Partial<Transaction>): Transaction => ({ id: `h${++n}`, date: '2025-01-01', type: 'compra', assetId: X.id, ticker: 'AUDT3', amount: 0, ...o });

// Cenário (1)–(8)
const c1 = t({ date: '2025-01-10', qty: 100, price: 10, fees: 1, amount: 1001 }); // custo 1.001,00
const c2 = t({ date: '2025-02-10', qty: 50, price: 13, fees: 0.5, amount: 650.5 }); // custo 1.651,50 · PM 11,01
const d1 = t({ date: '2025-03-15', type: 'dividendo', amount: 30, payDate: '2025-03-15', exDate: '2025-03-01' }); // provento 30
const r1 = t({ date: '2025-03-20', qty: 2, price: 15, amount: 30, reinvest: true }); // reinveste 30 → 152 un · custo 1.681,50 · PM 11,0625
const v1 = t({ date: '2025-04-10', type: 'venda', qty: 52, price: 16, fees: 0.52, amount: 831.48 }); // baixa 52×11,0625=575,25 → realizado 256,23
const c3 = t({ date: '2025-05-10', qty: 20, price: 14, amount: 280 }); // 120 un · custo 1.386,25
const tr = t({ date: '2025-06-01', type: 'transferencia', qty: 120, fromInstitution: 'XP', toInstitution: 'Rico' }); // sem efeito
const sp = t({ date: '2025-07-01', type: 'desdobramento', factor: 2 }); // 240 un · custo 1.386,25 · PM 5,776041…
const ap = { id: 'ap1', date: '2025-01-05', type: 'aporte', amount: 2000 } as Transaction;
const base = [c1, c2, d1, r1, v1, c3, tr, sp];

describe('Seção 3 — histórico (cenários 1 a 8)', () => {
  const p = computePositions([X], [...base, ap], AS)[X.id];
  it('quantidade, custo e PM ao fim', () => {
    expect(p.qty).toBe(240);
    expect(p.costBasis).toBeCloseTo(1386.25, 10);
    expect(p.avgPrice).toBeCloseTo(1386.25 / 240, 10);
  });
  it('quantidade histórica: comprado 172, vendido 52', () => {
    expect(p.qtyBought).toBe(172);
    expect(p.qtySold).toBe(52);
    expect(p.totalBought).toBeCloseTo(1961.5, 10); // capital efetivamente investido em compras
    expect(p.totalSold).toBeCloseTo(831.48, 10);
  });
  it('realizado, não realizado, proventos, reinvestido', () => {
    expect(p.realized).toBeCloseTo(256.23, 10);
    expect(p.marketValue).toBeCloseTo(1800, 10); // 240 × 7,50
    expect(p.unrealized).toBeCloseTo(1800 - 1386.25, 10);
    expect(p.income).toBeCloseTo(30, 10);
    expect(p.reinvested).toBeCloseTo(30, 10);
    expect(p.totalReturn).toBeCloseTo(413.75 + 256.23 + 30, 10); // 699,98
  });
  it('transferência de custódia não altera posição nem vira aporte', () => {
    const sem = computePositions([X], base.filter((x) => x !== tr), AS)[X.id];
    expect(sem.qty).toBe(p.qty);
    expect(sem.costBasis).toBeCloseTo(p.costBasis, 10);
    const tot = portfolioTotals([X], { [X.id]: p }, [...base, ap]);
    expect(tot.deposits).toBe(2000);
  });
  it('dividendo não é valorização; venda não é exclusão', () => {
    const semDiv = computePositions([X], [...base.filter((x) => x !== d1)], AS)[X.id];
    expect(semDiv.unrealized).toBeCloseTo(p.unrealized!, 10);
    expect(p.ledger.find((r) => r.tx.id === v1.id)!.qtyAfter).toBe(100);
  });
  it('[ACHADO A-01] resultado acumulado do painel deve incluir o caixa (proventos e vendas não reinvestidos)', () => {
    // aporte 2.000; compras 1.961,50; vendas 831,48; provento 30 → caixa 899,98; posição 1.800
    // riqueza = 2.699,98; resultado econômico = 699,98 (igual à soma dos retornos das posições)
    const tot = portfolioTotals([X], { [X.id]: p }, [...base, ap]);
    expect(tot.cash).toBeCloseTo(899.98, 10);
    expect(tot.accumulatedResult).toBeCloseTo(699.98, 6);
  });
  it('[ACHADO A-01b] sem aportes lançados, o resultado acumulado não pode virar o patrimônio inteiro', () => {
    const tot = portfolioTotals([X], { [X.id]: p }, base);
    expect(tot.accumulatedResult).toBeCloseTo(699.98, 6);
  });
});

describe('Seção 3 — correção de lançamento antigo (cenário 9)', () => {
  it('estorno + novo lançamento recalcula tudo a partir da data', () => {
    const est = t({ date: AS, type: 'estorno', reversalOf: c2.id, amount: 650.5 });
    const novo = t({ date: '2025-02-10', qty: 60, price: 13, fees: 0.5, amount: 780.5, correctionOf: c2.id });
    const txs = [...base, est, novo];
    expect(activeTransactions(txs).some((x) => x.id === c2.id)).toBe(false);
    const p = computePositions([X], txs, AS)[X.id];
    // 100 (1.001) + 60 (780,5) = 160 · 1.781,5 · +2 (30) = 162 · 1.811,5 → PM 11,182098…
    // venda 52: baixa 52 × 11,182098 = 581,469… → resta 110 · 1.230,03…; +20 (280) = 130 · 1.510,03; ×2 = 260
    expect(p.qty).toBe(260);
    expect(p.costBasis).toBeCloseTo(1811.5 - (1811.5 / 162) * 52 + 280, 8);
    expect(txs.length).toBe(base.length + 2); // nada foi apagado
  });
});

describe('Seção 3 — importação de operações anteriores (cenário 10)', () => {
  const H = (cat: OpCategory) => SHEETS[cat].fields.map((f) => f.header);
  const sheet = (cat: OpCategory, rows: unknown[][]): RawSheet => ({ name: SHEETS[cat].tab, headers: H(cat), rows: rows.map((r) => Object.fromEntries(H(cat).map((h, i) => [h, r[i] ?? '']))) });
  it('compra antiga importada depois entra na ordem cronológica e muda o PM', () => {
    const assets = seedAssets();
    const it4 = assets.find((a) => a.ticker === 'ITUB4')!;
    it4.quote = { price: 40, date: AS, source: 'fixture' };
    const existing: Transaction[] = [{ id: 'e1', date: '2025-06-01', type: 'compra', assetId: it4.id, ticker: 'ITUB4', qty: 100, price: 35, amount: 3500 }];
    const s = sheet('acoes', [['ITUB4', 'Ação', 'Compra', 100, 25, 2500, '', '10/01/2024', 'Rico', 0, '', '', 'ANT-1']]);
    const r = buildRecords({ sheets: [s], plans: [{ name: s.name, kind: detectKind(s), mapping: autoMap('acoes', s.headers) }], assets, existing, edits: {}, includes: {}, classOverride: {} });
    expect(r.stats.toImport).toBe(1);
    const { txs } = materialize(r);
    const p = computePositions(assets, [...existing, ...txs], AS)[it4.id];
    expect(p.qty).toBe(200);
    expect(p.avgPrice).toBeCloseTo(30, 10);
    expect(p.firstBuy).toBe('2024-01-10');
  });
});
