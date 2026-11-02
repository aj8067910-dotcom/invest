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
  // ── carteira e alocação
  targetWeight?: number | null; // peso-alvo do ativo na carteira (%)
  maxWeight?: number | null; // teto de participação do ativo na carteira (%); vazio = limite geral por ativo
  isReserve?: boolean; // reserva de emergência: fica fora da alocação
  exposure?: Exposure | null; // exposição econômica (pode diferir do veículo)
  // ── preço-teto
  dpaRef?: DpaRef | null; // DPA de referência deste ativo (null → padrão da classe)
  fiiTaxExempt?: boolean; // FII cumpre os requisitos de isenção (Lei 14.754/2023)
  // ── watchlist
  interestPrice?: number | null; // preço de interesse manual
  interestNote?: string | null;
  interestDate?: string | null;
  // ── tese e vigilância
  risks?: string;
  catalysts?: string;
  triggers?: { id: string; date: string; text: string }[];
  // ── indicadores manuais (sem fonte estruturada), cada um com fonte e data
  manual?: Record<string, ManualMetric>;
  // ── estado dos alertas (para avisar mudança de cor)
  alertState?: { at: string; levels: Record<string, 'verde' | 'amarelo' | 'vermelho'> } | null;
  alertChanges?: { at: string; key: string; from: string; to: string }[];
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
  | 'direito_subscricao' // direitos recebidos (custo zero; venda gera resultado)
  | 'troca_ticker' // mudança de código: posição e custo vão para o novo ativo
  | 'incorporacao' // ações do ativo de origem viram ações do ativo de destino (fator)
  | 'cisao' // parte do custo vai para o ativo cindido (percentual do custo)
  | 'leilao_fracao' // venda de frações em leilão: gera resultado realizado
  | 'evento_outro'
  // transferências e ajustes
  | 'transferencia' // custódia entre corretoras: não altera quantidade nem custo
  | 'ajuste' // correção de quantidade (vai para revisão)
  | 'estorno'; // anula um lançamento anterior (livro só de inclusão)

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
  direito_subscricao: 'Direitos de subscrição',
  troca_ticker: 'Troca de ticker',
  incorporacao: 'Incorporação',
  cisao: 'Cisão',
  leilao_fracao: 'Leilão de frações',
  evento_outro: 'Outro evento',
  transferencia: 'Transferência de custódia',
  ajuste: 'Ajuste de quantidade',
  estorno: 'Estorno',
};

/** Proventos que contam como renda passiva (amortização devolve capital e fica fora). */
export const INCOME_TX: TxType[] = ['dividendo', 'jcp', 'rendimento', 'juros', 'outro_provento'];
export const EVENT_TX: TxType[] = ['bonificacao', 'desdobramento', 'grupamento', 'subscricao', 'direito_subscricao', 'troca_ticker', 'incorporacao', 'cisao', 'leilao_fracao', 'evento_outro'];
/** Eventos que movem posição e custo de um ativo para outro. */
export const TRANSFER_EVENTS: TxType[] = ['troca_ticker', 'incorporacao', 'cisao'];

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
  // custos detalhados (somados em `fees`)
  corretagem?: number | null;
  emolumentos?: number | null;
  taxaLiquidacao?: number | null;
  source?: TxSource | null; // origem do lançamento
  // proventos: bruto, IR retido e líquido (= amount)
  ir?: number | null;
  auto?: boolean; // gerado pelo cálculo automático pela data-com
  autoKey?: string | null; // ativo|tipo|data-com|pagamento
  reliability?: 'confirmada' | 'estimada' | null;
  // eventos que movem posição entre ativos
  targetAssetId?: string | null;
  costShare?: number | null; // cisão: % do custo transferido
  // livro só de inclusão
  reversalOf?: string | null; // estorno: id do lançamento anulado
  correctionOf?: string | null; // novo lançamento que substitui um estornado
  reason?: string | null; // motivo do estorno/correção
  by?: string | null; // quem (aparelho)
  // controle
  fingerprint?: string;
  importId?: string | null;
  review?: string | null; // motivo de revisão manual
  createdAt?: string;
  updatedAt?: string;
}

export type TxSource = 'B3' | 'nota' | 'manual' | 'importacao' | 'automatico' | 'corretora';

export interface AuditEntry {
  id: string;
  at: string;
  action: 'criar' | 'editar' | 'excluir' | 'estornar' | 'corrigir' | 'importar' | 'reverter' | 'restaurar' | 'provento_auto' | 'conciliar' | 'migrar';
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

/** Régua por margem de segurança: margem = (teto − preço) ÷ teto. */
export interface Bands {
  margin: number; // % — Oportunidade a partir desta margem; Manutenção entre 0 e ela; Aguardar abaixo de 0
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

export type Exposure = 'acoes_br' | 'fii' | 'renda_fixa' | 'internacional' | 'cripto';
export const EXPOSURE_LABEL: Record<Exposure, string> = {
  acoes_br: 'Ações Brasil',
  fii: 'Imobiliário (FIIs)',
  renda_fixa: 'Renda fixa',
  internacional: 'Internacional',
  cripto: 'Cripto',
};
export type DpaRef = '12m' | '3a' | '5a' | 'ciclo';
export const DPA_REF_LABEL: Record<DpaRef, string> = { '12m': 'Últimos 12 meses', '3a': 'Média de 3 anos', '5a': 'Média de 5 anos', ciclo: 'Ciclo completo (todos os anos, mín. 5)' };

export interface ManualMetric {
  value: number | null;
  source: string;
  date: string;
}

/** Regras tributárias vigentes — todas editáveis, com a base legal declarada. */
export interface TaxRules {
  jcpRate: number; // IRRF sobre JCP (%)
  dividendMonthlyExempt: number; // R$ por empresa por mês
  dividendRateAbove: number; // % sobre o TOTAL do mês quando acima do limite
  fiiExemptDefault: boolean; // rendimento de FII isento por padrão (requisitos cumpridos)
  fiiRateIfNotExempt: number; // %
  stockSwingRate: number; // ganho de capital ações (%)
  stockSwingMonthlyExempt: number; // isenção por vendas no mês (R$)
  dayTradeRate: number;
  fiiGainRate: number;
  etfGainRate: number;
  cryptoGainRate: number;
  cryptoMonthlyExempt: number;
}

/** Limites da análise 360° (verde / amarelo / vermelho). */
export interface Limits360 {
  roeMin: number;
  netDebtEbitdaYellow: number;
  netDebtEbitdaRed: number;
  utilityNetDebtEbitdaYellow: number;
  utilityNetDebtEbitdaRed: number;
  interestCoverageYellow: number;
  interestCoverageRed: number;
  shortTermDebtPct: number; // % da dívida vencendo em 12 meses
  payoutYellow: number;
  payoutRed: number;
  fcfCoverageYellow: number;
  dyTrapRatio: number; // DY atual ÷ DY médio 5a
  fScoreMin: number;
  altmanSafe: number;
  altmanGrey: number;
  minDailyLiquidity: number; // R$ mil/dia
  fiiVacancyYellow: number;
  fiiVacancyRed: number;
  fiiDebtorConcentration: number;
  fiiMinHolders: number; // alerta perto do mínimo de cotistas para isenção
  fiiOverDistributionMonths: number;
  staleDays: number; // dado defasado
  commoditySectors: string[];
  utilitySectors: string[];
}

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
  tax: TaxRules;
  dpa: { acao: DpaRef; fii: DpaRef; commodity: DpaRef };
  bazinDy: number; // DY original de Bazin, exibido como referência
  limits360: Limits360;
  allocationBand: number; // banda de tolerância (± p.p.)
  theme: 'sistema' | 'claro' | 'escuro';
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
