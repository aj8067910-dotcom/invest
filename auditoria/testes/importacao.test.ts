// AUDITORIA — Seção 4: importação em massa (sem tocar na carteira real: fixtures em memória).
import { describe, expect, it } from 'vitest';
import { buildRecords, autoMap, detectKind, exportRows, materialize, SHEETS, type RawSheet } from '../../src/domain/opsheet';
import { computePositions } from '../../src/domain/calc/positions';
import { activeTransactions, assignFingerprints } from '../../src/domain/ledger';
import { seedAssets } from '../../src/domain/seed';
import type { OpCategory, Transaction } from '../../src/domain/types';

const H = (cat: OpCategory) => SHEETS[cat].fields.map((f) => f.header);
const sheet = (cat: OpCategory, rows: unknown[][], name = SHEETS[cat].tab): RawSheet => ({ name, headers: H(cat), rows: rows.map((r) => Object.fromEntries(H(cat).map((h, i) => [h, r[i] ?? '']))) });
const build = (sheets: RawSheet[], existing: Transaction[] = [], assets = seedAssets(), edits = {}) =>
  buildRecords({ sheets, plans: sheets.map((s) => ({ name: s.name, kind: detectKind(s), mapping: autoMap(detectKind(s) as OpCategory, s.headers) })), assets, existing, edits, includes: {}, classOverride: {} });

describe('Seção 4 — importação', () => {
  it('(1)(3) arquivo válido com várias abas é reconhecido por categoria', () => {
    const r = build([
      sheet('acoes', [['ITUB4', 'Ação', 'Compra', 10, 30, 300, '', '02/01/2025', 'Rico', 0, '', '', '']]),
      sheet('fiis', [['MXRF11', 'FII', 'Compra', 10, 10, 100, '', '02/01/2025', 'Rico', 0, '', '', '']]),
      sheet('aportes', [['01/01/2025', 1000, 'Salário', 'Banco', 'Rico', 'Aporte', '', '']]),
    ]);
    expect(r.stats.byCategory).toMatchObject({ acoes: 1, fiis: 1, aportes: 1 });
    expect(r.stats.errors).toBe(0);
  });
  it('(4) datas em formatos diferentes: dd/mm/aaaa, aaaa-mm-dd e número de série do Excel', () => {
    const r = build([sheet('acoes', [
      ['ITUB4', 'Ação', 'Compra', 1, 30, 30, '', '05/03/2025', '', 0, '', '', 'a'],
      ['ITUB4', 'Ação', 'Compra', 1, 31, 31, '', '2025-03-06', '', 0, '', '', 'b'],
      ['ITUB4', 'Ação', 'Compra', 1, 32, 32, '', 45723, '', 0, '', '', 'c'], // 07/03/2025
    ])]);
    expect(r.records.map((x) => x.tx?.date)).toEqual(['2025-03-05', '2025-03-06', '2025-03-07']);
  });
  it('(5)(6)(10) células vazias, valores inválidos e linhas parciais viram erro listado (nada descartado em silêncio)', () => {
    const r = build([sheet('acoes', [
      ['ITUB4', 'Ação', 'Compra', '', 30, '', '', '05/03/2025', '', '', '', '', ''],
      ['ITUB4', 'Ação', 'Compra', 'abc', 30, '', '', '05/03/2025', '', '', '', '', ''],
      ['ITUB4', 'Ação', 'Compra', 10, 30, 300, '', '31/02/2025', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '', ''], // linha vazia: ignorada
    ])]);
    expect(r.stats.total).toBe(3);
    expect(r.records.every((x) => x.status === 'erro' || x.issues.length > 0)).toBe(true);
    expect(r.stats.toImport).toBeLessThan(3);
  });
  it('(7) ativo desconhecido é proposto como novo ativo (com aviso)', () => {
    const r = build([sheet('acoes', [['ZZZZ3', 'Ação', 'Compra', 10, 5, 50, '', '05/03/2025', '', 0, '', '', '']])]);
    expect(r.newAssets.map((a) => a.ticker)).toContain('ZZZZ3');
    expect(r.records[0].issues.some((i) => /não cadastrado|novo/i.test(i.msg))).toBe(true);
  });
  it('(8) duplicidade com o que já existe é detectada; reimportar o mesmo arquivo não duplica', () => {
    const s = [sheet('acoes', [['ITUB4', 'Ação', 'Compra', 10, 30, 300, '', '02/01/2025', 'Rico', 0, '', '', '']])];
    const first = materialize(build(s)).txs;
    const again = build(s, first);
    expect(again.stats.duplicates).toBe(1);
    expect(again.stats.toImport).toBe(0);
  });
  it('(9) operações fora de ordem cronológica são reconstruídas pela data', () => {
    const assets = seedAssets();
    const r = build([sheet('acoes', [
      ['ITUB4', 'Ação', 'Venda', 50, 40, 2000, '', '10/03/2025', '', 0, '', '', ''],
      ['ITUB4', 'Ação', 'Compra', 100, 30, 3000, '', '10/01/2025', '', 0, '', '', ''],
    ])], [], assets);
    const { txs } = materialize(r);
    const it4 = assets.find((a) => a.ticker === 'ITUB4')!;
    const p = computePositions(assets, txs, '2026-10-31')[it4.id];
    expect(p.qty).toBe(50);
    expect(p.realized).toBeCloseTo(500, 10);
    expect(p.reviews.length).toBe(0); // a venda não foi vista "sem posição"
  });
  it('(11) reprocessamento após correção: a correção na revisão vale', () => {
    const s = [sheet('acoes', [['ITUB4', 'Ação', 'Compra', 'abc', 30, '', '', '05/03/2025', '', 0, '', '', '']])];
    const r1 = build(s);
    const key = r1.records[0].key;
    const r2 = build(s, [], seedAssets(), { [key]: { quantidade: 10 } });
    expect(r2.records[0].status).not.toBe('erro');
    expect(r2.records[0].tx?.qty).toBe(10);
  });
  it('[ACHADO A-02] depois de reverter uma importação (estorno), reimportar o arquivo corrigido não pode descartar as linhas como duplicadas', () => {
    const s = [sheet('acoes', [
      ['ITUB4', 'Ação', 'Compra', 10, 30, 300, '', '02/01/2025', 'Rico', 0, '', '', ''],
      ['ITUB4', 'Ação', 'Compra', 10, 31, 310, '', '03/01/2025', 'Rico', 0, '', '', ''],
    ])];
    const imported = materialize(build(s)).txs;
    const reversals = imported.map((t, i) => ({ id: `est${i}`, date: '2026-01-01', type: 'estorno', reversalOf: t.id, amount: t.amount } as Transaction));
    const ledger = assignFingerprints([...imported, ...reversals]);
    expect(activeTransactions(ledger).length).toBe(0);
    const again = build(s, ledger);
    expect(again.stats.toImport).toBe(2);
  });
  it('(12) exportação → importação é ida e volta sem perda (todas reconhecidas como já existentes)', () => {
    const assets = seedAssets();
    const r = build([
      sheet('acoes', [['ITUB4', 'Ação', 'Compra', 10, 30, 300, '', '02/01/2025', 'Rico', 0, '', '', '']]),
      sheet('proventos', [['ITUB4', 'Ação', 'JCP', '01/03/2025', '20/03/2025', 10, 0.2, 1.65, 'Rico', '', '']]),
    ], [], assets);
    const { txs } = materialize(r);
    const rows = exportRows(txs, assets);
    const back = (Object.keys(rows) as OpCategory[]).filter((c) => rows[c].length).map((c) => ({ name: SHEETS[c].tab, headers: Object.keys(rows[c][0]), rows: rows[c] } as RawSheet));
    const again = build(back, txs, assets);
    expect(again.stats.toImport).toBe(0);
    expect(again.stats.duplicates).toBe(txs.length);
  });
  it('(2) grande volume: 10.000 operações validadas e reconstruídas em tempo aceitável', () => {
    const rows: unknown[][] = [];
    for (let i = 0; i < 10000; i++) {
      const d = new Date(Date.UTC(2015, 0, 1) + i * 86400000 * 0.4);
      rows.push(['ITUB4', 'Ação', i % 5 === 4 ? 'Venda' : 'Compra', 1, 20 + (i % 13), 20 + (i % 13), '', d.toISOString().slice(0, 10), 'Rico', 0, '', '', `V${i}`]);
    }
    const assets = seedAssets();
    let t0 = performance.now();
    const r = build([sheet('acoes', rows)], [], assets);
    const tBuild = performance.now() - t0;
    t0 = performance.now();
    const { txs } = materialize(r);
    const p = computePositions(assets, txs, '2026-10-31');
    const tCalc = performance.now() - t0;
    expect(r.stats.toImport).toBe(10000);
    expect(p[assets.find((a) => a.ticker === 'ITUB4')!.id].qty).toBe(6000);
    console.log(`[desempenho] validar 10.000 linhas: ${tBuild.toFixed(0)} ms · reconstruir posições: ${tCalc.toFixed(0)} ms`);
    expect(tBuild + tCalc).toBeLessThan(15000);
  });
});
