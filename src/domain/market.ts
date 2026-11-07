// Dados de mercado e demonstrações financeiras — separados do livro pessoal.
// Cada registro traz fonte, data-base e horário de coleta.
import type { CalendarItem } from './calc/proventos';

/** Ano fiscal (DFP/CVM, consolidado, em R$). */
export interface FinYear {
  year: number;
  revenue?: number | null;
  grossProfit?: number | null;
  ebit?: number | null;
  netIncome?: number | null;
  totalAssets?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  nonCurrentLiabilities?: number | null;
  equity?: number | null;
  retainedEarnings?: number | null;
  shortDebt?: number | null; // empréstimos e financiamentos de curto prazo
  longDebt?: number | null; // empréstimos e financiamentos de longo prazo
  cash?: number | null; // caixa + aplicações financeiras de curto prazo
  fco?: number | null; // fluxo de caixa operacional
  capex?: number | null; // aquisição de imobilizado e intangível (positivo)
  depreciation?: number | null;
  financialExpense?: number | null; // despesas financeiras (positivo)
  dividendsPaid?: number | null; // dividendos e JCP pagos (positivo)
  shares?: number | null; // ações em circulação
}

export interface CompanyFin {
  ticker: string;
  codeCVM: string | null;
  name: string;
  segment: string | null; // segmento de listagem (B3): NM, N2, N1, MA…
  financial: boolean; // banco/seguradora (demonstrações em outro plano de contas)
  unitShares?: number; // ações por unit (TAEE11 = 3)
  years: FinYear[];
  source: string;
  dataBase: string; // data de referência da última demonstração
  collectedAt: string;
}

export interface FiiInfo {
  ticker: string;
  cnpj: string;
  name: string;
  month: string; // data de referência do informe
  vpPerShare: number | null;
  holders: number | null;
  equity: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  adminFeeMonthPct: number | null;
  dyMonthPct: number | null;
  segment: string | null;
  mandate: string | null;
  manager: string | null;
  source: string;
  collectedAt: string;
}

export interface RiskStats {
  ticker: string;
  avgDailyVolume: number | null; // R$ por dia (média 21 pregões)
  volatility12m: number | null; // % a.a.
  high52: number | null;
  low52: number | null;
  maxDrawdown12m: number | null; // %
  priceChange12m: number | null; // %
  source: string;
  dataBase: string;
  collectedAt: string;
}

export interface MarketData {
  generatedAt: string | null;
  calendar: Record<string, CalendarItem[]>;
  companies: Record<string, CompanyFin>;
  fiis: Record<string, FiiInfo>;
  risk: Record<string, RiskStats>;
  monthEnd: Record<string, [string, number][]>; // fechamento de fim de mês
  series: { cdi?: [string, number][]; ipca?: [string, number][]; ntnb?: [string, number][] };
  ntnb: { rate: number; maturity: string; date: string; source: string } | null;
  segments: Record<string, string>;
  classification?: Record<string, { setor: string; subsetor: string | null; segmento: string | null; source: string }>;
  stockEvents: Record<string, { label: string; factor: number; dataCom: string | null; approvedOn: string | null; source: string; collectedAt: string }[]>;
  sources: Record<string, string>;
  errors: string[];
}

export const emptyMarket = (): MarketData => ({ generatedAt: null, calendar: {}, companies: {}, fiis: {}, risk: {}, monthEnd: {}, series: {}, ntnb: null, segments: {}, stockEvents: {}, sources: {}, errors: [] });
