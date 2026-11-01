// Preço-teto e régua de compra — um único motor para a Calculadora e o Método Bazin.
//
// Fundamento: Bazin (1992), "Faça Fortuna com Ações": preço-teto = dividendo anual ÷ DY mínimo (6%).
// Aqui: Teto = DPA de referência LÍQUIDO ÷ DY exigido; Oportunidade = Teto × (1 − margem);
// margem de segurança = (Teto − Preço) ÷ Teto, aplicada uma única vez (Graham, 1949).
// Proventos extraordinários marcados não entram no DPA (Lintner, 1956: só o componente estável
// e recorrente do dividendo orienta a política de pagamento).
import type { Asset, Bands, DpaRef, Settings, Distribution } from '../types';
import { isBazinClass, DPA_REF_LABEL } from '../types';
import { isNum, todayISO } from '../util';
import { D, Decimal, N, ZERO } from '../money';
import { ttmPerUnit, type BazinBase } from './dividends';

export type BandKey = 'aguardar' | 'manutencao' | 'oportunidade';

export const BAND_INFO: Record<BandKey, { label: string; decision: string; tone: 'muted' | 'info' | 'good' }> = {
  aguardar: { label: 'Aguardar', decision: 'Preço acima do teto: não comprar', tone: 'muted' },
  manutencao: { label: 'Manutenção', decision: 'Abaixo do teto, margem menor que a exigida: compra seletiva', tone: 'info' },
  oportunidade: { label: 'Oportunidade', decision: 'Margem de segurança atingida: comprar se aprovado no filtro de qualidade', tone: 'good' },
};

export const BAND_ORDER: BandKey[] = ['aguardar', 'manutencao', 'oportunidade'];

/** Preço-teto = provento anual por unidade ÷ DY exigido. */
export const ceilingPrice = (annualDividend: Decimal.Value, dyTargetPct: Decimal.Value) =>
  D(dyTargetPct).greaterThan(0) ? N(D(annualDividend).dividedBy(D(dyTargetPct).dividedBy(100))) : NaN;

/** Margem de segurança (%) = (Teto − Preço) ÷ Teto. */
export const marginOf = (ceiling: number, price: number) => N(D(ceiling).minus(price).dividedBy(ceiling).times(100));

export function bandForMargin(marginPct: number, b: Bands): BandKey {
  if (marginPct < 0) return 'aguardar';
  if (marginPct < b.margin) return 'manutencao';
  return 'oportunidade';
}

export interface BandLevel {
  key: BandKey;
  upperPrice: number; // preço máximo para estar na faixa
  distanceAbs: number | null;
  distancePct: number | null;
  reached: boolean;
}

export interface BazinResult {
  applicable: boolean;
  reason?: string;
  base: BazinBase; // DPA de referência LÍQUIDO
  dpaRef: DpaRef;
  dpaNote: string;
  dyTarget: number;
  ceiling: number | null;
  bazinCeiling: number | null; // teto com o DY original de Bazin (6%)
  opportunityPrice: number | null;
  price: number | null;
  dyCurrent: number | null; // DY líquido 12m recorrente sobre a cotação
  dyTotal: number | null;
  margin: number | null; // %
  ratio: number | null; // preço ÷ teto (%)
  discount: number | null; // = margem (compatibilidade)
  safetyMargin: number | null;
  idealEntry: number | null; // = preço de oportunidade
  band: BandKey | null;
  levels: BandLevel[];
  nextBand: BandLevel | null;
  scenarios: { dy: number; ceiling: number | null; margin: number | null; band: BandKey | null }[];
  extraShare: number;
}

export function dyTargetFor(a: Asset, s: Settings) {
  if (isNum(a.dyTarget) && a.dyTarget > 0) return a.dyTarget;
  return a.class === 'fii' ? s.defaultDy.fii : s.defaultDy.acao;
}

/** DPA de referência padrão: 5 anos para ações, 12 meses para FIIs, ciclo completo para commodities. */
export function dpaRefFor(a: Asset, s: Settings): DpaRef {
  if (a.dpaRef) return a.dpaRef;
  if (a.class === 'fii') return s.dpa.fii;
  if (s.limits360.commoditySectors.includes(a.sector)) return s.dpa.commodity;
  return s.dpa.acao;
}

/** Valor LÍQUIDO por unidade de um provento: JCP com IRRF; FII não isento com IR; dividendo bruto (a regra dos R$ 50 mil/mês é por investidor, não por ação). */
export function netPerUnit(d: Distribution, a: Asset, s: Settings): Decimal {
  const v = D(d.value);
  if (d.type === 'jcp') return v.times(D(100).minus(s.tax.jcpRate)).dividedBy(100);
  if (d.type === 'rendimento' && a.fiiTaxExempt === false) return v.times(D(100).minus(s.tax.fiiRateIfNotExempt)).dividedBy(100);
  return v;
}

/** DPA anual LÍQUIDO por ano-calendário (pela data-com), só recorrentes. */
export function netAnnual(a: Asset, s: Settings, asOf = todayISO()) {
  const cur = Number(asOf.slice(0, 4));
  const map = new Map<number, Decimal>();
  for (const d of a.distributions) {
    if (!d.recurring || d.type === 'amortizacao') continue;
    const y = Number(d.exDate.slice(0, 4));
    map.set(y, (map.get(y) || ZERO).plus(netPerUnit(d, a, s)));
  }
  return [...map.entries()].filter(([y]) => y < cur).sort((x, y) => x[0] - y[0]);
}

export function referenceDpa(a: Asset, s: Settings, asOf = todayISO()): BazinBase & { ref: DpaRef; note: string } {
  const ref = dpaRefFor(a, s);
  if (a.useEstimate && isNum(a.next12mEstimate) && a.next12mEstimate > 0)
    return { value: a.next12mEstimate, kind: 'estimativa', label: 'Estimativa manual (informe o valor líquido)', ref, note: 'estimativa' };
  if (ref === '12m') {
    const start = new Date(new Date(asOf + 'T12:00:00Z').getTime() - 365 * 86400000).toISOString().slice(0, 10);
    const v = a.distributions.filter((d) => d.recurring && d.type !== 'amortizacao' && d.exDate > start && d.exDate <= asOf).reduce((x, d) => x.plus(netPerUnit(d, a, s)), ZERO);
    return v.greaterThan(0) ? { value: N(v), kind: 'real', label: `${DPA_REF_LABEL['12m']} (líquido)`, ref, note: '' } : { value: null, kind: 'ausente', label: 'Sem proventos recorrentes nos últimos 12 meses', ref, note: '' };
  }
  const years = netAnnual(a, s, asOf);
  const want = ref === '3a' ? 3 : 5;
  const used = ref === 'ciclo' ? years : years.slice(-want);
  if (!used.length) return { value: null, kind: 'ausente', label: 'Sem anos completos de proventos', ref, note: '' };
  const avg = used.reduce((x, [, v]) => x.plus(v), ZERO).dividedBy(used.length);
  const note = ref === 'ciclo' ? (used.length < 5 ? `ciclo incompleto: ${used.length} ano(s) disponível(is), mínimo recomendado 5` : `${used.length} anos`) : used.length < want ? `só ${used.length} de ${want} anos disponíveis` : '';
  return { value: N(avg), kind: 'real', label: `${DPA_REF_LABEL[ref]} (líquido, ${used[0][0]}–${used[used.length - 1][0]})`, ref, note };
}

export function computeBazin(a: Asset, s: Settings, asOf = todayISO()): BazinResult {
  const dyTarget = dyTargetFor(a, s);
  const base = referenceDpa(a, s, asOf);
  const price = isNum(a.quote.price) && a.quote.price > 0 ? a.quote.price : null;
  const ttm = ttmPerUnit(a, asOf);
  const empty: BazinResult = {
    applicable: false, base, dpaRef: base.ref, dpaNote: base.note, dyTarget, ceiling: null, bazinCeiling: null, opportunityPrice: null, price,
    dyCurrent: null, dyTotal: null, margin: null, ratio: null, discount: null, safetyMargin: null, idealEntry: null, band: null, levels: [], nextBand: null, scenarios: [], extraShare: ttm.extraShare,
  };
  if (!isBazinClass(a.class)) return { ...empty, reason: 'Método Bazin não se aplica a esta classe (ETF, Tesouro ou cripto): decisão por alocação.' };
  // DY atual líquido (12m recorrente)
  const start = new Date(new Date(asOf + 'T12:00:00Z').getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const ttmNet = a.distributions.filter((d) => d.recurring && d.type !== 'amortizacao' && d.exDate > start && d.exDate <= asOf).reduce((x, d) => x.plus(netPerUnit(d, a, s)), ZERO);
  const ttmNetAll = a.distributions.filter((d) => d.type !== 'amortizacao' && d.exDate > start && d.exDate <= asOf).reduce((x, d) => x.plus(netPerUnit(d, a, s)), ZERO);
  const dyCurrent = price && ttmNet.greaterThan(0) ? N(ttmNet.dividedBy(price).times(100)) : null;
  const dyTotal = price && ttmNetAll.greaterThan(0) ? N(ttmNetAll.dividedBy(price).times(100)) : null;
  const scenarios = s.dyScenarios.map((dy) => {
    const c = base.value ? ceilingPrice(base.value, dy) : null;
    const m = c && price ? marginOf(c, price) : null;
    return { dy, ceiling: c, margin: m, band: m !== null ? bandForMargin(m, s.bands) : null };
  });
  if (!base.value) return { ...empty, applicable: true, reason: 'Sem proventos recorrentes cadastrados: preencha o histórico ou uma estimativa.', dyCurrent, dyTotal, scenarios };

  const ceiling = ceilingPrice(base.value, dyTarget);
  const opportunityPrice = N(D(ceiling).times(D(100).minus(s.bands.margin)).dividedBy(100));
  const margin = price !== null ? marginOf(ceiling, price) : null;
  const band = margin !== null ? bandForMargin(margin, s.bands) : null;
  const uppers: [BandKey, number][] = [['aguardar', Infinity], ['manutencao', ceiling], ['oportunidade', opportunityPrice]];
  const levels: BandLevel[] = uppers.map(([key, upper]) => {
    const distanceAbs = price !== null && upper !== Infinity ? Math.max(0, N(D(price).minus(upper))) : null;
    return { key, upperPrice: upper, distanceAbs, distancePct: distanceAbs !== null && price ? (-distanceAbs / price) * 100 : null, reached: price !== null && price <= upper };
  });
  const idx = band ? BAND_ORDER.indexOf(band) : -1;
  return {
    applicable: true,
    base,
    dpaRef: base.ref,
    dpaNote: base.note,
    dyTarget,
    ceiling,
    bazinCeiling: ceilingPrice(base.value, s.bazinDy),
    opportunityPrice,
    price,
    dyCurrent,
    dyTotal,
    margin,
    ratio: price !== null ? (price / ceiling) * 100 : null,
    discount: margin,
    safetyMargin: margin !== null ? Math.max(0, margin) : null,
    idealEntry: opportunityPrice,
    band,
    levels,
    nextBand: idx >= 0 && idx < 2 ? levels[idx + 1] : null,
    scenarios,
    extraShare: ttm.extraShare,
  };
}
