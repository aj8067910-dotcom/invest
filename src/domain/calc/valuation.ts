import type { Asset, Settings } from '../types';
import { isNum } from '../util';
import { computeBazin } from './bazin';

export interface ValuationLine {
  method: string;
  value: number | null;
  upside: number | null; // % vs cotação
  note: string;
}

/** Gordon: P = D1 / (k − g), com D1 = D0 × (1 + g). */
export function gordon(d0: number, kPct: number, gPct: number): number | null {
  const k = kPct / 100;
  const g = gPct / 100;
  if (k <= g) return null;
  return (d0 * (1 + g)) / (k - g);
}

/** FCD em dois estágios (5 anos + perpetuidade), por ação. */
export function dcf(fcf0: number, growthPct: number, terminalPct: number, discountPct: number, netDebtPerShare = 0, years = 5): number | null {
  const r = discountPct / 100;
  const g = growthPct / 100;
  const gt = terminalPct / 100;
  if (r <= gt) return null;
  let pv = 0;
  let f = fcf0;
  for (let t = 1; t <= years; t++) {
    f *= 1 + g;
    pv += f / Math.pow(1 + r, t);
  }
  const tv = (f * (1 + gt)) / (r - gt);
  pv += tv / Math.pow(1 + r, years);
  return pv - netDebtPerShare;
}

export function valuations(a: Asset, s: Settings): ValuationLine[] {
  const v = a.valuation || {};
  const f = a.fundamentals || {};
  const price = isNum(a.quote.price) ? a.quote.price : null;
  const up = (x: number | null) => (x !== null && price ? (x / price - 1) * 100 : null);
  const bz = computeBazin(a, s);
  const lines: ValuationLine[] = [];
  lines.push({ method: 'Bazin (preço-teto)', value: bz.ceiling, upside: up(bz.ceiling), note: bz.ceiling ? `${bz.base.value?.toFixed(2)} ÷ ${bz.dyTarget}% (${bz.base.label})` : bz.reason || 'Sem dados' });
  const d0 = bz.base.value;
  const g = d0 && isNum(v.gordonK) && isNum(v.gordonG) ? gordon(d0, v.gordonK, v.gordonG) : null;
  lines.push({ method: 'Gordon (dividendos descontados)', value: g, upside: up(g), note: isNum(v.gordonK) && isNum(v.gordonG) ? (g === null ? 'k deve ser maior que g' : `D1 ÷ (k ${v.gordonK}% − g ${v.gordonG}%)`) : 'Preencha k e g' });
  const d = isNum(v.dcfFcfPerShare) && isNum(v.dcfGrowth) && isNum(v.dcfTerminalGrowth) && isNum(v.dcfDiscount) ? dcf(v.dcfFcfPerShare, v.dcfGrowth, v.dcfTerminalGrowth, v.dcfDiscount, v.dcfNetDebtPerShare ?? 0) : null;
  lines.push({ method: 'Fluxo de Caixa Descontado', value: d, upside: up(d), note: d !== null ? `5 anos a ${v.dcfGrowth}% + perpetuidade ${v.dcfTerminalGrowth}%, taxa ${v.dcfDiscount}%` : 'Preencha FCF/ação, crescimento, perpetuidade e taxa' });
  const plh = isNum(f.lpa) && isNum(v.plHist) ? f.lpa * v.plHist : null;
  lines.push({ method: 'P/L histórico', value: plh, upside: up(plh), note: plh !== null ? `LPA ${f.lpa} × P/L médio ${v.plHist}` : 'Preencha LPA e P/L histórico' });
  const pls = isNum(f.lpa) && isNum(v.plSector) ? f.lpa * v.plSector : null;
  lines.push({ method: 'P/L setorial', value: pls, upside: up(pls), note: pls !== null ? `LPA ${f.lpa} × P/L do setor ${v.plSector}` : 'Preencha LPA e P/L setorial' });
  const pvh = isNum(f.vpa) && isNum(v.pvpHist) ? f.vpa * v.pvpHist : null;
  lines.push({ method: 'P/VP histórico', value: pvh, upside: up(pvh), note: pvh !== null ? `VPA ${f.vpa} × P/VP médio ${v.pvpHist}` : 'Preencha VPA e P/VP histórico' });
  if (a.class === 'acao') {
    const gr = isNum(f.lpa) && isNum(f.vpa) && f.lpa > 0 && f.vpa > 0 ? Math.sqrt(22.5 * f.lpa * f.vpa) : null;
    lines.push({ method: 'Graham (referência)', value: gr, upside: up(gr), note: gr !== null ? '√(22,5 × LPA × VPA)' : 'Preencha LPA e VPA positivos' });
  }
  return lines;
}

/** Valor justo consolidado = mediana dos métodos disponíveis (dado conservador). */
export function fairValueSummary(lines: ValuationLine[]) {
  const vals = lines.map((l) => l.value).filter((x): x is number => isNum(x) && x > 0).sort((a, b) => a - b);
  if (!vals.length) return null;
  const m = Math.floor(vals.length / 2);
  const median = vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  return { median, min: vals[0], max: vals[vals.length - 1], count: vals.length };
}
