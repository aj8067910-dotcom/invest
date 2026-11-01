import { describe, expect, it } from 'vitest';
import { buildRecords, exportRows, materialize, SHEETS, autoMap, detectKind, type RawSheet } from './opsheet';
import { computePosition, computePositions, portfolioTotals } from './calc/positions';
import { seedAssets, makeAsset } from './seed';
import type { OpCategory, Transaction } from './types';
import { assignFingerprints } from './ledger';

// Linhas de TESTE (valores fictícios) com os cabeçalhos exatos do modelo oficial
const H = (cat: OpCategory) => SHEETS[cat].fields.map((f) => f.header);
const sheet = (cat: OpCategory, rows: unknown[][]): RawSheet => ({
  name: SHEETS[cat].tab,
  headers: H(cat),
  rows: rows.map((r) => Object.fromEntries(H(cat).map((h, i) => [h, r[i] ?? '']))),
});
const build = (sheets: RawSheet[], existing: Transaction[] = [], assets = seedAssets()) =>
  buildRecords({ sheets, plans: sheets.map((s) => ({ name: s.name, kind: detectKind(s), mapping: autoMap(detectKind(s) as OpCategory, s.headers) })), assets, existing, edits: {}, includes: {}, classOverride: {} });

describe('planilha da Central de Operações', () => {
  const file = [
    sheet('acoes', [
      ['ITUB4', 'Ação', 'Compra', 100, '30,00', '3.000,00', 100, '05/01/2024', 'Rico', '1,50', '', '', 'N1'],
      ['ITUB4', 'Ação', 'Compra', 100, 40, 4000, 200, '05/06/2024', 'Rico', 0, '', '', 'N2'],
      ['ITUB4', 'Ação', 'Venda', 50, 45, 2250, 150, '05/01/2025', 'Rico', 0, '', '', 'N3'],
      ['XXXX9', 'Ação', 'Compra', 10, 10, 100, '', '32/13/2025', '', '', '', '', ''],
    ]),
    sheet('fiis', [['MXRF11', 'FII', 'Saldo inicial', 500, 10, 5000, 500, '01/12/2025', 'Rico', '', '', 'posição de abertura', '']]),
    sheet('renda_fixa', [['Tesouro IPCA+ 2029', 'Tesouro Direto', 'Aplicação', 'Rico', 1000, 6.5, 'IPCA+', '10/12/2025', '15/05/2029', '', '', '', '', '']]),
    sheet('proventos', [
      ['MXRF11', 'FII', 'Rendimentos', '30/12/2025', '15/01/2026', 500, 0.1, 50, 'Rico', '', ''],
      ['ITUB4', 'Ação', 'JCP', '', '01/02/2026', 150, 0.2, 25.5, 'Rico', '', ''],
    ]),
    sheet('aportes', [
      ['01/12/2025', 10000, 'Salário', 'Banco X', 'Rico', 'Aporte', '', ''],
      ['20/01/2026', 50, 'Proventos', 'Rico', 'Rico', 'Aporte', '', ''],
    ]),
    sheet('eventos', [['ITUB4', 'Bonificação', '20/03/2025', 150, 15, '', '', 18.5, '']]),
    sheet('transferencias', [['MXRF11', 'XP', 'Rico', 'Transferência de custódia', 500, '02/12/2025', '', '']]),
  ];

  it('reconhece as 8 abas pelos nomes e cabeçalhos exatos', () => {
    for (const s of file) expect(detectKind(s)).not.toBe('ignorar');
    expect(autoMap('acoes', H('acoes')).quantidadeTotal).toBe('Quantidade total');
  });

  it('valida, separa aporte de reinvestimento e não descarta nada silenciosamente', () => {
    const r = build(file);
    expect(r.stats.total).toBe(12);
    const bad = r.records.find((x) => x.values.ativo === 'XXXX9')!;
    expect(bad.status).toBe('erro');
    expect(bad.issues.some((i) => i.msg.includes('Data'))).toBe(true);
    const reinv = r.records.find((x) => x.tx?.type === 'reinvestimento');
    expect(reinv).toBeTruthy();
    expect(r.records.filter((x) => x.tx?.type === 'aporte').length).toBe(1);
    expect(r.stats.byCategory.acoes).toBe(3);
    expect(r.stats.errors).toBe(1);
  });

  it('reconstrói a carteira: bonificação com custo, venda, saldo inicial, transferência e renda fixa por valor', () => {
    const assets = seedAssets();
    const r = build(file, [], assets);
    const { txs } = materialize(r);
    const pos = computePositions(assets, txs);
    const itub = pos[assets.find((a) => a.ticker === 'ITUB4')!.id];
    // 100@30 + 1,50 + 100@40 = 7001,50 / 200 → venda 50 → 150 (custo 5251,125) → +15 bonificadas a 18,50
    expect(itub.qty).toBe(165);
    expect(itub.realized).toBeCloseTo(2250 - (7001.5 / 200) * 50, 4);
    expect(itub.costBasis).toBeCloseTo(7001.5 * 0.75 + 15 * 18.5, 4);
    expect(itub.qtySold).toBe(50);
    const mxrf = pos[assets.find((a) => a.ticker === 'MXRF11')!.id];
    expect(mxrf.qty).toBe(500); // transferência de custódia não soma
    expect(mxrf.avgPrice).toBe(10);
    const td = pos[assets.find((a) => a.ticker === 'IPCA2029')!.id];
    expect(td.valueOnly).toBe(true);
    expect(td.costBasis).toBe(1000);
    const tot = portfolioTotals(assets, pos, txs);
    expect(tot.deposits).toBe(10000); // reinvestimento não é aporte externo
    expect(tot.reinvestedIncome).toBe(50);
    expect(tot.income).toBeCloseTo(75.5);
  });

  it('reimportar o mesmo arquivo não duplica nada', () => {
    const first = materialize(build(file)).txs;
    const again = build(file, first);
    expect(again.stats.toImport).toBe(0);
    expect(again.stats.duplicates).toBe(11);
  });

  it('exportação no formato da planilha volta como duplicada (ida e volta)', () => {
    const assets = seedAssets();
    const { txs } = materialize(build(file, [], assets));
    const rows = exportRows(txs, assets);
    const sheets = (Object.keys(rows) as OpCategory[]).filter((c) => rows[c].length).map((c) => ({ name: SHEETS[c].tab, headers: H(c), rows: rows[c] }));
    const back = build(sheets, txs, assets);
    expect(back.stats.toImport).toBe(0);
  });

  it('avisa divergência entre Quantidade total informada e posição calculada', () => {
    const r = build([sheet('acoes', [['BBSE3', 'Ação', 'Compra', 10, 30, 300, 12, '05/01/2024', '', '', '', '', '']])]);
    expect(r.records[0].issues.some((i) => i.msg.includes('Quantidade total informada'))).toBe(true);
  });

  it('venda sem compras anteriores vai para revisão sugerindo saldo inicial', () => {
    const r = build([sheet('acoes', [['VALE3', 'Ação', 'Venda', 10, 60, 600, '', '05/01/2026', '', '', '', '', '']])]);
    expect(r.records[0].issues.some((i) => i.msg.includes('saldo inicial'))).toBe(true);
  });

  it('processa 5.000 operações rapidamente', () => {
    const rows: unknown[][] = [];
    for (let i = 0; i < 5000; i++) {
      const d = new Date(Date.UTC(2015, 0, 1) + i * 86400000);
      rows.push(['ITSA4', 'Ação', i % 5 === 4 ? 'Venda' : 'Compra', 10, 10 + (i % 7), 10 * (10 + (i % 7)), '', `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`, 'Rico', '', '', '', `T${i}`]);
    }
    const t0 = Date.now();
    const assets = seedAssets();
    const r = build([sheet('acoes', rows)], [], assets);
    const { txs } = materialize(r);
    const p = computePositions(assets, txs)[assets.find((a) => a.ticker === 'ITSA4')!.id];
    expect(r.stats.toImport).toBe(5000);
    expect(p.qty).toBe(4000 * 10 - 1000 * 10);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});

describe('motor de posição: eventos corporativos', () => {
  const a = makeAsset({ ticker: 'TEST3', class: 'acao' });
  const tx = (o: Partial<Transaction>): Transaction => ({ id: Math.random().toString(36), date: '2025-01-01', type: 'compra', assetId: a.id, amount: 0, ...o });
  it('desdobramento e grupamento mudam quantidade e mantêm o custo', () => {
    const p = computePosition(a, [tx({ qty: 100, price: 20, amount: 2000 }), tx({ date: '2025-02-01', type: 'desdobramento', factor: 2 }), tx({ date: '2025-03-01', type: 'grupamento', factor: 10 })]);
    expect(p.qty).toBe(20);
    expect(p.costBasis).toBe(2000);
    expect(p.avgPrice).toBe(100);
  });
  it('evento no mesmo dia é processado antes da compra', () => {
    const p = computePosition(a, [tx({ date: '2025-02-01', qty: 10, price: 5, amount: 50 }), tx({ qty: 10, price: 10, amount: 100 }), tx({ date: '2025-02-01', type: 'desdobramento', factor: 2 })]);
    expect(p.qty).toBe(30);
  });
  it('grupamento que gera fração vai para revisão', () => {
    const p = computePosition(a, [tx({ qty: 15, price: 1, amount: 15 }), tx({ date: '2025-02-01', type: 'grupamento', factor: 10 })]);
    expect(p.reviews.some((r) => r.message.includes('fração'))).toBe(true);
  });
  it('identificador da operação define a impressão digital', () => {
    const [x] = assignFingerprints([tx({ extId: 'NOTA-1', qty: 1, amount: 1 })]);
    expect(x.fingerprint).toContain('id:nota-1');
  });
});

import { migrateTransactions } from './ledger';
describe('migração de dados antigos', () => {
  it('operações da versão anterior ganham categoria e impressão digital sem perder nada', () => {
    const assets = seedAssets();
    const itub = assets.find((a) => a.ticker === 'ITUB4')!;
    const old: Transaction[] = [
      { id: 'a', date: '2025-12-05', type: 'compra', assetId: itub.id, qty: 10, price: 35, fees: 0, amount: 350 },
      { id: 'b', date: '2025-12-05', type: 'compra', assetId: itub.id, qty: 10, price: 35, fees: 0, amount: 350 },
      { id: 'c', date: '2025-12-01', type: 'aporte', amount: 1000 },
    ];
    const m = migrateTransactions(old, assets);
    expect(m.length).toBe(3);
    expect(m.map((t) => t.category)).toEqual(['acoes', 'acoes', 'aportes']);
    expect(new Set(m.map((t) => t.fingerprint)).size).toBe(3);
    expect(computePositions(assets, m)[itub.id].qty).toBe(20);
  });
});
