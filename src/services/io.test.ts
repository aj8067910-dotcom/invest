import { describe, expect, it } from 'vitest';
import { parseTransactions } from './io';
import { seedAssets } from '../domain/seed';

// Linhas no formato do extrato de Movimentação da Área do Investidor da B3 (valores fictícios de teste)
const mov = [
  { 'Entrada/Saída': 'Credito', Data: '05/12/2025', 'Movimentação': 'Transferência - Liquidação', Produto: 'ITUB4 - ITAU UNIBANCO HOLDING S.A.', 'Instituição': 'RICO', Quantidade: 10, 'Preço unitário': 35.5, 'Valor da Operação': 355 },
  { 'Entrada/Saída': 'Credito', Data: '15/01/2026', 'Movimentação': 'Rendimento', Produto: 'MXRF11 - MAXI RENDA FUNDO DE INVESTIMENTO IMOBILIARIO', 'Instituição': 'RICO', Quantidade: 50, 'Preço unitário': 0.1, 'Valor da Operação': 5 },
  { 'Entrada/Saída': 'Credito', Data: '02/01/2026', 'Movimentação': 'Juros Sobre Capital Próprio', Produto: 'ITUB4 - ITAU UNIBANCO HOLDING S.A.', 'Instituição': 'RICO', Quantidade: 10, 'Preço unitário': 0.0155, 'Valor da Operação': 0.15 },
  { 'Entrada/Saída': 'Credito', Data: '10/12/2025', 'Movimentação': 'Compra', Produto: 'Tesouro IPCA+ 2029', 'Instituição': 'RICO', Quantidade: 0.1, 'Preço unitário': 3400, 'Valor da Operação': 340 },
  { 'Entrada/Saída': 'Credito', Data: '10/12/2025', 'Movimentação': 'Atualização', Produto: 'ITUB4 - ITAU UNIBANCO HOLDING S.A.', 'Instituição': 'RICO', Quantidade: 1, 'Preço unitário': '-', 'Valor da Operação': '-' },
];
const neg = [
  { 'Data do Negócio': '05/12/2025', 'Tipo de Movimentação': 'Compra', Mercado: 'Mercado Fracionário', 'Prazo/Vencimento': '-', 'Instituição': 'RICO', 'Código de Negociação': 'BBSE3F', Quantidade: 3, 'Preço': 33.1, Valor: 99.3 },
];

describe('importação de extratos da B3', () => {
  it('movimentação: compras, proventos e Tesouro ligados aos ativos cadastrados', () => {
    const assets = seedAssets();
    const r = parseTransactions(mov, assets);
    expect(r.format).toContain('Movimentação');
    expect(r.errors).toEqual([]);
    expect(r.newAssets).toEqual([]);
    expect(r.txs.map((t) => t.type)).toEqual(['compra', 'compra', 'jcp', 'rendimento']);
    const td = r.txs.find((t) => t.ticker === 'IPCA2029')!;
    expect(td.qty).toBe(0.1);
    expect(r.ignored?.[0]).toContain('atualizacao');
  });
  it('negociação: remove o F do mercado fracionário', () => {
    const r = parseTransactions(neg, seedAssets());
    expect(r.txs[0].ticker).toBe('BBSE3');
    expect(r.txs[0].amount).toBeCloseTo(99.3);
  });
});
