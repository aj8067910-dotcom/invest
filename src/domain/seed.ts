// Cadastro inicial. Contém APENAS metadados (classe, setor, emissor, segmento).
// Cotações, proventos e indicadores começam vazios de propósito: devem vir de
// integração (brapi.dev, Banco Central, CoinGecko) ou de preenchimento manual.
import type { Asset, AssetClass, AssetStatus, Settings, FiiType, Macro } from './types';
import { uid } from './util';
import { defaultTaxRules } from './tax';
import type { Limits360 } from './types';

/** Limites padrão da análise 360°; cada um com fundamento em `analysis360.ts`. */
export function defaultLimits360(): Limits360 {
  return {
    roeMin: 10,
    netDebtEbitdaYellow: 3.0,
    netDebtEbitdaRed: 3.5,
    utilityNetDebtEbitdaYellow: 4.0,
    utilityNetDebtEbitdaRed: 4.5,
    interestCoverageYellow: 3,
    interestCoverageRed: 1.5,
    shortTermDebtPct: 30,
    payoutYellow: 100,
    payoutRed: 120,
    fcfCoverageYellow: 1.0,
    dyTrapRatio: 1.5,
    fScoreMin: 5,
    altmanSafe: 5.85,
    altmanGrey: 4.35,
    minDailyLiquidity: 1000,
    fiiVacancyYellow: 10,
    fiiVacancyRed: 20,
    fiiDebtorConcentration: 10,
    fiiMinHolders: 150,
    fiiOverDistributionMonths: 3,
    staleDays: 7,
    commoditySectors: ['Mineração', 'Petróleo e gás', 'Papel e celulose', 'Siderurgia'],
    utilitySectors: ['Energia elétrica', 'Saneamento'],
  };
}

const IBOV_NOTE = 'Composição a validar com a carteira teórica vigente do Ibovespa (B3).';

// Ações do universo cadastrado que fazem parte (ou cujo emissor faz parte) do Ibovespa.
// Lista editável na ficha do ETF.
const IBOV_OVERLAP = [
  'ITUB4', 'VALE3', 'ITSA4', 'BBDC4', 'BBSE3', 'TIMS3', 'AXIA3', 'KLBN4',
  'EGIE3', 'SBSP3', 'ABEV3', 'SUZB3', 'PETR4', 'CMIG4', 'TAEE11',
];

interface SeedDef {
  ticker: string;
  name: string;
  cls: AssetClass;
  status: AssetStatus;
  sector: string;
  issuer: string;
  fiiType?: FiiType;
  fiiSegment?: string;
  intl?: boolean;
  usd?: boolean;
  extra?: Partial<Asset>;
}

const defs: SeedDef[] = [
  // ── Carteira: ações
  { ticker: 'TIMS3', name: 'TIM S.A.', cls: 'acao', status: 'carteira', sector: 'Telecomunicações', issuer: 'TIM' },
  { ticker: 'AXIA3', name: 'Axia Energia (ex-Eletrobras)', cls: 'acao', status: 'carteira', sector: 'Energia elétrica', issuer: 'Axia Energia' },
  { ticker: 'BBSE3', name: 'BB Seguridade', cls: 'acao', status: 'carteira', sector: 'Financeiro', issuer: 'Banco do Brasil (grupo)' },
  { ticker: 'ITUB4', name: 'Itaú Unibanco', cls: 'acao', status: 'carteira', sector: 'Financeiro', issuer: 'Itaú Unibanco (grupo)' },
  { ticker: 'VALE3', name: 'Vale', cls: 'acao', status: 'carteira', sector: 'Mineração', issuer: 'Vale' },
  { ticker: 'POMO4', name: 'Marcopolo', cls: 'acao', status: 'carteira', sector: 'Bens industriais', issuer: 'Marcopolo' },
  { ticker: 'ITSA4', name: 'Itaúsa', cls: 'acao', status: 'carteira', sector: 'Financeiro', issuer: 'Itaú Unibanco (grupo)', extra: { notes: 'Holding com participação relevante no Itaú Unibanco: sobreposição com ITUB4.' } },
  { ticker: 'BBDC4', name: 'Bradesco', cls: 'acao', status: 'carteira', sector: 'Financeiro', issuer: 'Bradesco' },
  { ticker: 'KLBN4', name: 'Klabin', cls: 'acao', status: 'carteira', sector: 'Papel e celulose', issuer: 'Klabin' },
  // ── Carteira: FIIs
  { ticker: 'MXRF11', name: 'Maxi Renda FII', cls: 'fii', status: 'carteira', sector: 'Imob. Recebíveis', issuer: 'Maxi Renda FII', fiiType: 'papel', fiiSegment: 'Recebíveis (CRI) multiestratégia' },
  { ticker: 'HGLG11', name: 'Pátria Log (ex-CSHG Logística)', cls: 'fii', status: 'carteira', sector: 'Imob. Logística', issuer: 'HGLG11', fiiType: 'tijolo', fiiSegment: 'Logística' },
  { ticker: 'KNCR11', name: 'Kinea Rendimentos Imobiliários', cls: 'fii', status: 'carteira', sector: 'Imob. Recebíveis', issuer: 'KNCR11', fiiType: 'papel', fiiSegment: 'Recebíveis (CRI) high grade CDI' },
  { ticker: 'XPML11', name: 'XP Malls', cls: 'fii', status: 'carteira', sector: 'Imob. Shoppings', issuer: 'XPML11', fiiType: 'tijolo', fiiSegment: 'Shoppings' },
  { ticker: 'CPTS11', name: 'Capitânia Securities II', cls: 'fii', status: 'carteira', sector: 'Imob. Recebíveis', issuer: 'CPTS11', fiiType: 'papel', fiiSegment: 'Recebíveis (CRI) multiestratégia' },
  { ticker: 'SNEL11', name: 'Suno Energias Limpas', cls: 'fii', status: 'carteira', sector: 'Energia elétrica', issuer: 'SNEL11', fiiType: 'infra', fiiSegment: 'Energia renovável' },
  // ── Carteira: ETFs
  {
    ticker: 'BOVX11', name: 'ETF Ibovespa', cls: 'etf', status: 'carteira', sector: 'Índice amplo Brasil', issuer: 'BOVX11',
    extra: { etf: { index: 'Ibovespa', geography: 'Brasil', sectorFocus: 'Amplo (Brasil)', fee: null, liquidity: null, exposureTags: ['Brasil-Ibovespa'], overlapTickers: IBOV_OVERLAP, distributes: false }, notes: IBOV_NOTE },
  },
  {
    ticker: 'ACWI11', name: 'ETF MSCI ACWI', cls: 'etf', status: 'carteira', sector: 'Índice global', issuer: 'ACWI11', intl: true, usd: true,
    extra: { etf: { index: 'MSCI ACWI', geography: 'Global (desenvolvidos + emergentes)', sectorFocus: 'Amplo (global)', fee: null, liquidity: null, exposureTags: ['Global', 'EUA'], overlapTickers: [], distributes: false } },
  },
  // ── Carteira: cripto
  { ticker: 'BTC', name: 'Bitcoin', cls: 'cripto', status: 'carteira', sector: 'Cripto', issuer: 'Bitcoin', intl: true, usd: true, extra: { crypto: { role: 'Reserva de valor / diversificação', coingeckoId: 'bitcoin', custody: '' } } },
  { ticker: 'USDC', name: 'USD Coin (stablecoin)', cls: 'cripto', status: 'carteira', sector: 'Cripto', issuer: 'Circle', intl: true, usd: true, extra: { crypto: { role: 'Liquidez dolarizada', coingeckoId: 'usd-coin', custody: '' } } },
  // ── Carteira: Tesouro
  { ticker: 'IPCA2029', name: 'Tesouro IPCA+ 2029', cls: 'tesouro', status: 'carteira', sector: 'Título público', issuer: 'Tesouro Nacional', extra: { fixed: { indexer: 'IPCA+', maturity: '2029-05-15', contractedRate: null, marketRate: null, marketRateDate: null, coupons: false } } },
  { ticker: 'IPCA2032', name: 'Tesouro IPCA+ 2032', cls: 'tesouro', status: 'carteira', sector: 'Título público', issuer: 'Tesouro Nacional', extra: { fixed: { indexer: 'IPCA+', maturity: '2032-08-15', contractedRate: null, marketRate: null, marketRateDate: null, coupons: false } } },
  // ── Watchlist: ações
  { ticker: 'EGIE3', name: 'Engie Brasil Energia', cls: 'acao', status: 'watchlist', sector: 'Energia elétrica', issuer: 'Engie' },
  { ticker: 'SBSP3', name: 'Sabesp', cls: 'acao', status: 'watchlist', sector: 'Saneamento', issuer: 'Sabesp' },
  { ticker: 'ABEV3', name: 'Ambev', cls: 'acao', status: 'watchlist', sector: 'Bebidas', issuer: 'Ambev' },
  { ticker: 'SUZB3', name: 'Suzano', cls: 'acao', status: 'watchlist', sector: 'Papel e celulose', issuer: 'Suzano' },
  { ticker: 'PETR4', name: 'Petrobras', cls: 'acao', status: 'watchlist', sector: 'Petróleo e gás', issuer: 'Petrobras', extra: { notes: 'Estatal: risco de interferência na política de dividendos.' } },
  { ticker: 'CMIG4', name: 'Cemig', cls: 'acao', status: 'watchlist', sector: 'Energia elétrica', issuer: 'Cemig' },
  { ticker: 'ISAE4', name: 'ISA Energia Brasil', cls: 'acao', status: 'watchlist', sector: 'Energia elétrica', issuer: 'ISA Energia' },
  { ticker: 'TAEE11', name: 'Taesa', cls: 'acao', status: 'watchlist', sector: 'Energia elétrica', issuer: 'Taesa' },
  // ── Watchlist: FIIs
  { ticker: 'BTLG11', name: 'BTG Pactual Logística', cls: 'fii', status: 'watchlist', sector: 'Imob. Logística', issuer: 'BTLG11', fiiType: 'tijolo', fiiSegment: 'Logística' },
  { ticker: 'HGRU11', name: 'Pátria Renda Urbana', cls: 'fii', status: 'watchlist', sector: 'Imob. Renda urbana', issuer: 'HGRU11', fiiType: 'tijolo', fiiSegment: 'Renda urbana / varejo' },
  { ticker: 'KNRI11', name: 'Kinea Renda Imobiliária', cls: 'fii', status: 'watchlist', sector: 'Imob. Multissegmento', issuer: 'KNRI11', fiiType: 'tijolo', fiiSegment: 'Lajes + logística' },
  { ticker: 'PVBI11', name: 'VBI Prime Properties', cls: 'fii', status: 'watchlist', sector: 'Imob. Lajes corporativas', issuer: 'PVBI11', fiiType: 'tijolo', fiiSegment: 'Lajes corporativas' },
  { ticker: 'GARE11', name: 'Guardian Real Estate', cls: 'fii', status: 'watchlist', sector: 'Imob. Multissegmento', issuer: 'GARE11', fiiType: 'hibrido', fiiSegment: 'Varejo/logística + CRI' },
  // ── Watchlist: ETFs
  {
    ticker: 'IVVB11', name: 'ETF S&P 500', cls: 'etf', status: 'watchlist', sector: 'Índice EUA', issuer: 'IVVB11', intl: true, usd: true,
    extra: { etf: { index: 'S&P 500', geography: 'EUA', sectorFocus: 'Large caps EUA', fee: null, liquidity: null, exposureTags: ['EUA'], overlapTickers: [], distributes: false } },
  },
  {
    ticker: 'NASD11', name: 'ETF Nasdaq-100', cls: 'etf', status: 'watchlist', sector: 'Índice EUA', issuer: 'NASD11', intl: true, usd: true,
    extra: { etf: { index: 'Nasdaq-100', geography: 'EUA', sectorFocus: 'Tecnologia / growth EUA', fee: null, liquidity: null, exposureTags: ['EUA', 'Tecnologia EUA'], overlapTickers: [], distributes: false } },
  },
];

export function makeAsset(p: Partial<Asset> & Pick<Asset, 'ticker' | 'class'>): Asset {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name: p.ticker,
    status: 'watchlist',
    sector: '',
    issuer: p.ticker,
    currency: 'BRL',
    international: false,
    priority: 3,
    riskLevel: 3,
    thesis: '',
    thesisStatus: 'valida',
    notes: '',
    quote: { price: null, date: null, source: null },
    quoteHistory: [],
    dyTarget: null,
    next12mEstimate: null,
    useEstimate: false,
    distributions: [],
    annualPrices: {},
    fundamentals: {},
    fundHistory: [],
    valuation: {},
    events: [],
    createdAt: now,
    updatedAt: now,
    ...p,
  };
}

export function seedAssets(): Asset[] {
  return defs.map((d) =>
    makeAsset({
      ticker: d.ticker,
      name: d.name,
      class: d.cls,
      status: d.status,
      sector: d.sector,
      issuer: d.issuer,
      fiiType: d.fiiType,
      fiiSegment: d.fiiSegment,
      international: !!d.intl,
      currency: d.usd ? 'USD' : 'BRL',
      exposure: d.cls === 'acao' ? 'acoes_br' : d.cls === 'fii' ? 'fii' : d.cls === 'tesouro' ? 'renda_fixa' : d.cls === 'cripto' ? 'cripto' : d.intl ? 'internacional' : 'acoes_br',
      ...d.extra,
    }),
  );
}

export function defaultSettings(): Settings {
  return {
    profile: {
      name: 'Investidor',
      startDate: '2025-12-01',
      broker: 'Rico',
      risk: 'Moderado',
      monthlyContribution: 400,
      strategy: 'Buy and Hold com foco em dividendos (Bazin / Barsi)',
    },
    targetAllocation: { acao: 30, fii: 30, tesouro: 25, etf: 10, cripto: 5 },
    defaultDy: { acao: 8, fii: 8 }, // DY-alvo do investidor; o DY original de Bazin (6%) fica em bazinDy
    dyScenarios: [6, 8, 9, 10],
    bands: { margin: 15 },
    weights: {
      qualidade: 16,
      sustentabilidade: 16,
      dy: 6,
      preco: 10,
      margem: 8,
      crescimento: 8,
      endividamento: 7,
      payout: 5,
      caixa: 7,
      diversificacao: 5,
      setorial: 5,
      alocacao: 7,
    },
    limits: {
      maxAssetPct: 12,
      maxSectorPct: 25,
      maxIssuerPct: 15,
      maxFiiSegmentPct: 40,
      maxInternationalPct: 20,
      maxTopPayerPct: 20,
    },
    thesisRules: {
      roeDropPts: 5,
      marginDropPts: 5,
      netDebtEbitdaMax: 3.5,
      payoutMax: 100,
      divDropPct: 25,
      vacancyMax: 15,
      delinquencyMax: 5,
      fiiLeverageMax: 30,
    },
    scoring: {
      minCoverage: 50,
      maxPriorityScore: 75,
      highPriorityScore: 65,
      monitorScore: 50,
      goodRealRate: 6,
    },
    goals: [500, 1000, 2000, 3000, 5000, 10000],
    scenarios: {
      conservador: { dy: 6.5, appreciation: 3, inflation: 4.5, contribGrowth: 3, reinvest: 100, taxRate: 3, fee: 0.2 },
      moderado: { dy: 7.5, appreciation: 5, inflation: 4, contribGrowth: 5, reinvest: 100, taxRate: 3, fee: 0.2 },
      otimista: { dy: 8.5, appreciation: 7, inflation: 3.5, contribGrowth: 8, reinvest: 100, taxRate: 3, fee: 0.2 },
    },
    allocator: {
      reserve: 0,
      maxPerAsset: 400,
      priorityClasses: [],
      includeMaintenance: true,
      mode: 'auto',
      maxAssets: 3,
    },
    integrations: { brapiToken: '' },
    tax: defaultTaxRules(),
    dpa: { acao: '5a', fii: '12m', commodity: 'ciclo' },
    bazinDy: 6,
    limits360: defaultLimits360(),
    sell: defaultSellRules(),
    allocationBand: 5,
    theme: 'sistema',
  };
}

export function defaultMacro(): Macro[] {
  return [
    { key: 'selic', label: 'Selic meta', value: null, date: null, source: 'Banco Central (SGS 432)', fetchedAt: null },
    { key: 'ipca12', label: 'IPCA 12 meses', value: null, date: null, source: 'Banco Central (SGS 13522)', fetchedAt: null },
    { key: 'cdi', label: 'CDI anualizado', value: null, date: null, source: 'Banco Central (SGS 4389)', fetchedAt: null },
    { key: 'usd', label: 'Dólar PTAX venda', value: null, date: null, source: 'Banco Central (SGS 1)', fetchedAt: null },
  ];
}

export const defaultSellRules = (): import('./types').SellRules => ({ exitDy: 6, grahamPremium: 0, multiplesPct: 20, payoutMax: 100, payoutRising: 80, ndEbitdaMax: 3.5, ndEbitdaRise: 1, dividendCut: 20, minSignals: 2 });
