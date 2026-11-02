// Indicadores fundamentalistas calculados das demonstrações anuais entregues à CVM (DFP).
// Hierarquia de fontes: CVM (primária) → valor manual (reserva, com fonte e data informadas por você).
import type { Asset, Fundamentals } from '../types';
import type { CompanyFin, FinYear, MarketData } from '../market';
import { isNum } from '../util';

export type FundKey = 'payout' | 'roe' | 'netMargin' | 'ebitdaMargin' | 'netDebtEbitda' | 'fcf' | 'fcfYield' | 'lpa' | 'vpa' | 'pl' | 'pvp' | 'evEbitda' | 'revenueGrowth' | 'earningsGrowth';

/** Como cada indicador é calculado (mostrado na tela). */
export const FUND_FORMULA: Record<FundKey, string> = {
  payout: 'Dividendos e JCP pagos (DFC) ÷ lucro líquido da controladora (DRE), somados nos últimos 3 anos — o caixa pago num ano costuma ser do lucro do ano anterior',
  roe: 'Lucro líquido ÷ patrimônio líquido médio (início e fim do ano)',
  netMargin: 'Lucro líquido ÷ receita líquida (3.01)',
  ebitdaMargin: '(EBIT 3.05 + depreciação/amortização da DFC) ÷ receita líquida',
  netDebtEbitda: '(Empréstimos, financiamentos e debêntures CP + LP − caixa e aplicações) ÷ EBITDA',
  fcf: 'Caixa das operações (6.01) − compras de imobilizado e intangível (6.02), em R$ milhões',
  fcfYield: 'Fluxo de caixa livre ÷ valor de mercado (cotação × ações em circulação)',
  lpa: 'Lucro líquido ÷ ações em circulação (por unidade negociada)',
  vpa: 'Patrimônio líquido ÷ ações em circulação (por unidade negociada)',
  pl: 'Cotação ÷ LPA',
  pvp: 'Cotação ÷ VPA',
  evEbitda: '(Valor de mercado + dívida líquida) ÷ EBITDA',
  revenueGrowth: 'Crescimento anual composto da receita (até 5 anos)',
  earningsGrowth: 'Crescimento anual composto do lucro (até 5 anos)',
};

export interface CvmFund {
  values: Partial<Record<FundKey, number>>;
  year: number | null;
  source: string;
  dataBase: string;
  notes: string[];
}

const has = (y: FinYear) => isNum(y.totalAssets) && y.totalAssets > 0 && isNum(y.netIncome);
const cagr = (first?: number | null, last?: number | null, n = 1) => (isNum(first) && isNum(last) && first > 0 && last > 0 && n > 0 ? (Math.pow(last / first, 1 / n) - 1) * 100 : null);

/** Payout em caixa de 3 anos: Σ dividendos/JCP pagos ÷ Σ lucro líquido (evita o descasamento de um ano). */
export function payout3y(years: FinYear[]): number | null {
  const ys = years.filter((y) => isNum(y.netIncome) && isNum(y.dividendsPaid)).sort((x, y) => x.year - y.year).slice(-3);
  if (!ys.length) return null;
  const ni = ys.reduce((s, y) => s + (y.netIncome as number), 0);
  const dv = ys.reduce((s, y) => s + (y.dividendsPaid as number), 0);
  return ni > 0 ? (dv / ni) * 100 : null;
}

export function cvmFundamentals(a: Asset, market: MarketData): CvmFund | null {
  if (a.class !== 'acao') return null;
  const fin: CompanyFin | undefined = market.companies?.[a.ticker];
  if (!fin) return null;
  const ys = (fin.years || []).filter(has).sort((x, y) => x.year - y.year);
  const y0 = ys[ys.length - 1];
  if (!y0) return null;
  const isFin = fin.financial || /financ|banc|segur/i.test(a.sector);
  const v: CvmFund['values'] = {};
  const notes: string[] = [];
  const set = (k: FundKey, x: number | null) => { if (isNum(x) && isFinite(x)) v[k] = x; };

  const ni = y0.netIncome as number;
  set('payout', payout3y(ys));
  const y1 = ys[ys.length - 2];
  const eq = isNum(y0.equity) ? (y1 && isNum(y1.equity) ? (y0.equity + y1.equity) / 2 : y0.equity) : null;
  set('roe', eq && eq > 0 ? (ni / eq) * 100 : null);

  const ebitda = isNum(y0.ebit) ? y0.ebit + (y0.depreciation ?? 0) : null;
  const debt = isNum(y0.shortDebt) || isNum(y0.longDebt) ? (y0.shortDebt ?? 0) + (y0.longDebt ?? 0) : null;
  const netDebt = debt !== null ? debt - (y0.cash ?? 0) : null;
  if (!isFin) {
    if (isNum(y0.revenue) && y0.revenue > 0) {
      set('netMargin', (ni / y0.revenue) * 100);
      set('ebitdaMargin', ebitda !== null ? (ebitda / y0.revenue) * 100 : null);
    }
    if (netDebt !== null && ebitda !== null && ebitda > 0) set('netDebtEbitda', netDebt / ebitda);
    if (isNum(y0.fco)) set('fcf', (y0.fco - (y0.capex ?? 0)) / 1e6);
    if (isNum(y0.fco) && !isNum(y0.capex)) notes.push('Sem compras de imobilizado na DFC: FCL = caixa das operações.');
  } else notes.push('Instituição financeira/seguradora: margem, dívida/EBITDA e FCL não se aplicam.');

  // por ação (unidades como TAEE11 = 3 ações)
  const unit = fin.unitShares || 1;
  const shares = y0.shares || ys.slice().reverse().find((y) => y.shares)?.shares;
  const price = a.quote.price;
  if (shares && shares > 0) {
    const lpa = (ni / shares) * unit;
    set('lpa', lpa);
    if (isNum(y0.equity)) set('vpa', (y0.equity / shares) * unit);
    if (isNum(price)) {
      if (lpa > 0) set('pl', price / lpa);
      if (isNum(v.vpa) && v.vpa > 0) set('pvp', price / v.vpa);
      const mcap = (price / unit) * shares;
      if (isNum(v.fcf)) set('fcfYield', ((v.fcf * 1e6) / mcap) * 100);
      if (!isFin && netDebt !== null && ebitda !== null && ebitda > 0) set('evEbitda', (mcap + netDebt) / ebitda);
    }
  }
  const first = ys[Math.max(0, ys.length - 6)];
  if (first && first.year < y0.year) {
    const n = y0.year - first.year;
    if (!isFin) set('revenueGrowth', cagr(first.revenue, y0.revenue, n));
    set('earningsGrowth', cagr(first.netIncome, y0.netIncome, n));
  }
  return { values: v, year: y0.year, source: fin.source || 'CVM — DFP', dataBase: fin.dataBase || `${y0.year}-12-31`, notes };
}

export type FundSource = 'cvm' | 'manual';

/** Ativo com os fundamentos efetivos: CVM quando existe, senão o manual. Usado nos cálculos (não no formulário). */
export function withCvmFundamentals(a: Asset, market: MarketData): { asset: Asset; cvm: CvmFund | null; src: Partial<Record<keyof Fundamentals, FundSource>> } {
  const cvm = cvmFundamentals(a, market);
  const src: Partial<Record<keyof Fundamentals, FundSource>> = {};
  const f: Fundamentals = { ...(a.fundamentals || {}) };
  for (const k of Object.keys(f) as (keyof Fundamentals)[]) if (isNum(f[k] as number)) src[k] = 'manual';
  if (cvm) for (const [k, val] of Object.entries(cvm.values) as [FundKey, number][]) {
    (f as any)[k] = val;
    src[k] = 'cvm';
  }
  return { asset: cvm ? { ...a, fundamentals: f } : a, cvm, src };
}
