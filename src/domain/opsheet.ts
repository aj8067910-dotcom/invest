// Planilha da Central de Operações: definição das 8 abas, reconhecimento de cabeçalhos,
// conversão de linhas em operações e validação (sem dependência de interface ou de XLSX).
import type { Asset, AssetClass, OpCategory, Transaction, TxType, RfMovement } from './types';
import { OP_CATEGORY_LABEL, TX_LABEL } from './types';
import { parseDate, parseNum, uid } from './util';
import { activeTransactions, assignFingerprints, categoryOf, txOrder } from './ledger';
import { computePosition } from './calc/positions';
import { makeAsset } from './seed';

export interface SheetField {
  key: string;
  header: string; // nome exato da coluna no modelo oficial
  required: boolean;
  aliases?: string[];
  help?: string;
}

const TRADE_FIELDS: SheetField[] = [
  { key: 'ativo', header: 'Ativo', required: true, aliases: ['ticker', 'codigo', 'papel', 'codigo de negociacao', 'acao'], help: 'Ticker, ex.: ITUB4' },
  { key: 'tipoInvestimento', header: 'Tipo de investimento', required: true, aliases: ['tipo de ativo', 'classe', 'categoria'], help: 'Ação, FII, ETF ou Cripto' },
  { key: 'tipoOrdem', header: 'Tipo de ordem', required: true, aliases: ['ordem', 'operacao', 'tipo de operacao', 'compra/venda', 'c/v', 'tipo de movimentacao', 'tipo'], help: 'Compra, Venda ou Saldo inicial' },
  { key: 'quantidade', header: 'Quantidade', required: true, aliases: ['qtd', 'qtde', 'quantidade negociada'] },
  { key: 'precoUnitario', header: 'Preço unitário', required: true, aliases: ['preco', 'preco medio', 'cotacao', 'valor unitario', 'preco por unidade'] },
  { key: 'total', header: 'Total', required: true, aliases: ['valor total', 'valor', 'valor da operacao', 'valor financeiro', 'montante'] },
  { key: 'quantidadeTotal', header: 'Quantidade total', required: false, aliases: ['posicao', 'quantidade acumulada', 'saldo', 'posicao acumulada', 'qtd total'] },
  { key: 'data', header: 'Data do lançamento', required: true, aliases: ['data', 'data da operacao', 'data do negocio', 'data de negociacao', 'data do pregao', 'data de lancamento'] },
  { key: 'corretora', header: 'Corretora', required: false, aliases: ['instituicao', 'banco', 'instituicao financeira'] },
  { key: 'taxas', header: 'Taxas e emolumentos', required: false, aliases: ['taxas', 'custos', 'emolumentos', 'corretagem', 'tarifas'] },
  { key: 'valorLiquido', header: 'Valor líquido da operação', required: false, aliases: ['valor liquido', 'liquido'] },
  { key: 'observacoes', header: 'Observações', required: false, aliases: ['observacao', 'obs', 'notas', 'comentario'] },
  { key: 'idOperacao', header: 'Identificador da operação', required: false, aliases: ['id', 'identificador', 'id da operacao', 'codigo da operacao', 'numero da nota', 'nota'] },
  { key: 'corretagem', header: 'Corretagem', required: false, aliases: ['taxa de corretagem'] },
  { key: 'emolumentos', header: 'Emolumentos', required: false, aliases: ['emolumento'] },
  { key: 'taxaLiquidacao', header: 'Taxa de liquidação', required: false, aliases: ['liquidacao', 'taxa liquidacao'] },
  { key: 'fonte', header: 'Fonte', required: false, aliases: ['origem do dado', 'origem'], help: 'B3, nota de corretagem ou manual' },
];

export const SHEETS: Record<OpCategory, { tab: string; fields: SheetField[]; hint: string }> = {
  acoes: { tab: '01 - Ações', fields: TRADE_FIELDS, hint: 'Compras, vendas e saldos iniciais de ações (e cripto, com Tipo de investimento = Cripto).' },
  fiis: { tab: '02 - FIIs', fields: TRADE_FIELDS, hint: 'Compras, vendas e saldos iniciais de fundos imobiliários.' },
  etfs: { tab: '03 - ETFs', fields: TRADE_FIELDS, hint: 'Compras, vendas e saldos iniciais de ETFs.' },
  renda_fixa: {
    tab: '04 - Renda Fixa',
    hint: 'Aplicações e resgates de Tesouro Direto, CDB, LCI, LCA etc. Tipo de movimentação: Aplicação, Resgate parcial, Resgate total, Vencimento ou Juros.',
    fields: [
      { key: 'ativo', header: 'Ativo ou título', required: true, aliases: ['ativo', 'titulo', 'produto', 'nome do titulo'] },
      { key: 'tipoInvestimento', header: 'Tipo de investimento', required: true, aliases: ['tipo', 'classe'], help: 'Tesouro Direto, CDB, LCI, LCA, Debênture…' },
      { key: 'tipoMovimentacao', header: 'Tipo de movimentação', required: true, aliases: ['movimentacao', 'operacao'] },
      { key: 'instituicao', header: 'Instituição financeira', required: false, aliases: ['instituicao', 'corretora', 'banco'] },
      { key: 'valorAplicado', header: 'Valor aplicado', required: false, aliases: ['aplicado', 'valor da aplicacao', 'valor investido'] },
      { key: 'taxa', header: 'Taxa contratada', required: false, aliases: ['taxa', 'rentabilidade contratada'] },
      { key: 'indexador', header: 'Indexador', required: false, aliases: ['index'] },
      { key: 'dataAplicacao', header: 'Data da aplicação', required: false, aliases: ['data de aplicacao', 'data', 'data da compra'] },
      { key: 'vencimento', header: 'Data de vencimento', required: false, aliases: ['vencimento'] },
      { key: 'dataResgate', header: 'Data do resgate', required: false, aliases: ['data de resgate'] },
      { key: 'valorResgatado', header: 'Valor resgatado', required: false, aliases: ['resgatado', 'valor do resgate', 'valor bruto resgatado'] },
      { key: 'observacoes', header: 'Observações', required: false, aliases: ['observacao', 'obs'] },
      { key: 'quantidade', header: 'Quantidade de títulos', required: false, aliases: ['quantidade', 'qtd'] },
      { key: 'idOperacao', header: 'Identificador da operação', required: false, aliases: ['id', 'identificador'] },
    ],
  },
  proventos: {
    tab: '05 - Proventos',
    hint: 'Tipo de provento: Dividendos, JCP, Rendimentos, Amortização ou Outros. Valor total recebido = valor líquido creditado.',
    fields: [
      { key: 'ativo', header: 'Ativo', required: true, aliases: ['ticker', 'produto', 'papel'] },
      { key: 'tipoInvestimento', header: 'Tipo de investimento', required: false, aliases: ['classe'] },
      { key: 'tipoProvento', header: 'Tipo de provento', required: true, aliases: ['tipo', 'evento', 'provento'] },
      { key: 'dataCom', header: 'Data-com', required: false, aliases: ['data com', 'data base', 'data ex'] },
      { key: 'dataPagamento', header: 'Data de pagamento', required: true, aliases: ['pagamento', 'data', 'data do pagamento', 'data de credito'] },
      { key: 'quantidade', header: 'Quantidade de ativos considerada', required: false, aliases: ['quantidade', 'qtd', 'quantidade de ativos'] },
      { key: 'valorUnitario', header: 'Valor por ação ou cota', required: false, aliases: ['valor por cota', 'valor por acao', 'valor unitario', 'preco unitario'] },
      { key: 'valorTotal', header: 'Valor total recebido', required: true, aliases: ['valor recebido', 'valor total', 'valor liquido', 'valor', 'total'] },
      { key: 'corretora', header: 'Corretora', required: false, aliases: ['instituicao'] },
      { key: 'observacoes', header: 'Observações', required: false, aliases: ['observacao', 'obs'] },
      { key: 'idOperacao', header: 'Identificador da operação', required: false, aliases: ['id', 'identificador'] },
    ],
  },
  aportes: {
    tab: '06 - Aportes',
    hint: 'Somente dinheiro. Tipo de movimentação: Aporte (dinheiro novo), Retirada ou Reinvestimento (proventos reaplicados — não conta como aporte externo).',
    fields: [
      { key: 'data', header: 'Data do aporte', required: true, aliases: ['data'] },
      { key: 'valor', header: 'Valor', required: true, aliases: ['valor do aporte', 'montante'] },
      { key: 'origem', header: 'Origem do recurso', required: false, aliases: ['origem', 'fonte'] },
      { key: 'instituicaoOrigem', header: 'Instituição de origem', required: false, aliases: ['banco de origem', 'instituicao'] },
      { key: 'destino', header: 'Destino', required: false, aliases: ['corretora', 'conta destino'] },
      { key: 'tipoMovimentacao', header: 'Tipo de movimentação', required: false, aliases: ['tipo', 'movimentacao'] },
      { key: 'observacoes', header: 'Observações', required: false, aliases: ['observacao', 'obs'] },
      { key: 'idOperacao', header: 'Identificador da operação', required: false, aliases: ['id', 'identificador'] },
    ],
  },
  eventos: {
    tab: '07 - Eventos Corporativos',
    hint: 'Bonificação, Desdobramento, Grupamento, Subscrição, Direitos de subscrição, Troca de ticker, Incorporação, Cisão, Leilão de frações, Amortização ou Outro. Desdobramento 1→2: fator 2. Grupamento 10→1: fator 10.',
    fields: [
      { key: 'ativo', header: 'Ativo', required: true, aliases: ['ticker', 'papel'] },
      { key: 'tipoEvento', header: 'Tipo de evento', required: true, aliases: ['evento', 'tipo'] },
      { key: 'data', header: 'Data do evento', required: true, aliases: ['data', 'data ex', 'data com'] },
      { key: 'qtdAnterior', header: 'Quantidade anterior', required: false, aliases: ['qtd anterior', 'quantidade antes'] },
      { key: 'qtdDelta', header: 'Quantidade adicionada ou retirada', required: false, aliases: ['quantidade adicionada', 'quantidade', 'qtd', 'variacao'] },
      { key: 'fator', header: 'Fator de conversão', required: false, aliases: ['fator', 'proporcao'] },
      { key: 'observacoes', header: 'Observações', required: false, aliases: ['observacao', 'obs'] },
      { key: 'custoUnitario', header: 'Custo unitário atribuído', required: false, aliases: ['custo unitario', 'preco de subscricao', 'valor unitario', 'preco'], help: 'Bonificação: custo divulgado pela empresa. Subscrição: preço de emissão.' },
      { key: 'ativoDestino', header: 'Ativo de destino', required: false, aliases: ['novo ticker', 'destino', 'ticker novo'], help: 'Troca de ticker, incorporação e cisão (ex.: TRPL4 → ISAE4)' },
      { key: 'percentualCusto', header: 'Percentual do custo transferido', required: false, aliases: ['percentual do custo', '% do custo'], help: 'Cisão: parcela do custo que vai para o novo ativo' },
      { key: 'valorRecebido', header: 'Valor recebido', required: false, aliases: ['valor do leilao', 'valor'], help: 'Leilão de frações: valor creditado' },
      { key: 'idOperacao', header: 'Identificador da operação', required: false, aliases: ['id', 'identificador'] },
    ],
  },
  transferencias: {
    tab: '08 - Transferências',
    hint: 'Transferência de custódia (não é compra nem venda), Transferência de recursos ou Ajuste de quantidade (+/−, vai para revisão).',
    fields: [
      { key: 'ativo', header: 'Ativo ou recurso', required: true, aliases: ['ativo', 'recurso', 'ticker'] },
      { key: 'instituicaoOrigem', header: 'Instituição de origem', required: false, aliases: ['origem'] },
      { key: 'instituicaoDestino', header: 'Instituição de destino', required: false, aliases: ['destino'] },
      { key: 'tipoMovimentacao', header: 'Tipo de movimentação', required: true, aliases: ['tipo', 'movimentacao'] },
      { key: 'quantidade', header: 'Quantidade ou valor transferido', required: true, aliases: ['quantidade', 'valor', 'qtd'] },
      { key: 'data', header: 'Data', required: true, aliases: ['data da transferencia'] },
      { key: 'observacoes', header: 'Observações', required: false, aliases: ['observacao', 'obs'] },
      { key: 'idOperacao', header: 'Identificador da operação', required: false, aliases: ['id', 'identificador'] },
    ],
  },
};

export const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// ─────────────────────────── reconhecimento ───────────────────────────

export type SheetKind = OpCategory | 'b3' | 'ignorar';
export type Mapping = Record<string, string | null>; // campo → coluna do arquivo

export interface RawSheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

const NAME_HINTS: [RegExp, OpCategory][] = [
  [/fii|imobiliar/, 'fiis'],
  [/etf/, 'etfs'],
  [/renda fixa|tesouro|cdb|lci|lca/, 'renda_fixa'],
  [/provento|dividend|rendiment/, 'proventos'],
  [/aporte|deposit/, 'aportes'],
  [/evento/, 'eventos'],
  [/transfer|ajuste/, 'transferencias'],
  [/acoes|acao|acoes/, 'acoes'],
];

export function autoMap(cat: OpCategory, headers: string[]): Mapping {
  const nh = headers.map((h) => [h, norm(h)] as const);
  const used = new Set<string>();
  const map: Mapping = {};
  for (const f of SHEETS[cat].fields) {
    const cands = [norm(f.header), ...(f.aliases || []).map(norm)];
    let hit: string | null = null;
    for (const c of cands) {
      const m = nh.find(([h, n]) => n === c && !used.has(h));
      if (m) {
        hit = m[0];
        break;
      }
    }
    if (hit) used.add(hit);
    map[f.key] = hit;
  }
  return map;
}

const score = (cat: OpCategory, headers: string[]) => {
  const m = autoMap(cat, headers);
  const fields = SHEETS[cat].fields;
  const exact = fields.filter((f) => headers.some((h) => norm(h) === norm(f.header))).length;
  const req = fields.filter((f) => f.required);
  return exact * 2 + Object.values(m).filter(Boolean).length + (req.every((f) => m[f.key]) ? 5 : 0);
};

export function detectKind(sheet: RawSheet): SheetKind {
  const hs = sheet.headers.map(norm);
  if (hs.includes('entrada saida') && hs.includes('movimentacao') && hs.includes('produto')) return 'b3';
  if (hs.includes('codigo de negociacao') && hs.includes('tipo de movimentacao')) return 'b3';
  if (!sheet.rows.length || /instruc|leia|readme|lista/.test(norm(sheet.name))) return 'ignorar';
  const n = norm(sheet.name);
  for (const [re, cat] of NAME_HINTS) if (re.test(n) && score(cat, sheet.headers) >= 4) return cat;
  let best: OpCategory = 'acoes';
  let bestScore = -1;
  for (const cat of Object.keys(SHEETS) as OpCategory[]) {
    const s = score(cat, sheet.headers);
    if (s > bestScore) {
      best = cat;
      bestScore = s;
    }
  }
  return bestScore >= 4 ? best : 'ignorar';
}

// ─────────────────────────── conversão ───────────────────────────

export interface Issue {
  level: 'erro' | 'aviso';
  msg: string;
}

export interface ImportRecord {
  key: string; // aba:linha
  sheet: string;
  row: number;
  kind: SheetKind;
  category: OpCategory | null;
  values: Record<string, unknown>; // valores lidos (editáveis na conferência)
  tx: Transaction | null;
  issues: Issue[];
  status: 'ok' | 'aviso' | 'erro' | 'duplicada' | 'conciliacao';
  include: boolean;
  newTicker?: string | null;
}

export interface NewAssetPlan {
  ticker: string;
  name: string;
  cls: AssetClass;
  rf?: { indexer?: string | null; maturity?: string | null; rate?: number | null };
}

interface Ctx {
  byTicker: Map<string, Asset>;
  byName: Map<string, Asset>;
  planned: Map<string, NewAssetPlan>;
  classOverride: Record<string, AssetClass>;
}

const cleanTicker = (v: unknown) => {
  const t = String(v ?? '').toUpperCase().trim().split(/\s+-\s+|\s+/)[0];
  return /^[A-Z]{4}\d{1,2}F$/.test(t) ? t.slice(0, -1) : t;
};

const classFrom = (v: unknown, fallback: AssetClass): AssetClass => {
  const s = norm(v);
  if (!s) return fallback;
  if (/fii|imobili|fundo imob/.test(s)) return 'fii';
  if (/etf|indice/.test(s)) return 'etf';
  if (/cripto|crypto|bitcoin/.test(s)) return 'cripto';
  if (/tesouro|renda fixa|cdb|lci|lca|debenture|cri|cra/.test(s)) return 'tesouro';
  if (/acao|acoes|stock|bdr|unit/.test(s)) return 'acao';
  return fallback;
};

const CAT_CLASS: Partial<Record<OpCategory, AssetClass>> = { acoes: 'acao', fiis: 'fii', etfs: 'etf', renda_fixa: 'tesouro' };

const guessClass = (t: string): AssetClass => (/^(BTC|ETH|USDC|USDT|SOL)$/.test(t) ? 'cripto' : /11$/.test(t) ? 'fii' : 'acao');

function resolveAsset(ctx: Ctx, raw: unknown, cls: AssetClass | null, issues: Issue[], isRf = false): { assetId: string | null; ticker: string; newTicker: string | null } {
  const text = String(raw ?? '').trim();
  if (!text) return { assetId: null, ticker: '', newTicker: null };
  if (isRf) {
    const a = ctx.byName.get(norm(text)) || ctx.byTicker.get(text.toUpperCase());
    if (a) return { assetId: a.id, ticker: a.ticker, newTicker: null };
    const tk = text.toUpperCase().replace(/TESOURO\s*/, 'TD-').replace(/[^A-Z0-9+.-]+/g, '').slice(0, 24);
    if (!ctx.planned.has(tk)) ctx.planned.set(tk, { ticker: tk, name: text, cls: 'tesouro' });
    issues.push({ level: 'aviso', msg: `Título "${text}" não cadastrado: será criado como ${tk}.` });
    return { assetId: null, ticker: tk, newTicker: tk };
  }
  const tk = cleanTicker(text);
  const a = ctx.byTicker.get(tk) || ctx.byName.get(norm(text));
  if (a) return { assetId: a.id, ticker: a.ticker, newTicker: null };
  if (!/^[A-Z0-9.-]{3,12}$/.test(tk)) {
    issues.push({ level: 'erro', msg: `Ativo "${text}" não reconhecido como ticker.` });
    return { assetId: null, ticker: tk, newTicker: null };
  }
  const c = ctx.classOverride[tk] || cls || guessClass(tk);
  if (!ctx.planned.has(tk)) ctx.planned.set(tk, { ticker: tk, name: tk, cls: c });
  issues.push({ level: 'aviso', msg: `Ticker ${tk} não cadastrado: será criado (${c === 'acao' ? 'Ação' : c === 'fii' ? 'FII' : c === 'etf' ? 'ETF' : c === 'cripto' ? 'Cripto' : 'Renda fixa'}).` });
  return { assetId: null, ticker: tk, newTicker: tk };
}

const num = (v: unknown) => parseNum(v);
const sourceOf = (v: unknown): Transaction['source'] => {
  const s = norm(v);
  return /b3|bolsa|investidor/.test(s) ? 'B3' : /nota|corretag/.test(s) ? 'nota' : s ? 'manual' : 'importacao';
};
const close = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= Math.max(tol, Math.abs(b) * 0.005);
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

function baseTx(cat: OpCategory, v: Record<string, unknown>): Pick<Transaction, 'id' | 'category' | 'notes' | 'extId'> {
  return { id: uid(), category: cat, notes: str(v.observacoes), extId: str(v.idOperacao) || null };
}

export function convertRow(cat: OpCategory, v: Record<string, unknown>, ctx: Ctx): { tx: Transaction | null; issues: Issue[]; newTicker: string | null } {
  const issues: Issue[] = [];
  const err = (msg: string) => issues.push({ level: 'erro', msg });
  const warn = (msg: string) => issues.push({ level: 'aviso', msg });
  let newTicker: string | null = null;

  if (cat === 'acoes' || cat === 'fiis' || cat === 'etfs') {
    const date = parseDate(v.data);
    if (!date) err(`Data do lançamento inválida ou ausente ("${str(v.data)}").`);
    const ord = norm(v.tipoOrdem);
    const type: TxType | null = /^(c|compra|buy|compras|aquisicao)/.test(ord) ? 'compra' : /^(v|venda|sell|vendas)/.test(ord) ? 'venda' : /saldo|abertura|inicial|posicao/.test(ord) ? 'saldo_inicial' : /subscri/.test(ord) ? 'subscricao' : null;
    if (!type) err(`Tipo de ordem "${str(v.tipoOrdem)}" não reconhecido (use Compra, Venda ou Saldo inicial).`);
    const cls = classFrom(v.tipoInvestimento, CAT_CLASS[cat]!);
    if (!str(v.tipoInvestimento)) warn(`Tipo de investimento vazio: assumido ${OP_CATEGORY_LABEL[cat]}.`);
    const asset = resolveAsset(ctx, v.ativo, cls, issues);
    newTicker = asset.newTicker;
    if (!str(v.ativo)) err('Ativo ausente.');
    const qty = num(v.quantidade);
    let price = num(v.precoUnitario);
    let gross = num(v.total);
    const corretagem = num(v.corretagem);
    const emolumentos = num(v.emolumentos);
    const taxaLiq = num(v.taxaLiquidacao);
    const parts = [corretagem, emolumentos, taxaLiq].filter((x): x is number => x !== null);
    const feesInformed = num(v.taxas);
    const fees = feesInformed ?? (parts.length ? parts.reduce((x, y) => x + y, 0) : 0);
    if (feesInformed !== null && parts.length && !close(feesInformed, parts.reduce((x, y) => x + y, 0), 0.01)) warn('Taxas e emolumentos diverge da soma de corretagem + emolumentos + taxa de liquidação.');
    const net = num(v.valorLiquido);
    if (qty === null) err('Quantidade ausente.');
    else if (qty <= 0) err(`Quantidade ${qty} inválida (deve ser positiva; o sentido vem do Tipo de ordem).`);
    if (fees < 0) err('Taxas negativas.');
    if (price === null && gross !== null && qty) {
      price = gross / qty;
      warn('Preço unitário ausente: calculado como Total ÷ Quantidade.');
    }
    if (gross === null && price !== null && qty) {
      gross = qty * price;
      warn('Total ausente: calculado como Quantidade × Preço unitário.');
    }
    if (price === null && gross === null) err('Preço unitário e Total ausentes.');
    if (price !== null && price <= 0) err('Preço unitário deve ser positivo.');
    if (qty && price !== null && gross !== null && !close(qty * price, gross) && !close(qty * price + fees, gross) && !close(qty * price - fees, gross))
      warn(`Total (${gross.toFixed(2)}) diverge de Quantidade × Preço (${(qty * price).toFixed(2)}).`);
    const computedNet = gross !== null ? (type === 'venda' ? gross - fees : gross + fees) : null;
    if (net !== null && computedNet !== null && !close(net, computedNet, 0.05)) warn(`Valor líquido (${net.toFixed(2)}) diverge de Total ${type === 'venda' ? '−' : '+'} taxas (${computedNet.toFixed(2)}).`);
    const declared = num(v.quantidadeTotal);
    if (issues.some((i) => i.level === 'erro') || !date || !type || !qty || gross === null) return { tx: null, issues, newTicker };
    return {
      tx: { ...baseTx(cat, v), date, type, assetId: asset.assetId, ticker: asset.ticker, qty, price, fees, corretagem, emolumentos, taxaLiquidacao: taxaLiq, gross, amount: net ?? computedNet!, broker: str(v.corretora) || null, declaredPosition: declared, source: sourceOf(v.fonte) },
      issues,
      newTicker,
    };
  }

  if (cat === 'renda_fixa') {
    const mv = norm(v.tipoMovimentacao);
    const movement: RfMovement | 'juros' | null = /aplica|compra|investimento/.test(mv) ? 'aplicacao' : /parcial/.test(mv) ? 'resgate_parcial' : /venc/.test(mv) ? 'vencimento' : /resgate|venda/.test(mv) ? 'resgate_total' : /juro|cupom/.test(mv) ? 'juros' : null;
    if (!movement) err(`Tipo de movimentação "${str(v.tipoMovimentacao)}" não reconhecido (Aplicação, Resgate parcial, Resgate total, Vencimento ou Juros).`);
    const asset = resolveAsset(ctx, v.ativo, 'tesouro', issues, true);
    newTicker = asset.newTicker;
    if (newTicker) {
      const p = ctx.planned.get(newTicker)!;
      p.rf = { indexer: str(v.indexador) || null, maturity: parseDate(v.vencimento), rate: num(v.taxa) };
    }
    if (!str(v.ativo)) err('Ativo ou título ausente.');
    const isApp = movement === 'aplicacao';
    const date = isApp ? parseDate(v.dataAplicacao) : parseDate(v.dataResgate) || (movement === 'vencimento' ? parseDate(v.vencimento) : null);
    if (!date) err(isApp ? 'Data da aplicação inválida ou ausente.' : 'Data do resgate inválida ou ausente.');
    const value = isApp ? num(v.valorAplicado) : num(v.valorResgatado) ?? (movement === 'juros' ? num(v.valorAplicado) : null);
    if (value === null || value <= 0) err(isApp ? 'Valor aplicado ausente ou inválido.' : 'Valor resgatado ausente ou inválido.');
    const qty = num(v.quantidade);
    if (qty !== null && qty <= 0) err('Quantidade de títulos deve ser positiva.');
    if (isApp && !qty) warn('Sem quantidade de títulos: a posição será acompanhada pelo valor aplicado (a custo).');
    if (issues.some((i) => i.level === 'erro') || !date || !movement || !value) return { tx: null, issues, newTicker };
    const common = { ...baseTx(cat, v), date, assetId: asset.assetId, ticker: asset.ticker, broker: str(v.instituicao) || null, rate: num(v.taxa), indexer: str(v.indexador) || null, maturity: parseDate(v.vencimento) };
    if (movement === 'juros') return { tx: { ...common, type: 'juros', amount: value }, issues, newTicker };
    return {
      tx: { ...common, type: isApp ? 'compra' : 'venda', rfMovement: movement, qty: qty ?? null, price: qty ? value / qty : null, gross: value, fees: 0, amount: value },
      issues,
      newTicker,
    };
  }

  if (cat === 'proventos') {
    const t = norm(v.tipoProvento);
    const type: TxType = /jcp|juros sobre|capital proprio/.test(t) ? 'jcp' : /dividend/.test(t) ? 'dividendo' : /rendiment/.test(t) ? 'rendimento' : /amortiz/.test(t) ? 'amortizacao' : 'outro_provento';
    if (type === 'outro_provento' && !/outro/.test(t)) warn(`Tipo de provento "${str(v.tipoProvento)}" não reconhecido: classificado como Outros pagamentos.`);
    const asset = resolveAsset(ctx, v.ativo, classFrom(v.tipoInvestimento, 'acao'), issues);
    newTicker = asset.newTicker;
    if (!str(v.ativo)) err('Ativo ausente.');
    const exDate = parseDate(v.dataCom);
    let date = parseDate(v.dataPagamento);
    if (!date && exDate) {
      date = exDate;
      warn('Data de pagamento ausente: usada a data-com.');
    }
    if (!date) err('Data de pagamento inválida ou ausente.');
    const qty = num(v.quantidade);
    const unit = num(v.valorUnitario);
    let total = num(v.valorTotal);
    if (total === null && qty && unit) {
      total = qty * unit;
      warn('Valor total ausente: calculado como Quantidade × Valor por cota.');
    }
    if (total === null || total <= 0) err('Valor total recebido ausente ou inválido.');
    if (qty !== null && qty <= 0) err('Quantidade de ativos deve ser positiva.');
    if (total && qty && unit) {
      const g = qty * unit;
      if (!close(g, total) && !(type === 'jcp' && close(g * 0.85, total, 0.05))) warn(`Valor total (${total.toFixed(2)}) diverge de Quantidade × Valor por cota (${g.toFixed(2)}).`);
    }
    if (issues.some((i) => i.level === 'erro') || !date || !total) return { tx: null, issues, newTicker };
    return { tx: { ...baseTx(cat, v), date, type, assetId: asset.assetId, ticker: asset.ticker, qty, perUnit: unit, exDate, payDate: date, amount: total, broker: str(v.corretora) || null }, issues, newTicker };
  }

  if (cat === 'aportes') {
    const date = parseDate(v.data);
    if (!date) err('Data do aporte inválida ou ausente.');
    let value = num(v.valor);
    const t = norm(v.tipoMovimentacao);
    const origin = norm(v.origem);
    let type: TxType = /retir|saque|resgate/.test(t) ? 'retirada' : /reinvest/.test(t) ? 'reinvestimento' : 'aporte';
    if (value !== null && value < 0 && type === 'aporte') {
      type = 'retirada';
      value = -value;
      warn('Valor negativo tratado como retirada.');
    }
    if (type === 'aporte' && /provento|dividend|rendiment|jcp|reinvest/.test(origin)) {
      type = 'reinvestimento';
      warn('Origem do recurso são proventos: tratado como reinvestimento (não conta como dinheiro novo).');
    }
    if (t && !/aporte|deposit|transfer|retir|saque|resgate|reinvest/.test(t)) warn(`Tipo de movimentação "${str(v.tipoMovimentacao)}" não reconhecido: tratado como aporte.`);
    if (value === null || value <= 0) err('Valor ausente ou inválido.');
    if (issues.some((i) => i.level === 'erro') || !date || !value) return { tx: null, issues, newTicker };
    return { tx: { ...baseTx(cat, v), date, type, amount: value, origin: str(v.origem) || null, fromInstitution: str(v.instituicaoOrigem) || null, destination: str(v.destino) || null, broker: str(v.destino) || null }, issues, newTicker };
  }

  if (cat === 'eventos') {
    const t = norm(v.tipoEvento);
    const type: TxType = /bonific/.test(t) ? 'bonificacao' : /desdobr|split/.test(t) ? 'desdobramento' : /grupam|inplit|agrupa/.test(t) ? 'grupamento' : /direito/.test(t) ? 'direito_subscricao' : /subscri/.test(t) ? 'subscricao' : /troca|mudanca de (ticker|codigo)|alteracao de codigo/.test(t) ? 'troca_ticker' : /incorpora/.test(t) ? 'incorporacao' : /cisao/.test(t) ? 'cisao' : /leilao|fracao/.test(t) ? 'leilao_fracao' : /amortiz/.test(t) ? 'amortizacao' : 'evento_outro';
    const date = parseDate(v.data);
    if (!date) err('Data do evento inválida ou ausente.');
    const asset = resolveAsset(ctx, v.ativo, null, issues);
    newTicker = asset.newTicker;
    if (!str(v.ativo)) err('Ativo ausente.');
    const before = num(v.qtdAnterior);
    const delta = num(v.qtdDelta);
    const factor = num(v.fator);
    const unit = num(v.custoUnitario);
    if ((type === 'desdobramento' || type === 'grupamento') && !factor && !delta) err('Informe o Fator de conversão ou a Quantidade adicionada/retirada.');
    if (type === 'bonificacao' && !factor && !delta) err('Bonificação sem quantidade nem fator.');
    if (type === 'subscricao' && (!delta || delta <= 0)) err('Subscrição sem quantidade subscrita.');
    if (type === 'subscricao' && !unit) warn('Subscrição sem preço: entrará com custo zero (revise).');
    if (type === 'bonificacao' && !unit) warn('Bonificação sem custo unitário atribuído: custo zero (revise).');
    if (type === 'amortizacao' && !(unit && before)) err('Amortização em eventos precisa de Custo unitário e Quantidade anterior (ou lance na aba Proventos com o valor recebido).');
    if (type === 'evento_outro') warn(`Evento "${str(v.tipoEvento)}" tratado como ajuste de quantidade e enviado para revisão.`);
    let target: { assetId: string | null; ticker: string; newTicker: string | null } | null = null;
    if (type === 'troca_ticker' || type === 'incorporacao' || type === 'cisao') {
      if (!str(v.ativoDestino)) err('Informe o Ativo de destino (ex.: ISAE4).');
      else target = resolveAsset(ctx, v.ativoDestino, null, issues);
      if (type === 'cisao' && !num(v.percentualCusto)) err('Cisão: informe o percentual do custo transferido.');
    }
    if (type === 'leilao_fracao' && (!delta || !num(v.valorRecebido))) err('Leilão de frações: informe a quantidade vendida e o valor recebido.');
    if (factor !== null && factor <= 0) err('Fator de conversão deve ser positivo.');
    if (issues.some((i) => i.level === 'erro') || !date) return { tx: null, issues, newTicker };
    const amount = type === 'amortizacao' ? unit! * before! : type === 'leilao_fracao' ? (num(v.valorRecebido) as number) : delta && unit ? Math.abs(delta) * unit : 0;
    const extra: Partial<Transaction> = target ? { targetAssetId: target.assetId, costShare: num(v.percentualCusto), ...({ _targetTicker: target.ticker } as any) } : {};
    return { tx: { ...baseTx(cat, v), date, type, assetId: asset.assetId, ticker: asset.ticker, qty: type === 'leilao_fracao' ? Math.abs(delta!) : delta, qtyBefore: before, factor, price: unit, amount, ...extra }, issues, newTicker };
  }

  // transferências e ajustes
  const t = norm(v.tipoMovimentacao);
  const date = parseDate(v.data);
  if (!date) err('Data inválida ou ausente.');
  const q = num(v.quantidade);
  if (q === null || q === 0) err('Quantidade ou valor transferido ausente.');
  const isCash = /recurso|dinheiro|financeir|saldo|ted|pix/.test(t) || /^(r\$|reais|dinheiro|saldo)/.test(norm(v.ativo));
  const isAdj = /ajuste|correc/.test(t);
  if (!t) warn('Tipo de movimentação vazio: tratado como transferência de custódia.');
  if (isCash) {
    if (issues.some((i) => i.level === 'erro') || !date || !q) return { tx: null, issues, newTicker };
    return { tx: { ...baseTx('transferencias', v), date, type: 'transferencia', amount: Math.abs(q), fromInstitution: str(v.instituicaoOrigem) || null, toInstitution: str(v.instituicaoDestino) || null }, issues, newTicker };
  }
  const asset = resolveAsset(ctx, v.ativo, null, issues);
  newTicker = asset.newTicker;
  if (!isAdj && q !== null && q < 0) err('Quantidade transferida deve ser positiva.');
  if (isAdj) warn('Ajuste de quantidade: será processado e marcado para revisão manual.');
  if (issues.some((i) => i.level === 'erro') || !date || !q) return { tx: null, issues, newTicker };
  return {
    tx: { ...baseTx('transferencias', v), date, type: isAdj ? 'ajuste' : 'transferencia', assetId: asset.assetId, ticker: asset.ticker, qty: q, amount: 0, fromInstitution: str(v.instituicaoOrigem) || null, toInstitution: str(v.instituicaoDestino) || null, broker: str(v.instituicaoDestino) || null },
    issues,
    newTicker,
  };
}

// ─────────────────────────── processamento completo ───────────────────────────

export interface SheetPlan {
  name: string;
  kind: SheetKind;
  mapping: Mapping;
}

export interface BuildInput {
  sheets: RawSheet[];
  plans: SheetPlan[];
  assets: Asset[];
  existing: Transaction[];
  edits: Record<string, Record<string, unknown>>; // correções por registro
  includes: Record<string, boolean>; // escolha manual de incluir/excluir
  classOverride: Record<string, AssetClass>;
  b3Parse?: (rows: Record<string, unknown>[], assets: Asset[]) => { txs: Omit<Transaction, 'id'>[]; newAssets: Asset[]; errors: string[] };
}

export interface BuildResult {
  records: ImportRecord[];
  newAssets: NewAssetPlan[];
  stats: {
    total: number;
    valid: number;
    withIssues: number;
    errors: number;
    duplicates: number;
    conciliations: number;
    toImport: number;
    byCategory: Partial<Record<OpCategory, number>>;
    volume: number;
  };
}

const LOOSE = (t: Transaction) => [t.date, t.type, (t.ticker || '').toUpperCase(), t.qty ? +t.qty.toFixed(6) : '', t.amount.toFixed(2)].join('|');

export function buildRecords(inp: BuildInput): BuildResult {
  const ctx: Ctx = {
    byTicker: new Map(inp.assets.map((a) => [a.ticker.toUpperCase(), a])),
    byName: new Map(inp.assets.map((a) => [norm(a.name), a])),
    planned: new Map(),
    classOverride: inp.classOverride,
  };
  const records: ImportRecord[] = [];
  for (const plan of inp.plans) {
    const sheet = inp.sheets.find((s) => s.name === plan.name);
    if (!sheet || plan.kind === 'ignorar') continue;
    if (plan.kind === 'b3') {
      if (!inp.b3Parse) continue;
      const r = inp.b3Parse(sheet.rows, inp.assets);
      for (const a of r.newAssets) if (!ctx.planned.has(a.ticker)) ctx.planned.set(a.ticker, { ticker: a.ticker, name: a.name, cls: inp.classOverride[a.ticker] || a.class });
      r.txs.forEach((t, i) => {
        const a = inp.assets.find((x) => x.id === t.assetId);
        const planned = !a ? r.newAssets.find((x) => x.id === t.assetId) : null;
        const tx: Transaction = { ...t, id: uid(), assetId: a ? a.id : null, ticker: a?.ticker || planned?.ticker || t.ticker, category: categoryOf(t, a?.class || planned?.class) };
        const key = `${sheet.name}:${i + 2}`;
        records.push({ key, sheet: sheet.name, row: i + 2, kind: 'b3', category: tx.category!, values: {}, tx, issues: planned ? [{ level: 'aviso', msg: `Ticker ${planned.ticker} não cadastrado: será criado.` }] : [], status: 'ok', include: true, newTicker: planned?.ticker || null });
      });
      r.errors.forEach((e, i) => records.push({ key: `${sheet.name}:erro${i}`, sheet: sheet.name, row: Number(e.match(/Linha (\d+)/)?.[1] || 0), kind: 'b3', category: null, values: {}, tx: null, issues: [{ level: 'erro', msg: e }], status: 'erro', include: false }));
      continue;
    }
    const cat = plan.kind;
    sheet.rows.forEach((row, i) => {
      const key = `${sheet.name}:${i + 2}`;
      const values: Record<string, unknown> = {};
      for (const f of SHEETS[cat].fields) values[f.key] = plan.mapping[f.key] ? row[plan.mapping[f.key]!] : undefined;
      Object.assign(values, inp.edits[key] || {});
      // linhas totalmente vazias são ignoradas (não são registros)
      if (Object.values(values).every((x) => x === undefined || x === null || String(x).trim() === '')) return;
      const missing = SHEETS[cat].fields.filter((f) => f.required && plan.mapping[f.key] === null && !(inp.edits[key] && f.key in inp.edits[key]));
      const { tx, issues, newTicker } = convertRow(cat, values, ctx);
      if (missing.length && cat !== 'renda_fixa') issues.unshift({ level: 'aviso', msg: `Coluna não mapeada: ${missing.map((f) => f.header).join(', ')}.` });
      records.push({ key, sheet: sheet.name, row: i + 2, kind: cat, category: tx?.category || cat, values, tx, issues, status: 'ok', include: true, newTicker });
    });
  }

  // vincula ativos novos planejados (id provisório por ticker)
  const plannedIds = new Map<string, string>();
  for (const p of ctx.planned.values()) plannedIds.set(p.ticker, 'novo:' + p.ticker);
  for (const r of records) if (r.tx && !r.tx.assetId && r.newTicker) r.tx.assetId = plannedIds.get(r.newTicker) || null;
  for (const r of records) if (r.tx && !r.tx.targetAssetId && (r.tx as any)._targetTicker) r.tx.targetAssetId = plannedIds.get((r.tx as any)._targetTicker) || null;
  for (const r of records) if (r.tx && r.tx.category === undefined) r.tx.category = r.category || undefined;
  for (const r of records) {
    if (!r.tx) continue;
    const cls = r.newTicker ? ctx.planned.get(r.newTicker)?.cls : inp.assets.find((a) => a.id === r.tx!.assetId)?.class;
    if (r.tx.type === 'compra' || r.tx.type === 'venda' || r.tx.type === 'saldo_inicial') r.tx.category = categoryOf(r.tx, cls);
    r.category = r.tx.category!;
  }

  // conciliação: provento do extrato que corresponde a um lançamento AUTOMÁTICO (mesmo ativo, tipo e data de pagamento)
  const live = activeTransactions(inp.existing); // estornados não contam para conciliação nem duplicidade (achado A-02)
  const autos = live.filter((t) => t.auto);
  for (const r of records) {
    if (!r.tx || !(['dividendo', 'jcp', 'rendimento', 'amortizacao', 'outro_provento'] as TxType[]).includes(r.tx.type)) continue;
    const m = autos.find((t) => t.assetId === r.tx!.assetId && (t.type === r.tx!.type || r.tx!.type === 'outro_provento') && (t.payDate || t.date) === r.tx!.date);
    if (!m) continue;
    const diff = Math.round((r.tx.amount - m.amount) * 100) / 100;
    r.status = 'conciliacao';
    (r as any).match = { txId: m.id, diff, extractValue: r.tx.amount };
    r.issues.push(Math.abs(diff) <= 0.01 ? { level: 'aviso', msg: `Confere com o provento automático (${m.amount.toFixed(2)}): será marcado como CONFERIDO.` } : { level: 'aviso', msg: `Difere do provento automático em R$ ${diff.toFixed(2)}: vira pendência de conciliação.` });
  }

  // duplicidades: impressão digital exata e semelhança forte com o que já existe
  const existingFp = new Set(live.map((t) => t.fingerprint));
  const existingLoose = new Set(live.map(LOOSE));
  const withTx = records.filter((r) => r.tx);
  const fps = assignFingerprints(withTx.map((r) => r.tx!));
  withTx.forEach((r, i) => {
    r.tx = fps[i];
    if (r.status === 'conciliacao') return;
    if (existingFp.has(r.tx.fingerprint)) {
      r.status = 'duplicada';
      r.issues.push({ level: 'aviso', msg: 'Já registrada na plataforma (mesma operação). Não será importada de novo.' });
    } else if (existingLoose.has(LOOSE(r.tx))) {
      r.status = 'duplicada';
      r.issues.push({ level: 'aviso', msg: 'Possível duplicidade: já existe operação com mesma data, tipo, ativo, quantidade e valor.' });
    } else if (r.tx.fingerprint!.includes('#')) r.issues.push({ level: 'aviso', msg: 'Linha idêntica a outra deste arquivo. Confira se são duas operações reais.' });
  });

  // inclusão (padrão: não inclui erro nem duplicada)
  for (const r of records) {
    const errs = r.issues.some((i) => i.level === 'erro') || !r.tx;
    if (errs) r.status = 'erro';
    else if (r.status !== 'duplicada' && r.status !== 'conciliacao') r.status = r.issues.length ? 'aviso' : 'ok';
    const def = r.status === 'ok' || r.status === 'aviso';
    r.include = r.status === 'erro' ? false : inp.includes[r.key] ?? def;
  }

  // reconstrução cronológica de conferência: existente + incluídos
  const included = records.filter((r) => r.include && r.tx);
  const affected = new Set(included.map((r) => r.tx!.assetId).filter(Boolean) as string[]);
  const fakeAssets = new Map<string, Asset>();
  for (const id of affected) {
    const a = inp.assets.find((x) => x.id === id) || makeAsset({ id, ticker: id.replace('novo:', ''), class: ctx.planned.get(id.replace('novo:', ''))?.cls || 'acao' });
    fakeAssets.set(id, a);
  }
  const byRecTx = new Map(included.map((r) => [r.tx!.id, r]));
  for (const [id, a] of fakeAssets) {
    const txs = [...inp.existing.filter((t) => t.assetId === id), ...included.filter((r) => r.tx!.assetId === id).map((r) => r.tx!)].sort(txOrder);
    const p = computePosition(a, txs, true);
    for (const rv of p.reviews) {
      const r = byRecTx.get(rv.txId);
      if (r && !r.tx!.review) {
        r.issues.push({ level: 'aviso', msg: `Revisão: ${rv.message}` });
        if (r.status === 'ok') r.status = 'aviso';
      }
    }
    for (const dv of p.divergences) {
      const r = byRecTx.get(dv.txId);
      if (r) {
        r.issues.push({ level: 'aviso', msg: `Quantidade total informada (${dv.declared}) difere da posição calculada (${+dv.computed.toFixed(8)}).` });
        if (r.status === 'ok') r.status = 'aviso';
      }
    }
  }

  const byCategory: Partial<Record<OpCategory, number>> = {};
  let volume = 0;
  for (const r of included) {
    byCategory[r.category!] = (byCategory[r.category!] || 0) + 1;
    volume += Math.abs(r.tx!.amount || 0);
  }
  const usedNew = new Set([...included.map((r) => r.newTicker), ...included.map((r) => (r.tx as any)?._targetTicker)].filter(Boolean) as string[]);
  return {
    records,
    newAssets: [...ctx.planned.values()].filter((p) => usedNew.has(p.ticker)).map((p) => ({ ...p, cls: inp.classOverride[p.ticker] || p.cls })),
    stats: {
      total: records.length,
      valid: records.filter((r) => r.status === 'ok').length,
      withIssues: records.filter((r) => r.status === 'aviso').length,
      errors: records.filter((r) => r.status === 'erro').length,
      duplicates: records.filter((r) => r.status === 'duplicada').length,
      conciliations: records.filter((r) => r.status === 'conciliacao').length,
      toImport: included.length,
      byCategory,
      volume,
    },
  };
}

/** Cadastro de um ativo novo a partir do plano gerado na conversão. */
export function planToAsset(p: NewAssetPlan): Asset {
  return makeAsset({
      ticker: p.ticker,
    name: p.name,
    class: p.cls,
    status: 'carteira',
    notes: 'Criado pela Central de Operações: revise setor e emissor.',
    ...(p.cls === 'tesouro'
        ? { sector: 'Renda fixa', issuer: p.name, fixed: { indexer: /ipca/i.test(p.rf?.indexer || p.name) ? 'IPCA+' : /selic|cdi/i.test(p.rf?.indexer || p.name) ? 'Selic' : 'Prefixado', maturity: p.rf?.maturity || '', contractedRate: p.rf?.rate ?? null, marketRate: null, marketRateDate: null, coupons: /juros semestrais|cupom/i.test(p.name) } }
        : {}),
  });
}

/** Cria os ativos novos e troca os ids provisórios ("novo:TICKER") pelos definitivos. */
export function materialize(res: BuildResult): { txs: Transaction[]; assets: Asset[] } {
  const assets = res.newAssets.map(planToAsset);
  const ids = new Map(assets.map((a) => ['novo:' + a.ticker, a.id]));
  const txs = res.records
    .filter((r) => r.include && r.tx)
    .map((r) => {
      const tx = { ...r.tx! };
      if (tx.assetId && ids.has(tx.assetId)) tx.assetId = ids.get(tx.assetId)!;
      if (tx.targetAssetId && ids.has(tx.targetAssetId)) tx.targetAssetId = ids.get(tx.targetAssetId)!;
      delete (tx as any)._targetTicker;
      return tx;
    });
  return { txs, assets };
}

// ─────────────────────────── exportação no formato da planilha ───────────────────────────

const d = (iso?: string | null) => (iso ? iso.split('-').reverse().join('/') : '');
const CLASS_TXT: Record<AssetClass, string> = { acao: 'Ação', fii: 'FII', etf: 'ETF', tesouro: 'Renda fixa', cripto: 'Cripto' };

export function exportRows(txs: Transaction[], assets: Asset[]): Record<OpCategory, Record<string, unknown>[]> {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const out = Object.fromEntries((Object.keys(SHEETS) as OpCategory[]).map((c) => [c, [] as Record<string, unknown>[]])) as Record<OpCategory, Record<string, unknown>[]>;
  const row = (cat: OpCategory, vals: Record<string, unknown>) => {
    const r: Record<string, unknown> = {};
    for (const f of SHEETS[cat].fields) r[f.header] = vals[f.key] ?? '';
    out[cat].push(r);
  };
  for (const t of [...txs].sort(txOrder)) {
    const a = t.assetId ? byId.get(t.assetId) : undefined;
    const tk = a?.ticker || t.ticker || '';
    const cat = t.category || categoryOf(t, a?.class);
    if (cat === 'acoes' || cat === 'fiis' || cat === 'etfs') {
      row(cat, { ativo: tk, tipoInvestimento: a ? CLASS_TXT[a.class] : '', tipoOrdem: TX_LABEL[t.type], quantidade: t.qty ?? '', precoUnitario: t.price ?? '', total: t.gross ?? (t.qty && t.price ? +(t.qty * t.price).toFixed(2) : ''), quantidadeTotal: t.declaredPosition ?? '', data: d(t.date), corretora: t.broker || '', taxas: t.fees || '', valorLiquido: +t.amount.toFixed(2), observacoes: t.notes || '', idOperacao: t.extId || '', corretagem: t.corretagem ?? '', emolumentos: t.emolumentos ?? '', taxaLiquidacao: t.taxaLiquidacao ?? '', fonte: t.source === 'B3' ? 'B3' : t.source === 'nota' ? 'Nota de corretagem' : t.source ? 'Manual' : '' });
    } else if (cat === 'renda_fixa') {
      const app = t.type === 'compra';
      const mv = t.type === 'juros' ? 'Juros' : app ? 'Aplicação' : t.rfMovement === 'resgate_parcial' ? 'Resgate parcial' : t.rfMovement === 'vencimento' ? 'Vencimento' : 'Resgate total';
      row(cat, { ativo: a?.name || tk, tipoInvestimento: 'Renda fixa', tipoMovimentacao: mv, instituicao: t.broker || '', valorAplicado: app ? +t.amount.toFixed(2) : '', taxa: t.rate ?? '', indexador: t.indexer || '', dataAplicacao: app ? d(t.date) : '', vencimento: d(t.maturity || a?.fixed?.maturity), dataResgate: app ? '' : d(t.date), valorResgatado: app ? '' : +t.amount.toFixed(2), observacoes: t.notes || '', quantidade: t.qty ?? '', idOperacao: t.extId || '' });
    } else if (cat === 'proventos') {
      row(cat, { ativo: tk, tipoInvestimento: a ? CLASS_TXT[a.class] : '', tipoProvento: { dividendo: 'Dividendos', jcp: 'JCP', rendimento: 'Rendimentos', amortizacao: 'Amortização', juros: 'Juros' }[t.type as string] || 'Outros', dataCom: d(t.exDate), dataPagamento: d(t.payDate || t.date), quantidade: t.qty ?? '', valorUnitario: t.perUnit ?? '', valorTotal: +t.amount.toFixed(2), corretora: t.broker || '', observacoes: t.notes || '', idOperacao: t.extId || '' });
    } else if (cat === 'aportes') {
      row(cat, { data: d(t.date), valor: +t.amount.toFixed(2), origem: t.origin || '', instituicaoOrigem: t.fromInstitution || '', destino: t.destination || t.broker || '', tipoMovimentacao: t.type === 'aporte' ? 'Aporte' : t.type === 'retirada' ? 'Retirada' : 'Reinvestimento', observacoes: t.notes || '', idOperacao: t.extId || '' });
    } else if (cat === 'eventos') {
      row(cat, { ativo: tk, tipoEvento: TX_LABEL[t.type], data: d(t.date), qtdAnterior: t.qtyBefore ?? '', qtdDelta: t.qty ?? '', fator: t.factor ?? '', observacoes: t.notes || '', custoUnitario: t.price ?? '', ativoDestino: t.targetAssetId ? byId.get(t.targetAssetId)?.ticker || '' : '', percentualCusto: t.costShare ?? '', valorRecebido: t.type === 'leilao_fracao' ? +t.amount.toFixed(2) : '', idOperacao: t.extId || '' });
    } else {
      row('transferencias', { ativo: tk || 'Recursos', instituicaoOrigem: t.fromInstitution || '', instituicaoDestino: t.toInstitution || '', tipoMovimentacao: t.type === 'ajuste' ? 'Ajuste de quantidade' : tk ? 'Transferência de custódia' : 'Transferência de recursos', quantidade: t.qty ?? t.amount, data: d(t.date), observacoes: t.notes || '', idOperacao: t.extId || '' });
    }
  }
  return out;
}

// ─────────────────────────── formulários do site ───────────────────────────

/** Converte e valida um lançamento feito no formulário, com as MESMAS regras da importação. */
export function convertForForm(cat: OpCategory, values: Record<string, unknown>, assets: Asset[], classOverride: Record<string, AssetClass> = {}) {
  const ctx: Ctx = { byTicker: new Map(assets.map((a) => [a.ticker.toUpperCase(), a])), byName: new Map(assets.map((a) => [norm(a.name), a])), planned: new Map(), classOverride };
  const { tx, issues, newTicker } = convertRow(cat, values, ctx);
  const plan = newTicker ? ctx.planned.get(newTicker) || null : null;
  const tt = tx ? (tx as any)._targetTicker : null;
  const newTarget = tt && tx && !tx.targetAssetId ? ctx.planned.get(tt) || null : null;
  if (tx) delete (tx as any)._targetTicker;
  if (tx && plan) tx.category = categoryOf(tx, plan.cls);
  else if (tx) tx.category = categoryOf(tx, assets.find((a) => a.id === tx.assetId)?.class);
  return { tx, issues, newAsset: plan, newTarget };
}

/** Valores de formulário (chaves dos campos da planilha) a partir de uma operação gravada. */
export function txToValues(t: Transaction, assets: Asset[]): { cat: OpCategory; values: Record<string, unknown> } {
  const rows = exportRows([t], assets);
  const cat = (Object.keys(rows) as OpCategory[]).find((c) => rows[c].length)!;
  const row = rows[cat][0];
  const values: Record<string, unknown> = {};
  for (const f of SHEETS[cat].fields) {
    let v = row[f.header];
    if (typeof v === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(v)) v = v.split('/').reverse().join('-');
    values[f.key] = v;
  }
  return { cat, values };
}

export const FIELD_OPTIONS: Record<string, string[]> = {
  'trade.tipoInvestimento': ['Ação', 'FII', 'ETF', 'Cripto'],
  'trade.tipoOrdem': ['Compra', 'Venda', 'Saldo inicial'],
  'renda_fixa.tipoInvestimento': ['Tesouro Direto', 'CDB', 'LCI', 'LCA', 'Debênture', 'Outro'],
  'renda_fixa.tipoMovimentacao': ['Aplicação', 'Resgate parcial', 'Resgate total', 'Vencimento', 'Juros'],
  'renda_fixa.indexador': ['IPCA+', 'Prefixado', 'Selic', 'CDI'],
  'proventos.tipoInvestimento': ['Ação', 'FII', 'ETF'],
  'proventos.tipoProvento': ['Dividendos', 'JCP', 'Rendimentos', 'Amortização', 'Outros'],
  'aportes.tipoMovimentacao': ['Aporte', 'Retirada', 'Reinvestimento'],
  'eventos.tipoEvento': ['Bonificação', 'Desdobramento', 'Grupamento', 'Subscrição', 'Direitos de subscrição', 'Troca de ticker', 'Incorporação', 'Cisão', 'Leilão de frações', 'Amortização', 'Outro'],
  'trade.fonte': ['B3', 'Nota de corretagem', 'Manual'],
  'transferencias.tipoMovimentacao': ['Transferência de custódia', 'Transferência de recursos', 'Ajuste de quantidade'],
};
export const optionsFor = (cat: OpCategory, key: string) => FIELD_OPTIONS[`${cat === 'acoes' || cat === 'fiis' || cat === 'etfs' ? 'trade' : cat}.${key}`];
export const DATE_KEYS = new Set(['data', 'dataCom', 'dataPagamento', 'dataAplicacao', 'vencimento', 'dataResgate']);
export const NUM_KEYS = new Set(['corretagem', 'emolumentos', 'taxaLiquidacao', 'percentualCusto', 'valorRecebido', 'quantidade', 'precoUnitario', 'total', 'quantidadeTotal', 'taxas', 'valorLiquido', 'valorAplicado', 'taxa', 'valorResgatado', 'valorUnitario', 'valorTotal', 'valor', 'qtdAnterior', 'qtdDelta', 'fator', 'custoUnitario']);
