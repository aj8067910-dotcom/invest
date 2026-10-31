import type { ScenarioParams } from '../types';

export interface ProjectionPoint {
  year: number;
  month: number; // índice de meses a partir do início
  date: string; // yyyy-mm
  patrimony: number; // nominal
  patrimonyReal: number; // em R$ de hoje
  contributed: number; // soma de aportes
  incomeMonthly: number; // renda líquida mensal nominal
  incomeMonthlyReal: number;
  incomeAnnual: number;
}

export interface ProjectionInput {
  start: string; // yyyy-mm-dd
  initial: number;
  monthly: number;
  endYear: number;
  p: ScenarioParams;
}

/**
 * Simulação mensal: aporte → proventos (DY/12, líquidos de impostos) → reinvestimento
 * parcial → valorização de preço → custos. Valores reais deflacionados pela inflação.
 * É uma projeção hipotética, não garantia de retorno.
 */
export function project({ start, initial, monthly, endYear, p }: ProjectionInput): ProjectionPoint[] {
  const d = new Date(start + 'T12:00:00');
  let y = d.getFullYear();
  let m = d.getMonth();
  const out: ProjectionPoint[] = [];
  let P = initial;
  let contributed = initial;
  let aporte = monthly;
  const gPrice = Math.pow(1 + p.appreciation / 100, 1 / 12) - 1;
  const fee = Math.pow(1 + p.fee / 100, 1 / 12) - 1;
  const infl = Math.pow(1 + p.inflation / 100, 1 / 12) - 1;
  let deflator = 1;
  let i = 0;
  while (y < endYear || (y === endYear && m <= 11)) {
    if (i > 0 && m === 0) aporte *= 1 + p.contribGrowth / 100;
    P += aporte;
    contributed += aporte;
    const income = ((P * p.dy) / 100 / 12) * (1 - p.taxRate / 100);
    P += income * (p.reinvest / 100);
    P *= 1 + gPrice;
    P *= 1 - fee;
    deflator *= 1 + infl;
    out.push({
      year: y,
      month: i,
      date: `${y}-${String(m + 1).padStart(2, '0')}`,
      patrimony: P,
      patrimonyReal: P / deflator,
      contributed,
      incomeMonthly: income,
      incomeMonthlyReal: income / deflator,
      incomeAnnual: income * 12,
    });
    i++;
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

export function atYearEnd(points: ProjectionPoint[], year: number) {
  return points.filter((x) => x.year === year).pop() || null;
}

/** Primeiro mês em que a renda mensal (real, em R$ de hoje) alcança a meta. */
export function goalReach(points: ProjectionPoint[], goal: number, real = true) {
  const hit = points.find((x) => (real ? x.incomeMonthlyReal : x.incomeMonthly) >= goal);
  if (!hit) return null;
  return { date: hit.date, years: hit.month / 12 };
}
