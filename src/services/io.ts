// SheetJS é carregado sob demanda (só ao importar/exportar)
const xlsx = () => import('xlsx');
import type { Asset, AssetClass, Distribution, Transaction, TxType } from '../domain/types';
import { CLASS_LABEL, TX_LABEL } from '../domain/types';
import { parseDate, parseNum, todayISO, uid } from '../domain/util';
import type { Position } from '../domain/calc/positions';
import { makeAsset } from '../domain/seed';

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function download(filename: string, data: BlobPart, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ───────────── Exportação ─────────────

export function txRows(txs: Transaction[], assets: Asset[]) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  return [...txs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => ({
      Data: t.date,
      Tipo: TX_LABEL[t.type],
      Ticker: (t.assetId && byId.get(t.assetId)?.ticker) || t.ticker || '',
      Quantidade: t.qty ?? '',
      Preco: t.price ?? '',
      Taxas: t.fees ?? '',
      Valor: Number(t.amount.toFixed(2)),
      Reinvestimento: t.reinvest ? 'sim' : '',
      Observacao: t.notes || '',
    }));
}

export function assetRows(assets: Asset[], positions: Record<string, Position>) {
  return assets.map((a) => {
    const p = positions[a.id];
    return {
      Ticker: a.ticker,
      Nome: a.name,
      Classe: CLASS_LABEL[a.class],
      Status: a.status,
      Setor: a.sector,
      Emissor: a.issuer,
      SegmentoFII: a.fiiSegment || '',
      Quantidade: p?.qty ?? 0,
      PrecoMedio: p ? Number(p.avgPrice.toFixed(4)) : '',
      Cotacao: a.quote.price ?? '',
      DataCotacao: a.quote.date || '',
      FonteCotacao: a.quote.source || '',
      DYAlvo: a.dyTarget ?? '',
      EstimativaProventos12m: a.next12mEstimate ?? '',
      Prioridade: a.priority,
      Risco: a.riskLevel,
      Tese: a.thesisStatus,
    };
  });
}

export function distRows(assets: Asset[]) {
  return assets.flatMap((a) =>
    a.distributions.map((d) => ({ Ticker: a.ticker, DataCom: d.exDate, Pagamento: d.payDate || '', ValorPorUnidade: d.value, Tipo: d.type, Recorrente: d.recurring ? 'sim' : 'nao', Fonte: d.source })),
  );
}

export async function exportXlsx(assets: Asset[], txs: Transaction[], positions: Record<string, Position>) {
  const XLSX = await xlsx();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assetRows(assets, positions)), 'Ativos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows(txs, assets)), 'Transacoes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(distRows(assets)), 'Proventos');
  XLSX.writeFile(wb, `radar-investimentos-${todayISO()}.xlsx`);
}

export async function exportCsv(rows: Record<string, unknown>[], name: string) {
  const XLSX = await xlsx();
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws, { FS: ';' });
  download(`${name}-${todayISO()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}

// ───────────── Importação ─────────────

export async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await xlsx();
  const buf = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name);
  const wb = isCsv ? XLSX.read(new TextDecoder('utf-8').decode(buf), { type: 'string', raw: true }) : XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames.find((n) => /trans|hist|mov|negoc/i.test(n)) || wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: !isCsv });
}

const TYPE_ALIASES: Record<string, TxType> = {
  compra: 'compra', c: 'compra', buy: 'compra',
  venda: 'venda', v: 'venda', sell: 'venda',
  dividendo: 'dividendo', dividendos: 'dividendo',
  jcp: 'jcp', 'juros sobre capital proprio': 'jcp', 'juros sobre capital': 'jcp',
  rendimento: 'rendimento', 'rendimento fii': 'rendimento', rendimentos: 'rendimento',
  juros: 'juros', 'juros/cupom': 'juros', cupom: 'juros',
  amortizacao: 'amortizacao',
  aporte: 'aporte', 'aporte (deposito)': 'aporte', deposito: 'aporte',
  retirada: 'retirada', saque: 'retirada',
};

const pick = (row: Record<string, unknown>, ...keys: string[]) => {
  const map = new Map(Object.keys(row).map((k) => [norm(k).replace(/[^a-z]/g, ''), k]));
  for (const k of keys) {
    const real = map.get(k);
    if (real !== undefined && row[real] !== '') return row[real];
  }
  return undefined;
};

export const guessClass = (ticker: string): AssetClass => (/11$/.test(ticker) ? 'fii' : /^(BTC|ETH|USDC|USDT|SOL)$/i.test(ticker) ? 'cripto' : 'acao');

export interface ImportResult {
  txs: Omit<Transaction, 'id'>[];
  newAssets: Asset[];
  errors: string[];
  format?: string;
  ignored?: string[];
}

const hasCols = (row: Record<string, unknown> | undefined, ...cols: string[]) => {
  if (!row) return false;
  const keys = new Set(Object.keys(row).map((k) => norm(k).replace(/[^a-z]/g, '')));
  return cols.every((c) => keys.has(c));
};

/** Ticker do mercado fracionário (ITUB4F) → ticker padrão (ITUB4). */
const cleanTicker = (t: string) => {
  const u = t.toUpperCase().trim();
  return /^[A-Z]{4}\d{1,2}F$/.test(u) ? u.slice(0, -1) : u;
};

/**
 * Extratos da Área do Investidor da B3 (investidor.b3.com.br):
 * - "Movimentação": Entrada/Saída, Data, Movimentação, Produto, Instituição, Quantidade, Preço unitário, Valor da Operação
 * - "Negociação": Data do Negócio, Tipo de Movimentação, Mercado, Prazo/Vencimento, Instituição, Código de Negociação, Quantidade, Preço, Valor
 */
function parseB3(rows: Record<string, unknown>[], assets: Asset[], kind: 'mov' | 'neg'): ImportResult {
  const byTicker = new Map(assets.map((a) => [a.ticker.toUpperCase(), a]));
  const byName = new Map(assets.map((a) => [norm(a.name), a]));
  const txs: Omit<Transaction, 'id'>[] = [];
  const newAssets: Asset[] = [];
  const errors: string[] = [];
  const ignored = new Map<string, number>();
  const resolve = (produto: string): Asset => {
    const raw = produto.trim();
    const code = cleanTicker(raw.split(' - ')[0].trim());
    let a = byName.get(norm(raw)) || byTicker.get(code);
    if (!a && /^tesouro/i.test(raw)) a = assets.find((x) => x.class === 'tesouro' && norm(raw).includes(norm(x.name)));
    if (!a) {
      const isTd = /^tesouro/i.test(raw);
      a = makeAsset({
        ticker: isTd ? raw.replace(/tesouro\s*/i, 'TD-').replace(/\s+/g, '').toUpperCase().slice(0, 20) : code,
        name: isTd ? raw : raw.split(' - ')[1]?.trim() || code,
        class: isTd ? 'tesouro' : guessClass(code),
        status: 'carteira',
        notes: 'Criado na importação do extrato da B3: revisar classe, setor e emissor.',
        ...(isTd ? { fixed: { indexer: /ipca/i.test(raw) ? 'IPCA+' : /selic/i.test(raw) ? 'Selic' : 'Prefixado', maturity: '', contractedRate: null, marketRate: null, marketRateDate: null, coupons: /juros/i.test(raw) } } : {}),
      } as any);
      byTicker.set(a.ticker, a);
      byName.set(norm(raw), a);
      newAssets.push(a);
    }
    return a;
  };
  rows.forEach((row, i) => {
    const line = i + 2;
    if (kind === 'neg') {
      const date = parseDate(pick(row, 'datadonegocio', 'data'));
      const tipo = norm(pick(row, 'tipodemovimentacao'));
      const code = String(pick(row, 'codigodenegociacao') ?? '');
      const qty = parseNum(pick(row, 'quantidade'));
      const price = parseNum(pick(row, 'preco'));
      const value = parseNum(pick(row, 'valor'));
      if (!date || !code || !qty) return errors.push(`Linha ${line}: dados incompletos.`);
      const type: TxType | null = tipo.startsWith('compra') ? 'compra' : tipo.startsWith('venda') ? 'venda' : null;
      if (!type) return ignored.set(tipo || '—', (ignored.get(tipo || '—') || 0) + 1);
      const a = resolve(code);
      txs.push({ date, type, assetId: a.id, ticker: a.ticker, qty, price, fees: 0, amount: Math.abs(value ?? qty * (price ?? 0)), notes: 'Extrato B3 (negociação)' });
      return;
    }
    const date = parseDate(pick(row, 'data'));
    const dir = norm(pick(row, 'entradasaida'));
    const mov = norm(pick(row, 'movimentacao'));
    const produto = String(pick(row, 'produto') ?? '');
    const qty = parseNum(pick(row, 'quantidade'));
    const price = parseNum(pick(row, 'precounitario'));
    const value = parseNum(pick(row, 'valordaoperacao'));
    if (!date || !produto) return errors.push(`Linha ${line}: data ou produto ausente.`);
    const credit = dir.startsWith('credito');
    let type: TxType | null = null;
    if (mov.includes('liquidacao') || mov === 'compra' || mov === 'venda') type = credit ? 'compra' : 'venda';
    else if (mov.startsWith('vencimento') || mov.startsWith('resgate')) type = 'venda';
    else if (credit && mov.includes('juros sobre capital')) type = 'jcp';
    else if (credit && mov.includes('dividendo')) type = 'dividendo';
    else if (credit && mov.includes('rendimento')) type = 'rendimento';
    else if (credit && mov.includes('amortizacao')) type = 'amortizacao';
    else if (credit && (mov === 'juros' || mov.startsWith('pagamento de juros') || mov.includes('cupom'))) type = 'juros';
    if (!type) return ignored.set(mov || '—', (ignored.get(mov || '—') || 0) + 1);
    const a = resolve(produto);
    if (type === 'compra' || type === 'venda') {
      if (!qty) return errors.push(`Linha ${line}: quantidade ausente.`);
      const amount = value ?? (price !== null ? qty * price : null);
      if (amount === null) return errors.push(`Linha ${line}: ${produto} sem preço/valor no extrato; lance esta operação manualmente.`);
      txs.push({ date, type, assetId: a.id, ticker: a.ticker, qty, price: price ?? amount / qty, fees: 0, amount: Math.abs(amount), notes: 'Extrato B3 (movimentação)' });
    } else {
      if (!value) return errors.push(`Linha ${line}: provento sem valor.`);
      txs.push({ date, type, assetId: a.id, ticker: a.ticker, qty, amount: Math.abs(value), notes: 'Extrato B3 (movimentação)' });
    }
  });
  return {
    txs: txs.sort((x, y) => x.date.localeCompare(y.date)),
    newAssets,
    errors,
    format: kind === 'mov' ? 'Extrato de Movimentação da B3' : 'Extrato de Negociação da B3',
    ignored: [...ignored.entries()].map(([k, n]) => `${k} (${n})`),
  };
}

export function parseTransactions(rows: Record<string, unknown>[], assets: Asset[]): ImportResult {
  if (hasCols(rows[0], 'entradasaida', 'movimentacao', 'produto')) return parseB3(rows, assets, 'mov');
  if (hasCols(rows[0], 'codigodenegociacao', 'tipodemovimentacao')) return parseB3(rows, assets, 'neg');
  const byTicker = new Map(assets.map((a) => [a.ticker.toUpperCase(), a]));
  const txs: Omit<Transaction, 'id'>[] = [];
  const newAssets: Asset[] = [];
  const errors: string[] = [];
  rows.forEach((row, i) => {
    const line = i + 2;
    const date = parseDate(pick(row, 'data', 'date', 'datadaoperacao', 'datapregao'));
    const typeRaw = norm(pick(row, 'tipo', 'type', 'operacao', 'movimentacao'));
    const type = TYPE_ALIASES[typeRaw];
    const ticker = String(pick(row, 'ticker', 'ativo', 'codigo', 'papel', 'produto') ?? '').toUpperCase().trim().split(/\s/)[0];
    const qty = parseNum(pick(row, 'quantidade', 'qtd', 'qty'));
    const price = parseNum(pick(row, 'preco', 'precounitario', 'price', 'cotacao'));
    const fees = parseNum(pick(row, 'taxas', 'custos', 'fees', 'corretagem')) ?? 0;
    let amount = parseNum(pick(row, 'valor', 'valortotal', 'total', 'amount', 'valordaoperacao'));
    if (!date) return errors.push(`Linha ${line}: data inválida.`);
    if (!type) return errors.push(`Linha ${line}: tipo "${typeRaw}" não reconhecido.`);
    if (amount === null && qty !== null && price !== null) amount = type === 'venda' ? qty * price - fees : qty * price + fees;
    if (amount === null) return errors.push(`Linha ${line}: valor ausente.`);
    let assetId: string | null = null;
    if (type !== 'aporte' && type !== 'retirada') {
      if (!ticker) return errors.push(`Linha ${line}: ticker ausente.`);
      let a = byTicker.get(ticker);
      if (!a) {
        a = makeAsset({ ticker, class: guessClass(ticker), status: 'carteira', notes: 'Criado na importação: revisar classe, setor e emissor.' });
        byTicker.set(ticker, a);
        newAssets.push(a);
      }
      assetId = a.id;
      if ((type === 'compra' || type === 'venda') && (!qty || qty <= 0)) return errors.push(`Linha ${line}: quantidade obrigatória para ${type}.`);
    }
    const reinv = norm(pick(row, 'reinvestimento', 'reinvest'));
    txs.push({ date, type, assetId, ticker: ticker || null, qty, price, fees, amount: Math.abs(amount), reinvest: reinv === 'sim' || reinv === 'true' || reinv === '1', notes: String(pick(row, 'observacao', 'obs', 'notes') ?? '') });
  });
  return { txs, newAssets, errors };
}

export function parseDistributions(rows: Record<string, unknown>[]): { ds: Distribution[]; errors: string[] } {
  const ds: Distribution[] = [];
  const errors: string[] = [];
  rows.forEach((row, i) => {
    const exDate = parseDate(pick(row, 'datacom', 'data', 'exdate', 'dataex'));
    const value = parseNum(pick(row, 'valorporunidade', 'valor', 'value', 'provento'));
    if (!exDate || value === null) return errors.push(`Linha ${i + 2}: data-com ou valor inválido.`);
    const t = norm(pick(row, 'tipo', 'type'));
    const type = (t.includes('jcp') || t.includes('juros') ? 'jcp' : t.includes('rend') ? 'rendimento' : t.includes('amort') ? 'amortizacao' : t ? 'dividendo' : 'dividendo') as Distribution['type'];
    const rec = norm(pick(row, 'recorrente', 'recurring'));
    const extra = norm(pick(row, 'extraordinario', 'extra'));
    ds.push({ id: uid(), exDate, payDate: parseDate(pick(row, 'pagamento', 'datapagamento', 'paydate')), value, type, recurring: rec ? !['nao', 'no', 'false', '0'].includes(rec) : !['sim', 'true', '1'].includes(extra), source: 'Importação manual' });
  });
  return { ds, errors };
}
