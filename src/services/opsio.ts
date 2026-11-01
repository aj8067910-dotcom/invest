// Entrada e saída de arquivos da Central de Operações (XLSX/CSV) e gravação em lotes.
import type { Asset, ImportBatch, OpCategory, Transaction } from '../domain/types';
import { OP_CATEGORY_LABEL } from '../domain/types';
import { SHEETS, exportRows, materialize, type BuildResult, type RawSheet } from '../domain/opsheet';
import { useStore } from '../store/store';
import { probableCause, type Conciliation } from '../domain/calc/proventos';
import { todayISO, uid } from '../domain/util';
import { download } from './io';

const xlsx = () => import('xlsx');

async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Converte uma matriz (linhas × colunas) em cabeçalhos + registros, achando a linha de cabeçalho. */
function matrixToSheet(name: string, m: unknown[][]): RawSheet {
  const filled = (r: unknown[]) => r.filter((c) => c !== null && c !== undefined && String(c).trim() !== '').length;
  let hi = m.findIndex((r) => filled(r || []) >= 2);
  if (hi < 0) hi = 0;
  const raw = (m[hi] || []).map((h) => String(h ?? '').trim());
  const headers: string[] = [];
  raw.forEach((h, i) => {
    let name = h || `Coluna ${i + 1}`;
    while (headers.includes(name)) name += ' ';
    headers.push(name);
  });
  const rows: Record<string, unknown>[] = [];
  for (let i = hi + 1; i < m.length; i++) {
    const r = m[i] || [];
    const o: Record<string, unknown> = {};
    headers.forEach((h, j) => (o[h] = r[j] ?? ''));
    rows.push(o);
  }
  // remove linhas vazias do fim, preservando a numeração das demais
  while (rows.length && Object.values(rows[rows.length - 1]).every((v) => String(v ?? '').trim() === '')) rows.pop();
  return { name, headers: headers.filter((h) => !/^Coluna \d+$/.test(h) || rows.some((r) => String(r[h] ?? '').trim())), rows };
}

export async function readWorkbook(file: File): Promise<{ sheets: RawSheet[]; hash: string }> {
  const XLSX = await xlsx();
  const buf = await file.arrayBuffer();
  const hash = await sha256(buf);
  if (/\.(csv|txt)$/i.test(file.name)) {
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf); // planilhas salvas no Excel em português
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const FS = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : first.includes('\t') ? '\t' : ',';
    const wb = XLSX.read(text, { type: 'string', raw: true, FS } as any);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const m = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
    return { sheets: [matrixToSheet(file.name.replace(/\.[^.]+$/, ''), m)], hash };
  }
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheets = wb.SheetNames.map((n) => matrixToSheet(n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: '' })));
  return { sheets, hash };
}

const INSTRUCTIONS: string[][] = [
  ['Modelo oficial — Central de Operações (Radar de Investimentos)'],
  [''],
  ['Como usar'],
  ['1. Preencha cada aba com as operações da categoria correspondente. Uma linha por operação. Não altere os nomes das colunas.'],
  ['2. Datas em dd/mm/aaaa. Números com vírgula ou ponto decimal (1.234,56 ou 1234.56). Quantidades sempre positivas: o sentido vem do Tipo de ordem.'],
  ['3. Campos obrigatórios estão marcados com * nesta página. Colunas extras são ignoradas; colunas faltantes podem ser mapeadas no assistente.'],
  ['4. Importe em Central de Operações → Importar. Nada é gravado antes da sua confirmação, e reimportar o mesmo arquivo não duplica operações.'],
  [''],
  ['Regras importantes'],
  ['• Aporte (aba 06) é dinheiro novo. Compra (abas 01–03) é o uso desse dinheiro. Não lance a mesma quantia como aporte e como compra de "dinheiro novo".'],
  ['• Proventos reaplicados: lance o provento (aba 05) e a compra (abas 01–03). Se quiser registrar a movimentação de caixa, use Tipo de movimentação = Reinvestimento na aba 06 — não conta como aporte externo.'],
  ['• Transferência de custódia entre corretoras (aba 08) não é compra nem venda: não altera quantidade nem preço médio.'],
  ['• Se o seu histórico começa depois da primeira compra de um ativo, lance uma linha "Saldo inicial" com a quantidade e o preço médio da época.'],
  ['• "Quantidade total" (opcional) é usada só para conferência: o sistema calcula a posição pelo histórico e avisa divergências.'],
  ['• "Identificador da operação" (opcional) evita duplicidade com segurança: use o número da nota ou um código seu.'],
  [''],
  ['Valores aceitos'],
  ['Tipo de investimento (abas 01–03): Ação, FII, ETF, Cripto'],
  ['Tipo de ordem: Compra, Venda, Saldo inicial'],
  ['Renda fixa — Tipo de movimentação: Aplicação, Resgate parcial, Resgate total, Vencimento, Juros'],
  ['Tipo de provento: Dividendos, JCP, Rendimentos, Amortização, Outros'],
  ['Aportes — Tipo de movimentação: Aporte, Retirada, Reinvestimento'],
  ['Tipo de evento: Bonificação, Desdobramento, Grupamento, Subscrição, Amortização, Outro (Desdobramento 1→2: fator 2; Grupamento 10→1: fator 10; Bonificação de 10%: fator 0,10 ou informe a quantidade recebida)'],
  ['Transferências — Tipo de movimentação: Transferência de custódia, Transferência de recursos, Ajuste de quantidade (use + para somar e − para retirar)'],
  [''],
  ['Campos por aba (* = obrigatório)'],
];

export async function downloadTemplate() {
  const XLSX = await xlsx();
  const wb = XLSX.utils.book_new();
  for (const cat of Object.keys(SHEETS) as OpCategory[]) {
    const ws = XLSX.utils.aoa_to_sheet([SHEETS[cat].fields.map((f) => f.header)]);
    ws['!cols'] = SHEETS[cat].fields.map((f) => ({ wch: Math.max(14, f.header.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, SHEETS[cat].tab);
  }
  const info = [...INSTRUCTIONS];
  for (const cat of Object.keys(SHEETS) as OpCategory[]) info.push([`${SHEETS[cat].tab}: ${SHEETS[cat].fields.map((f) => f.header + (f.required ? '*' : '')).join(' | ')}`]);
  const ws = XLSX.utils.aoa_to_sheet(info);
  ws['!cols'] = [{ wch: 160 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Instruções');
  XLSX.writeFile(wb, 'modelo-central-de-operacoes.xlsx');
}

export async function exportOperationsXlsx(txs: Transaction[], assets: Asset[]) {
  const XLSX = await xlsx();
  const rows = exportRows(txs, assets);
  const wb = XLSX.utils.book_new();
  for (const cat of Object.keys(SHEETS) as OpCategory[]) {
    const ws = rows[cat].length ? XLSX.utils.json_to_sheet(rows[cat], { header: SHEETS[cat].fields.map((f) => f.header) }) : XLSX.utils.aoa_to_sheet([SHEETS[cat].fields.map((f) => f.header)]);
    XLSX.utils.book_append_sheet(wb, ws, SHEETS[cat].tab);
  }
  XLSX.writeFile(wb, `operacoes-${todayISO()}.xlsx`);
}

export async function exportOperationsCsv(txs: Transaction[], assets: Asset[], cat: OpCategory) {
  const XLSX = await xlsx();
  const rows = exportRows(txs, assets)[cat];
  const ws = rows.length ? XLSX.utils.json_to_sheet(rows, { header: SHEETS[cat].fields.map((f) => f.header) }) : XLSX.utils.aoa_to_sheet([SHEETS[cat].fields.map((f) => f.header)]);
  download(`operacoes-${cat}-${todayISO()}.csv`, '﻿' + XLSX.utils.sheet_to_csv(ws, { FS: ';' }), 'text/csv;charset=utf-8');
}

export interface RunProgress {
  done: number;
  total: number;
}

/**
 * Grava a importação numa ÚNICA operação atômica (tudo ou nada): todas as operações válidas,
 * os ativos novos e as conciliações de proventos entram juntos, ou nada entra. O lote fica
 * registrado (hash do arquivo) e pode ser revertido por estorno em lote. Reenviar o mesmo
 * arquivo não duplica: a impressão digital de cada operação já gravada é reconhecida.
 */
export async function runImport(res: BuildResult, fileName: string, fileHash: string, onProgress: (p: RunProgress) => void): Promise<ImportBatch> {
  const st = useStore.getState();
  const importId = uid();
  const { txs, assets } = materialize(res);
  const conc: Conciliation[] = res.records
    .filter((r) => r.status === 'conciliacao' && (r as any).match)
    .map((r) => {
      const m = (r as any).match as { txId: string; diff: number; extractValue: number };
      const t = st.transactions.find((x) => x.id === m.txId)!;
      return { id: uid(), at: new Date().toISOString(), txId: m.txId, extractValue: m.extractValue, diff: m.diff, status: Math.abs(m.diff) <= 0.01 ? 'conferido' : 'pendente', cause: Math.abs(m.diff) <= 0.01 ? undefined : probableCause(m.diff, t), source: fileName } as Conciliation;
    });
  const batch: ImportBatch = {
    id: importId,
    at: new Date().toISOString(),
    fileName,
    fileHash,
    totalRows: res.stats.total,
    toImport: txs.length,
    imported: 0,
    skippedDuplicates: 0,
    excluded: res.records.filter((r) => !r.include && r.status !== 'erro' && r.status !== 'duplicada' && r.status !== 'conciliacao').length,
    pending: res.stats.errors,
    newAssets: assets.map((a) => a.ticker),
    byCategory: res.stats.byCategory,
    volume: res.stats.volume,
    status: 'em_andamento',
  };
  const snapshot = { transactions: st.transactions, assets: st.assets, conciliations: st.conciliations, imports: st.imports };
  try {
    st.beginImport(batch);
    useStore.getState().commitImportChunk(importId, txs, assets, res.stats.duplicates, conc);
    onProgress({ done: txs.length, total: txs.length });
    useStore.getState().finishImport(importId, { status: 'concluida', finishedAt: new Date().toISOString() });
  } catch (e) {
    // falha: desfaz tudo (nenhuma operação parcial fica gravada) e registra a tentativa
    useStore.setState({ ...snapshot, imports: [{ ...batch, status: 'interrompida' }, ...snapshot.imports] });
    throw e;
  }
  return useStore.getState().imports.find((b) => b.id === importId)!;
}

export const categoryLabel = (c: OpCategory) => OP_CATEGORY_LABEL[c];
