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
  const ws = wb.Sheets[wb.SheetNames.find((n) => /trans|hist|mov/i.test(n)) || wb.SheetNames[0]];
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
}

export function parseTransactions(rows: Record<string, unknown>[], assets: Asset[]): ImportResult {
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
