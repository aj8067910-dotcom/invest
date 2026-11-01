// Lançamento automático de proventos pela data-com.
//
// Regra (B3 — Manual de Procedimentos Operacionais; Lei 6.404/1976, art. 205): tem direito ao provento
// quem tem a ação no FECHAMENTO do pregão da data-com. Compras com data de pregão até a data-com
// contam; compras na data-ex ou depois não contam. Vendas até a data-com reduzem a posição
// elegível; vendas na data-ex ou depois não tiram o direito. Desdobramento, grupamento ou bonificação
// posteriores à data-com não alteram o provento já devido (usa-se a quantidade e o valor da data-com).
import type { Asset, Settings, Transaction, TxType } from '../types';
import { INCOME_TX } from '../types';
import { D, Decimal, N, ZERO, cents } from '../money';
import { dividendMonthlyIR, provTax } from '../tax';
import { activeTransactions } from '../ledger';
import { expandLedger, positionAt } from './positions';
import { todayISO } from '../util';

export type ProvType = 'dividendo' | 'jcp' | 'rendimento' | 'amortizacao';

/** Item do calendário de proventos (dado de mercado, com fonte e coleta). */
export interface CalendarItem {
  type: ProvType;
  perUnit: number; // valor por ação/cota anunciado (bruto)
  dataCom: string; // último dia com direito
  dataEx?: string | null;
  payDate?: string | null; // pode ainda não estar definida
  approvedOn?: string | null;
  source: string;
  collectedAt: string;
}

export const B3_HISTORY_START = '2019-11-01';

export const autoKey = (ticker: string, type: string, dataCom: string, payDate?: string | null) => `${ticker.toUpperCase()}|${type}|${dataCom}|${payDate || ''}`;

/** Recebido = data de pagamento já passou. Provisionado = data-com passou e pagamento ainda não. */
export function provStatus(t: Transaction, asOf = todayISO(), conferred?: Set<string>): 'provisionado' | 'recebido' | 'conferido' {
  if (conferred?.has(t.id)) return 'conferido';
  if (t.auto && !t.payDate) return 'provisionado';
  return (t.payDate || t.date) <= asOf ? 'recebido' : 'provisionado';
}

export interface AutoPlan {
  create: Transaction[];
  reverse: { id: string; reason: string }[];
  divergences: { ticker: string; type: TxType; payDate: string; manual: number; computed: number; txId: string }[];
  upcoming: { ticker: string; assetId: string; type: ProvType; dataCom: string; payDate?: string | null; perUnit: number }[];
}

interface Computed {
  asset: Asset;
  item: CalendarItem;
  eligible: Decimal;
  gross: Decimal;
  ir: Decimal;
  net: Decimal;
  rule: string;
  key: string;
}

const same = (a: number, b: number) => Math.abs(a - b) <= 0.005;

/**
 * Calcula os lançamentos automáticos esperados e compara com o livro.
 * Idempotente: aplicar o plano e rodar de novo produz um plano vazio.
 */
export function planAutoProventos(assets: Asset[], txs: Transaction[], calendar: Record<string, CalendarItem[]>, s: Settings, asOf = todayISO(), deviceName = 'automático'): AutoPlan {
  const plan: AutoPlan = { create: [], reverse: [], divergences: [], upcoming: [] };
  const active = activeTransactions(txs);
  const { lists } = expandLedger(assets, txs, asOf);
  const computed: Computed[] = [];

  for (const a of assets) {
    const items = calendar[a.ticker.toUpperCase()] || [];
    for (const it of items) {
      if (it.dataCom >= asOf && it.dataCom <= addDays(asOf, 7) && (a.status === 'watchlist' || (lists.get(a.id) || []).length)) {
        plan.upcoming.push({ ticker: a.ticker, assetId: a.id, type: it.type, dataCom: it.dataCom, payDate: it.payDate, perUnit: it.perUnit });
      }
    }
    const list = lists.get(a.id) || [];
    if (!list.some((t) => t.type === 'compra' || t.type === 'saldo_inicial' || (t as any).incoming)) continue;
    for (const it of items) {
      if (it.dataCom > asOf) continue; // data-com ainda não ocorreu
      const eligible = D(positionAt(a, list, it.dataCom));
      if (eligible.lessThanOrEqualTo(0)) continue;
      const gross = cents(eligible.times(D(it.perUnit)));
      const tx = provTax(it.type, gross, s.tax, { fiiExempt: a.fiiTaxExempt });
      const ir = cents(tx.ir); // dinheiro efetivamente retido: centavos
      computed.push({ asset: a, item: it, eligible, gross, ir, net: gross.minus(ir), rule: tx.rule, key: autoKey(a.ticker, it.type, it.dataCom, it.payDate) });
    }
  }

  // Dividendos: retenção de 10% sobre o TOTAL do mês por empresa (emissor) quando passa do limite
  const groups = new Map<string, Computed[]>();
  for (const c of computed) if (c.item.type === 'dividendo' && c.item.payDate) {
    const k = `${c.asset.issuer}|${c.item.payDate.slice(0, 7)}`;
    (groups.get(k) || groups.set(k, []).get(k)!).push(c);
  }
  for (const g of groups.values()) {
    const total = g.reduce((x, c) => x.plus(c.gross), ZERO);
    const ir = dividendMonthlyIR(total, s.tax);
    if (ir.isZero()) continue;
    let left = ir;
    g.forEach((c, i) => {
      const part = i === g.length - 1 ? left : cents(ir.times(c.gross).dividedBy(total));
      left = left.minus(part);
      c.ir = part;
      c.net = c.gross.minus(part);
      c.rule = `Dividendos da empresa no mês somam R$ ${total.toFixed(2)} (> R$ ${s.tax.dividendMonthlyExempt}): retenção de ${s.tax.dividendRateAbove}% sobre o total.`;
    });
  }

  const autos = active.filter((t) => t.auto);
  const byKey = new Map(autos.map((t) => [t.autoKey, t]));
  const manual = active.filter((t) => !t.auto && (INCOME_TX.includes(t.type) || t.type === 'amortizacao'));
  const wanted = new Set<string>();

  for (const c of computed) {
    wanted.add(c.key);
    const net = N(c.net);
    // já lançado à mão: não duplica; aponta diferença
    const m = manual.find((t) => t.assetId === c.asset.id && t.type === c.item.type && ((c.item.payDate && (t.payDate || t.date) === c.item.payDate) || (t.exDate && t.exDate === c.item.dataCom)));
    if (m) {
      if (!same(m.amount, net)) plan.divergences.push({ ticker: c.asset.ticker, type: c.item.type, payDate: c.item.payDate || c.item.dataCom, manual: m.amount, computed: net, txId: m.id });
      continue;
    }
    const prev = byKey.get(c.key);
    if (prev && same(prev.amount, net) && same(prev.qty ?? 0, N(c.eligible)) && same(prev.perUnit ?? 0, c.item.perUnit)) continue;
    if (prev) plan.reverse.push({ id: prev.id, reason: 'Recálculo: posição elegível ou valor do aviso mudou.' });
    // retificação: mesmo ativo, tipo e data-com, mas outra data de pagamento
    const rect = autos.find((t) => t.assetId === c.asset.id && t.type === c.item.type && t.exDate === c.item.dataCom && t.autoKey !== c.key);
    if (rect && !plan.reverse.some((r) => r.id === rect.id)) plan.reverse.push({ id: rect.id, reason: 'Aviso retificado pela companhia (data de pagamento ou valor).' });
    const now = new Date().toISOString();
    plan.create.push({
      id: cryptoId(),
      date: c.item.payDate || c.item.dataCom,
      type: c.item.type,
      category: 'proventos',
      assetId: c.asset.id,
      ticker: c.asset.ticker,
      qty: N(c.eligible),
      perUnit: c.item.perUnit,
      exDate: c.item.dataCom,
      payDate: c.item.payDate || null,
      gross: N(c.gross),
      ir: N(c.ir),
      amount: net,
      auto: true,
      autoKey: c.key,
      source: 'automatico',
      reliability: c.item.dataCom < B3_HISTORY_START || c.item.source.startsWith('Yahoo') ? 'estimada' : 'confirmada',
      notes: `Automático: ${N(c.eligible)} × R$ ${c.item.perUnit} (data-com ${br(c.item.dataCom)}). ${c.rule} Fonte: ${c.item.source}, coletado em ${br(c.item.collectedAt.slice(0, 10))}.`,
      by: deviceName,
      createdAt: now,
      updatedAt: now,
    });
  }
  // posição elegível zerada para um item ainda presente no calendário → estorna
  const calKeys = new Set<string>();
  for (const a of assets) for (const it of calendar[a.ticker.toUpperCase()] || []) calKeys.add(autoKey(a.ticker, it.type, it.dataCom, it.payDate));
  for (const t of autos) if (t.autoKey && calKeys.has(t.autoKey) && !wanted.has(t.autoKey) && !plan.reverse.some((r) => r.id === t.id)) plan.reverse.push({ id: t.id, reason: 'Sem posição elegível na data-com após recálculo do livro.' });
  return plan;
}

const br = (iso: string) => iso.split('-').reverse().join('/');
const cryptoId = () => (globalThis.crypto && 'randomUUID' in globalThis.crypto ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2));
function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ───────────── conciliação com extrato ─────────────

export interface Conciliation {
  id: string;
  at: string;
  txId: string;
  extractValue: number;
  diff: number;
  status: 'conferido' | 'pendente';
  cause?: string;
  source: string;
}

/** Causas prováveis de diferença entre o calculado e o extrato. */
export function probableCause(diff: number, t: Transaction): string {
  const rel = t.amount ? Math.abs(diff) / t.amount : 1;
  if (Math.abs(diff) <= 0.05) return 'Arredondamento.';
  if (diff < 0 && rel > 0.2) return 'Parte dos ativos em outra corretora, ou ações emprestadas (o extrato traz reembolso de provento separado).';
  if (diff > 0) return 'Aviso retificado pela companhia, ou posição maior que a registrada no livro (falta lançar compra?).';
  return 'Aviso retificado, IR diferente do previsto ou ativos emprestados.';
}
