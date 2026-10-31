import type { Asset, Bands, Settings } from '../types';
import { isBazinClass } from '../types';
import { isNum, todayISO } from '../util';
import { bazinBase, ttmPerUnit, type BazinBase } from './dividends';

export type BandKey = 'aguardar' | 'manutencao' | 'oportunidade' | 'extrema';

export const BAND_INFO: Record<BandKey, { label: string; decision: string; tone: 'muted' | 'info' | 'good' | 'great' }> = {
  aguardar: { label: 'Aguardar', decision: 'Não comprar', tone: 'muted' },
  manutencao: { label: 'Comprar para manutenção', decision: 'Compra seletiva', tone: 'info' },
  oportunidade: { label: 'Comprar para oportunidade', decision: 'Priorizar análise de compra', tone: 'good' },
  extrema: { label: 'Oportunidade extrema', decision: 'Revisar fundamentos e possível compra', tone: 'great' },
};

export const BAND_ORDER: BandKey[] = ['aguardar', 'manutencao', 'oportunidade', 'extrema'];

/** Preço-teto = provento anual por unidade ÷ DY-alvo. */
export const ceilingPrice = (annualDividend: number, dyTargetPct: number) =>
  dyTargetPct > 0 ? annualDividend / (dyTargetPct / 100) : NaN;

export function bandFor(ratioPct: number, b: Bands): BandKey {
  if (ratioPct > b.wait) return 'aguardar';
  if (ratioPct > b.maintenance) return 'manutencao';
  if (ratioPct > b.opportunity) return 'oportunidade';
  return 'extrema';
}

export interface BandLevel {
  key: BandKey;
  upperPrice: number; // preço máximo para entrar na faixa
  distanceAbs: number | null; // R$ que o preço precisa cair para entrar (0 se já está)
  distancePct: number | null;
  reached: boolean;
}

export interface BazinResult {
  applicable: boolean;
  reason?: string;
  base: BazinBase;
  dyTarget: number;
  ceiling: number | null;
  price: number | null;
  dyCurrent: number | null; // recorrente
  dyTotal: number | null; // incluindo extraordinário
  ratio: number | null; // preço / teto em %
  discount: number | null; // (teto − preço) / teto em %  (positivo = desconto; negativo = prêmio)
  safetyMargin: number | null;
  idealEntry: number | null;
  band: BandKey | null;
  levels: BandLevel[];
  nextBand: BandLevel | null;
  scenarios: { dy: number; ceiling: number | null; ratio: number | null; band: BandKey | null }[];
  extraShare: number;
}

export function dyTargetFor(a: Asset, s: Settings) {
  if (isNum(a.dyTarget) && a.dyTarget > 0) return a.dyTarget;
  return a.class === 'fii' ? s.defaultDy.fii : s.defaultDy.acao;
}

export function computeBazin(a: Asset, s: Settings, asOf = todayISO()): BazinResult {
  const dyTarget = dyTargetFor(a, s);
  const base = bazinBase(a, asOf);
  const price = isNum(a.quote.price) && a.quote.price > 0 ? a.quote.price : null;
  const ttm = ttmPerUnit(a, asOf);
  const empty: BazinResult = {
    applicable: false,
    base,
    dyTarget,
    ceiling: null,
    price,
    dyCurrent: null,
    dyTotal: null,
    ratio: null,
    discount: null,
    safetyMargin: null,
    idealEntry: null,
    band: null,
    levels: [],
    nextBand: null,
    scenarios: [],
    extraShare: ttm.extraShare,
  };
  if (!isBazinClass(a.class)) return { ...empty, reason: 'Método Bazin não se aplica a esta classe (ETF, Tesouro ou cripto).' };

  const dyCurrent = price && ttm.recurring > 0 ? (ttm.recurring / price) * 100 : null;
  const dyTotal = price && ttm.total > 0 ? (ttm.total / price) * 100 : null;
  const scenarios = s.dyScenarios.map((dy) => {
    const c = base.value ? ceilingPrice(base.value, dy) : null;
    const r = c && price ? (price / c) * 100 : null;
    return { dy, ceiling: c, ratio: r, band: r !== null ? bandFor(r, s.bands) : null };
  });
  if (!base.value) return { ...empty, applicable: true, reason: 'Sem proventos recorrentes cadastrados: preencha o histórico ou uma estimativa.', dyCurrent, dyTotal, scenarios };

  const ceiling = ceilingPrice(base.value, dyTarget);
  const thresholds: [BandKey, number][] = [
    ['aguardar', Infinity],
    ['manutencao', s.bands.wait],
    ['oportunidade', s.bands.maintenance],
    ['extrema', s.bands.opportunity],
  ];
  const levels: BandLevel[] = thresholds.map(([key, pct]) => {
    const upper = pct === Infinity ? Infinity : (ceiling * pct) / 100;
    const reached = price !== null ? price <= upper : false;
    const distanceAbs = price !== null && upper !== Infinity ? Math.max(0, price - upper) : null;
    return {
      key,
      upperPrice: upper,
      distanceAbs,
      distancePct: distanceAbs !== null && price ? (-distanceAbs / price) * 100 : null,
      reached,
    };
  });
  const ratio = price !== null ? (price / ceiling) * 100 : null;
  const band = ratio !== null ? bandFor(ratio, s.bands) : null;
  const idx = band ? BAND_ORDER.indexOf(band) : -1;
  const nextBand = idx >= 0 && idx < 3 ? levels[idx + 1] : null;
  const discount = price !== null ? ((ceiling - price) / ceiling) * 100 : null;
  return {
    applicable: true,
    base,
    dyTarget,
    ceiling,
    price,
    dyCurrent,
    dyTotal,
    ratio,
    discount,
    safetyMargin: discount !== null ? Math.max(0, discount) : null,
    idealEntry: (ceiling * s.bands.maintenance) / 100,
    band,
    levels,
    nextBand,
    scenarios,
    extraShare: ttm.extraShare,
  };
}
