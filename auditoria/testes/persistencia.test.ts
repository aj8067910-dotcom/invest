// AUDITORIA — Seção 11: livro de lançamentos, estornos, duplicidade e backup (store em memória, sem tocar dados reais).
import { describe, expect, it, beforeEach } from 'vitest';
import { useStore, makeBackup } from '../../src/store/store';
import { activeTransactions } from '../../src/domain/ledger';
import { planAutoProventos, type CalendarItem } from '../../src/domain/calc/proventos';
import { defaultSettings } from '../../src/domain/seed';
import type { Transaction } from '../../src/domain/types';

const S = defaultSettings();
const AS = '2026-10-31';
const st = () => useStore.getState();
const ticker = 'ITUB4';
const asset = () => st().assets.find((a) => a.ticker === ticker)!;

beforeEach(() => useStore.setState({ transactions: [], audit: [], imports: [], conciliations: [] }));

describe('Seção 11 — persistência e integridade do livro', () => {
  it('criar, corrigir e excluir nunca apagam registros (só estornos)', () => {
    const r = st().addTransaction({ date: '2026-01-05', type: 'compra', assetId: asset().id, ticker, qty: 10, price: 30, amount: 300 });
    if (!r.ok) throw new Error('não criou');
    st().updateTransaction(r.id, { qty: 12, amount: 360 }, 'teste');
    const corr = activeTransactions(st().transactions).find((t) => t.type === 'compra')!;
    st().removeTransaction(corr.id, 'teste');
    expect(st().transactions.length).toBe(4); // original, estorno, correção, estorno
    expect(activeTransactions(st().transactions).length).toBe(0);
    expect(st().audit.length).toBeGreaterThanOrEqual(3);
  });
  it('relançar uma operação estornada não é bloqueado como duplicada', () => {
    const r = st().addTransaction({ date: '2026-01-05', type: 'compra', assetId: asset().id, ticker, qty: 10, price: 30, amount: 300 });
    if (!r.ok) throw new Error('não criou');
    st().removeTransaction(r.id, 'lançado por engano');
    const again = st().addTransaction({ date: '2026-01-05', type: 'compra', assetId: asset().id, ticker, qty: 10, price: 30, amount: 300 });
    expect(again.ok).toBe(true);
    expect(activeTransactions(st().transactions).length).toBe(1);
  });
  it('duplicata de operação ATIVA continua bloqueada', () => {
    st().addTransaction({ date: '2026-01-05', type: 'compra', assetId: asset().id, ticker, qty: 10, price: 30, amount: 300 });
    expect(st().addTransaction({ date: '2026-01-05', type: 'compra', assetId: asset().id, ticker, qty: 10, price: 30, amount: 300 }).ok).toBe(false);
  });
  it('[ACHADO A-04] recálculo de provento automático (mesma data-com) recria o lançamento estornado', () => {
    const cal: Record<string, CalendarItem[]> = { [ticker]: [{ type: 'jcp', perUnit: 0.2, dataCom: '2026-03-02', payDate: '2026-04-01', source: 'B3', collectedAt: AS }] };
    const r = st().addTransaction({ date: '2026-01-05', type: 'compra', assetId: asset().id, ticker, qty: 100, price: 30, amount: 3000 });
    if (!r.ok) throw new Error('não criou');
    st().applyAutoPlan(planAutoProventos(st().assets, st().transactions, cal, S, AS));
    const first = activeTransactions(st().transactions).filter((t) => t.auto);
    expect(first.length).toBe(1);
    expect(first[0].qty).toBe(100);
    // corrige a compra para 150 ações → o provento precisa ser estornado E recriado com 150
    st().updateTransaction(r.id, { qty: 150, amount: 4500 }, 'quantidade errada');
    st().applyAutoPlan(planAutoProventos(st().assets, st().transactions, cal, S, AS));
    const after = activeTransactions(st().transactions).filter((t) => t.auto);
    expect(after.length).toBe(1);
    expect(after[0].qty).toBe(150);
  });
  it('reimportação depois de reverter um lote grava de novo as operações', () => {
    const tx = (id: string): Transaction => ({ id, date: '2026-02-01', type: 'compra', assetId: asset().id, ticker, qty: 5, price: 30, amount: 150, fingerprint: `acoes|2026-02-01|ITUB4|compra|5|30|||` });
    st().beginImport({ id: 'L1', at: AS, fileName: 'a.xlsx', fileHash: 'h', totalRows: 1, toImport: 1, imported: 0, skippedDuplicates: 0, excluded: 0, pending: 0, newAssets: [], byCategory: {}, volume: 150, status: 'em_andamento' } as any);
    st().commitImportChunk('L1', [tx('a1')], [], 0);
    st().revertImport('L1');
    expect(activeTransactions(st().transactions).length).toBe(0);
    st().beginImport({ id: 'L2', at: AS, fileName: 'a.xlsx', fileHash: 'h', totalRows: 1, toImport: 1, imported: 0, skippedDuplicates: 0, excluded: 0, pending: 0, newAssets: [], byCategory: {}, volume: 150, status: 'em_andamento' } as any);
    expect(st().commitImportChunk('L2', [tx('a2')], [], 0)).toBe(1);
    expect(activeTransactions(st().transactions).length).toBe(1);
  });
  it('backup completo inclui livro, auditoria, importações e conciliações e restaura igual', () => {
    st().addTransaction({ date: '2026-01-05', type: 'compra', assetId: asset().id, ticker, qty: 10, price: 30, amount: 300 });
    const b = makeBackup();
    const json = JSON.parse(JSON.stringify(b));
    useStore.setState({ transactions: [] });
    st().restoreBackup(json);
    expect(st().transactions.length).toBe(1);
    expect(Object.keys(b)).toEqual(expect.arrayContaining(['transactions', 'assets', 'settings', 'audit', 'imports', 'conciliations']));
  });
});
