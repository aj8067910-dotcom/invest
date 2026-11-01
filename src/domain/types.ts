// Tipos centrais do Radar de Investimentos.
// Convenção: todo percentual é armazenado em "pontos percentuais" (8 = 8%).

export type AssetClass = 'acao' | 'fii' | 'etf' | 'tesouro' | 'cripto';
export type AssetStatus = 'carteira' | 'watchlist';
export type FiiType = 'tijolo' | 'papel' | 'hibrido' | 'fof' | 'infra';
export type ThesisStatus = 'valida' | 'observacao' | 'deteriorada';
export type Currency = 'BRL' | 'USD';
export type DataKind = 'real' | 'manual' | 'estimativa';

export const CLASS_LABEL: Record<AssetClass, string> = {
  acao: 'Ações',
  fii: 'FIIs',
  tesouro: 'Tesouro Direto',
  etf: 'ETFs',
  cripto: 'Criptoativos',
};

export const CLASS_ORDER: AssetClass[] = ['acao', 'fii', 'tesouro', 'etf', 'cripto'];

export const FII_TYPE_LABEL: Record<FiiType, string> = {
  tijolo: 'Tijolo',
  papel: 'Papel',
  hibrido: 'Híbrido',
  fof: 'Fundo de Fundos',
  infra: 'Infra/Energia',
};

/** Classes em que o método Bazin (preço-teto por dividendos) se aplica. */
export const isBazinClass = (c: AssetClass) => c === 'acao' || c === 'fii';

export interface Quote {
  price: number | null;
  date: string | null; // ISO
  source: string | null;
  kind?: DataKind;
}

export type DistributionType = 'dividendo' | 'jcp' | 'rendimento' | 'amortizacao' | 'outro';

/** Provento anunciado POR UNIDADE (ação/cota). Não é o valor recebido pelo investidor. */
export interface Distribution {
  id: string;
  exDate: string; // data-com (último dia com direito) ISO yyyy-mm-dd
  payDate?: string | null;
  value: number; // R$ por unidade (bruto)
  type: DistributionType;
  recurring: boolean; // false = extraordinário, excluído da renda sustentável
  source: string;
}

export interface Fundamentals {
  // Ações
  roe?: number | null;
  roic?: number | null;
  netMargin?: number | null;
  ebitdaMargin?: number | null;
  pl?: number | null;
  pvp?: number | null;
  evEbitda?: number | null;
  netDebtEbitda?: number | null;
  payout?: number | null;
  fcf?: number | null; // R$ milhões (12m)
  fcfYield?: number | null; // %
  revenueGrowth?: number | null; // CAGR 5a %
  earningsGrowth?: number | null; // CAGR 5a %
  lpa?: number | null;
  vpa?: number | null;
  governance?: number | null; // 1 a 5
  moat?: number | null; // 1 a 5 vantagem competitiva
  sectorRisk?: number | null; // 1 (baixo) a 5 (alto)
  // FIIs
  vacFisica?: number | null;
  vacFinanceira?: number | null;
  inadimplencia?: number | null;
  propertyQuality?: number | null; // 1 a 5
  tenantDiversification?: number | null; // 1 a 5
  concentration?: number | null; // % da receita no maior ativo/devedor
  walt?: number | null; // prazo médio contratos (anos)
  management?: number | null; // 1 a 5
  leverage?: number | null; // % do PL
  distributionQuality?: number | null; // 1 a 5 recorrência
  updatedAt?: string | null;
  source?: string | null;
}

export interface FundSnapshot {
  date: string;
  data: Fundamentals;
}

export interface EtfInfo {
  index: string;
  geography: string;
  sectorFocus: string;
  fee: number | null; // % a.a.
  liquidity: number | null; // R$ mil/dia
  exposureTags: string[]; // usado para sobreposição entre ETFs
  overlapTickers: string[]; // ações locais contidas no índice (a validar)
  distributes: boolean;
}

export interface FixedIncomeInfo {
  indexer: 'IPCA+' | 'Selic' | 'Prefixado';
  maturity: string; // ISO
  contractedRate: number | null; // taxa contratada % a.a. (média)
  marketRate: number | null; // taxa atual de compra % a.a. (manual)
  marketRateDate: string | null;
  coupons: boolean;
}

export interface CryptoInfo {
  role: string;
  coingeckoId: string;
  custody: string;
}

export interface ValuationInputs {
  gordonK?: number | null; // custo de capital %
  gordonG?: number | null; // crescimento perpétuo dos dividendos %
  dcfFcfPerShare?: number | null;
  dcfGrowth?: number | null; // % a.a. anos 1-5
  dcfTerminalGrowth?: number | null;
  dcfDiscount?: number | null;
  dcfNetDebtPerShare?: number | null;
  plHist?: number | null;
  plSector?: number | null;
  pvpHist?: number | null;
}

export type EventType = 'fato_relevante' | 'comunicado' | 'resultado' | 'provento' | 'outro';
export interface CorporateEvent {
  id: string;
  date: string;
  type: EventType;
  title: string;
  url?: string;
  impact: 'positivo' | 'neutro' | 'negativo';
}

export interface Asset {
  id: string;
  ticker: string;
  name: string;
  class: AssetClass;
  status: AssetStatus;
  sector: string;
  issuer: string; // grupo econômico / emissor
  fiiType?: FiiType;
  fiiSegment?: string;
  currency: Currency;
  international: boolean;
  priority: number; // 1 (baixa) a 5 (alta) prioridade manual
  riskLevel: number; // 1 (baixo) a 5 (alto)
  thesis: string;
  thesisStatus: ThesisStatus;
  notes: string;
  quote: Quote;
  quoteHistory: { date: string; price: number }[];
  dyTarget: number | null; // null → padrão da classe
  next12mEstimate: number | null; // provento recorrente estimado p/ 12m (por unidade)
  useEstimate: boolean;
  distributions: Distribution[];
  annualPrices: Record<string, number>; // ano → preço médio (para DY histórico)
  fundamentals: Fundamentals;
  fundHistory: FundSnapshot[];
  valuation: ValuationInputs;
  etf?: EtfInfo;
  fixed?: FixedIncomeInfo;
  crypto?: CryptoInfo;
  events: CorporateEvent[];
  createdAt: string;
  updatedAt: string;
}

export type TxType =
  // negociação (ações, FIIs, ETFs, cripto e renda fixa)
  | 'compra'
  | 'venda'
  | 'saldo_inicial' // posição de abertura quando o histórico começa depois da 1ª compra
  // proventos
  | 'dividendo'
  | 'jcp'
  | 'rendimento'
  | 'juros'
  | 'amortizacao'
  | 'outro_provento'
  // dinheiro
  | 'aporte' // dinheiro novo externo
  | 'retirada'
  | 'reinvestimento' // reaplicação de proventos: NÃO é aporte externo
  // eventos corporativos
  | 'bonificacao'
  | 'desdobramento'
  | 'grupamento'
  | 'subscricao'
  | 'evento_outro'
  // transferências e ajustes
  | 'transferencia' // custódia entre corretoras: não altera quantidade nem custo
  | 'ajuste'; // correção de quantidade (vai para revisão)

export const TX_LABEL: Record<TxType, string> = {
  compra: 'Compra',
  venda: 'Venda',
  saldo_inicial: 'Saldo inicial',
  dividendo: 'Dividendo',
  jcp: 'JCP',
  rendimento: 'Rendimento FII',
  juros: 'Juros/Cupom',
  amortizacao: 'Amortização',
  outro_provento: 'Outro pagamento',
  aporte: 'Aporte (depósito)',
  retirada: 'Retirada',
  reinvestimento: 'Reinvestimento de proventos',
  bonificacao: 'Bonificação',
  desdobramento: 'Desdobramento',
  grupamento: 'Grupamento',
  subscricao: 'Subscrição',
  evento_outro: 'Outro evento',
  transferencia: 'Transferência de custódia',
  ajuste: 'Ajuste de quantidade',
};

/** Proventos que contam como renda passiva (amortização devolve capital e fica fora). */
export const INCOME_TX: TxType[] = ['dividendo', 'jcp', 'rendimento', 'juros', 'outro_provento'];
export const EVENT_TX: TxType[] = ['bonificacao', 'desdobramento', 'grupamento', 'subscricao', 'evento_outro'];

/** As oito abas da Central de Operações. */
export type OpCategory = 'acoes' | 'fiis' | 'etfs' | 'renda_fixa' | 'proventos' | 'aportes' | 'eventos' | 'transferencias';
export const OP_CATEGORY_LABEL: Record<OpCategory, string> = {
  acoes: 'Ações',
  fiis: 'Fundos Imobiliários',
  etfs: 'ETFs',
  renda_fixa: 'Renda Fixa',
  proventos: 'Proventos',
  aportes: 'Aportes',
  eventos: 'Eventos Corporativos',
  transferencias: 'Transferências e Ajustes',
};
export const OP_CATEGORIES: OpCategory[] = ['acoes', 'fiis', 'etfs', 'renda_fixa', 'proventos', 'aportes', 'eventos', 'transferencias'];

export type RfMovement = 'aplicacao' | 'resgate_parcial' | 'resgate_total' | 'vencimento';

export interface Transaction {
  id: string;
  date: string; // ISO yyyy-mm-dd — data original da operação
  type: TxType;
  category?: OpCategory;
  assetId?: string | null;
  ticker?: string | null;
  qty?: number | null;
  price?: number | null;
  fees?: number | null;
  gross?: number | null; // "Total": quantidade × preço, antes de taxas
  amount: number; // valor líquido que afeta a posição (compra = custo com taxas; venda = recebido; provento = líquido)
  reinvest?: boolean; // compra paga com proventos
  notes?: string;
  broker?: string | null; // corretora / instituição
  extId?: string | null; // identificador da operação informado pelo usuário
  declaredPosition?: number | null; // "Quantidade total" da planilha (conferência)
  // proventos
  exDate?: string | null;
  payDate?: string | null;
  perUnit?: number | null;
  // renda fixa
  rfMovement?: RfMovement | null;
  rate?: number | null;
  indexer?: string | null;
  maturity?: string | null;
  // eventos corporativos
  factor?: number | null;
  qtyBefore?: number | null;
  // aportes e transferências
  origin?: string | null;
  fromInstitution?: string | null;
  toInstitution?: string | null;
  destination?: string | null;
  // controle
  fingerprint?: string;
  importId?: string | null;
  review?: string | null; // motivo de revisão manual
  createdAt?: string;
  updatedAt?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: 'criar' | 'editar' | 'excluir' | 'importar' | 'reverter' | 'restaurar';
  txId?: string;
  importId?: string;
  summary: string;
  before?: Partial<Transaction> | null;
  after?: Partial<Transaction> | null;
}

export interface ImportBatch {
  id: string;
  at: string;
  fileName: string;
  fileHash: string;
  totalRows: number;
  toImport: number;
  imported: number;
  skippedDuplicates: number;
  excluded: number;
  pending: number;
  newAssets: string[];
  byCategory: Partial<Record<OpCategory, number>>;
  volume: number;
  status: 'em_andamento' | 'concluida' | 'interrompida' | 'revertida';
  finishedAt?: string | null;
  revertedAt?: string | null;
}

export type Criterion =
  | 'qualidade'
  | 'sustentabilidade'
  | 'dy'
  | 'preco'
  | 'margem'
  | 'crescimento'
  | 'endividamento'
  | 'payout'
  | 'caixa'
  | 'diversificacao'
  | 'setorial'
  | 'alocacao';

export const CRITERION_LABEL: Record<Criterion, string> = {
  qualidade: 'Qualidade dos fundamentos',
  sustentabilidade: 'Sustentabilidade dos dividendos',
  dy: 'Dividend Yield atual',
  preco: 'Preço vs preço-teto',
  margem: 'Margem de segurança',
  crescimento: 'Crescimento dos proventos',
  endividamento: 'Endividamento',
  payout: 'Payout',
  caixa: 'Geração de caixa',
  diversificacao: 'Diversificação',
  setorial: 'Exposição setorial',
  alocacao: 'Alocação estratégica',
};

export interface Bands {
  wait: number; // acima disto (% do teto) → aguardar
  maintenance: number; // entre maintenance e wait → manutenção
  opportunity: number; // entre opportunity e maintenance → oportunidade; abaixo → extrema
}

export interface ScenarioParams {
  dy: number;
  appreciation: number; // valorização nominal % a.a.
  inflation: number;
  contribGrowth: number; // crescimento anual do aporte %
  reinvest: number; // % dos proventos reinvestidos
  taxRate: number; // alíquota efetiva média sobre proventos %
  fee: number; // custos % a.a.
}

export type ScenarioKey = 'conservador' | 'moderado' | 'otimista';

export interface Settings {
  profile: {
    name: string;
    startDate: string;
    broker: string;
    risk: string;
    monthlyContribution: number;
    strategy: string;
  };
  targetAllocation: Record<AssetClass, number>;
  defaultDy: { acao: number; fii: number };
  dyScenarios: number[];
  bands: Bands;
  weights: Record<Criterion, number>;
  limits: {
    maxAssetPct: number;
    maxSectorPct: number;
    maxIssuerPct: number;
    maxFiiSegmentPct: number;
    maxInternationalPct: number;
    maxTopPayerPct: number;
  };
  thesisRules: {
    roeDropPts: number;
    marginDropPts: number;
    netDebtEbitdaMax: number;
    payoutMax: number;
    divDropPct: number;
    vacancyMax: number;
    delinquencyMax: number;
    fiiLeverageMax: number;
  };
  scoring: {
    minCoverage: number; // % mínimo de dados para classificar acima de monitoramento
    maxPriorityScore: number;
    highPriorityScore: number;
    monitorScore: number;
    goodRealRate: number; // Tesouro IPCA+: taxa real considerada atrativa
  };
  goals: number[];
  scenarios: Record<ScenarioKey, ScenarioParams>;
  allocator: {
    reserve: number;
    maxPerAsset: number;
    priorityClasses: AssetClass[];
    includeMaintenance: boolean;
    mode: 'auto' | 'concentrar' | 'distribuir';
    maxAssets: number;
  };
  integrations: {
    brapiToken: string;
  };
}

export interface Macro {
  key: string;
  label: string;
  value: number | null;
  date: string | null;
  source: string;
  fetchedAt: string | null;
}

export interface Snapshot {
  date: string; // yyyy-mm-dd
  value: number; // valor de mercado (ou custo quando sem cotação)
  invested: number;
}

export interface SyncLogEntry {
  at: string;
  source: string;
  ok: boolean;
  message: string;
}
