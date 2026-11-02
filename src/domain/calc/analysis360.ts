// Análise 360° de ativos (aprofunda a ficha existente).
// Cada indicador traz valor, status (verde / amarelo / vermelho), fonte, data-base e o fundamento
// ("por que isso importa"). Modelos estimados majoritariamente com dados dos EUA servem como
// TRIAGEM, não como previsão.
import { payout3y } from './cvmFundamentals';
import type { Asset, Settings } from '../types';
import type { CompanyFin, FinYear, FiiInfo, MarketData, RiskStats } from '../market';
import type { BazinResult } from './bazin';
import type { Position } from './positions';
import { isNum } from '../util';

export type Status = 'verde' | 'amarelo' | 'vermelho' | 'na' | 'sem_dado';

export const REFS = {
  bazin: 'Bazin (1992), "Faça Fortuna com Ações": comprar quando o DY ≥ 6% e a dívida não é excessiva.',
  afp: 'Asness, Frazzini e Pedersen (2019), "Quality minus junk", Review of Accounting Studies: pelo modelo de Gordon, o P/VP justo sobe com a rentabilidade e o payout.',
  novy: 'Novy-Marx (2013), "The other side of value", J. Financial Economics: lucro bruto ÷ ativos prevê retornos.',
  ff: 'Fama e French (2015), "A five-factor asset pricing model", JFE: fatores de rentabilidade (RMW) e investimento (CMA).',
  sloan: 'Sloan (1996), "Do stock prices fully reflect information in accruals and cash flows…", The Accounting Review: lucro sustentado por caixa é mais persistente.',
  piotroski: 'Piotroski (2000), "Value investing: the use of historical financial statement information…", J. Accounting Research; adaptação brasileira de Lopes e Galdi (2007).',
  altman: 'Altman e Hotchkiss, "Corporate Financial Distress and Bankruptcy": modelo Z″ para mercados emergentes. Não se aplica a bancos e seguradoras.',
  damodaran: 'Damodaran, tabela de rating sintético por cobertura de juros: exigir cobertura maior quando os juros locais são altos.',
  lintner: 'Lintner (1956), "Distribution of incomes of corporations…", American Economic Review: empresas suavizam dividendos e evitam cortes.',
  bmw: 'Baker, Mendel e Wurgler (2016), "Dividends as reference points", Review of Financial Studies: cortes de dividendo são punidos com mais força.',
  morningstar: 'Morningstar (estudos de dividendos): cortes são mais frequentes em empresas com payout elevado.',
  governance: 'Estudos de evento sobre migração para o Nível 2 e o Novo Mercado da B3 (ex.: Carvalho e Pennacchi, 2012): melhor governança reduz o custo de capital; sinal de emissão do F-Score.',
  qmj: 'Asness, Frazzini e Pedersen (2019): componente de segurança do Quality Minus Junk (baixa volatilidade e baixa alavancagem).',
  thesis: 'Disciplina de processo: tese, riscos e gatilhos registrados antes da compra reduzem decisões por viés (Kahneman, 2011).',
  fiiPvp: 'Em FIIs brasileiros a evidência de prêmio de valor por P/VP é fraca: P/VP é contexto, não sinal isolado.',
  fiiLaw: 'Lei 8.668/1993, art. 10: o FII distribui ao menos 95% do lucro apurado pelo regime de caixa, semestralmente.',
  fiiTax: 'Lei 8.668/1993, art. 3º (redação da Lei 14.754/2023): isenção para PF exige ≥ 100 cotistas.',
  cvmFii: 'Fonte primária: Informe Mensal Estruturado (CVM, Resolução 175/2022, Anexo III) e relatórios gerenciais.',
  bank: 'Bancos: avaliar ROE, Basileia (Resolução CMN 4.958/2021), eficiência e inadimplência; Dív./EBITDA, Altman e F-Score clássico não se aplicam.',
  insurer: 'Seguradoras: índice combinado e sinistralidade (SUSEP) medem a qualidade da subscrição.',
  utility: 'Elétricas e saneamento: receita regulada permite alavancagem maior; acompanhar concessão, revisão tarifária e RAP (ANEEL).',
  commodity: 'Commodities: o DPA de referência deve cobrir um ciclo completo (mínimo 5 anos).',
  holding: 'Holdings: comparar o valor de mercado com a soma das partes e evitar dupla exposição.',
} as const;

export interface Indicator {
  key: string;
  label: string;
  value: number | string | null;
  fmt: 'pct' | 'x' | 'brl' | 'num' | 'txt' | 'score';
  status: Status;
  why: string;
  note?: string;
  source?: string;
  date?: string | null;
  series?: { year: number; value: number | null }[];
}

export interface Block {
  key: string;
  title: string;
  items: Indicator[];
  status: Status; // pior status do bloco
}

export interface Analysis {
  kind: 'acao' | 'banco' | 'seguradora' | 'fii' | 'outro';
  blocks: Block[];
  reds: Indicator[];
  yellows: Indicator[];
  fScore: number | null;
  altman: number | null;
  dataNote: string;
}

const worst = (xs: Status[]): Status => (xs.includes('vermelho') ? 'vermelho' : xs.includes('amarelo') ? 'amarelo' : xs.includes('verde') ? 'verde' : xs.every((x) => x === 'na') ? 'na' : 'sem_dado');
const div = (a?: number | null, b?: number | null) => (isNum(a) && isNum(b) && b !== 0 ? a / b : null);
const avg = (a?: number | null, b?: number | null) => (isNum(a) && isNum(b) ? (a + b) / 2 : isNum(a) ? a : null);
const cagr = (first?: number | null, last?: number | null, n = 4) => (isNum(first) && isNum(last) && first > 0 && last > 0 && n > 0 ? (Math.pow(last / first, 1 / n) - 1) * 100 : null);
const ebitda = (y?: FinYear) => (y && isNum(y.ebit) ? y.ebit + (y.depreciation ?? 0) : null);
const debt = (y?: FinYear) => (y && (isNum(y.shortDebt) || isNum(y.longDebt)) ? (y.shortDebt ?? 0) + (y.longDebt ?? 0) : null);
const netDebt = (y?: FinYear) => { const g = debt(y); return g !== null ? g - (y!.cash ?? 0) : null; };
const totalLiab = (y?: FinYear) => (y && (isNum(y.currentLiabilities) || isNum(y.nonCurrentLiabilities)) ? (y.currentLiabilities ?? 0) + (y.nonCurrentLiabilities ?? 0) : null);

/** Piotroski F-Score: 9 sinais binários sobre o último ano vs o anterior. */
export function piotroski(cur: FinYear, prev: FinYear) {
  const roa = div(cur.netIncome, avg(cur.totalAssets, prev.totalAssets));
  const roaPrev = div(prev.netIncome, prev.totalAssets);
  const lev = div(cur.longDebt ?? 0, cur.totalAssets);
  const levPrev = div(prev.longDebt ?? 0, prev.totalAssets);
  const cr = div(cur.currentAssets, cur.currentLiabilities);
  const crPrev = div(prev.currentAssets, prev.currentLiabilities);
  const gm = div(cur.grossProfit, cur.revenue);
  const gmPrev = div(prev.grossProfit, prev.revenue);
  const at = div(cur.revenue, prev.totalAssets);
  const atPrev = div(prev.revenue, prev.totalAssets);
  const sig = (ok: boolean | null, label: string) => ({ label, ok });
  const signals = [
    sig(roa === null ? null : roa > 0, 'ROA > 0'),
    sig(isNum(cur.fco) ? cur.fco > 0 : null, 'FCO > 0'),
    sig(roa === null || roaPrev === null ? null : roa > roaPrev, 'ROA melhorou'),
    sig(isNum(cur.fco) && isNum(cur.netIncome) ? cur.fco > cur.netIncome : null, 'FCO > lucro (accruals negativos)'),
    sig(lev === null || levPrev === null ? null : lev < levPrev, 'Alavancagem de longo prazo caiu'),
    sig(cr === null || crPrev === null ? null : cr > crPrev, 'Liquidez corrente subiu'),
    sig(isNum(cur.shares) && isNum(prev.shares) ? cur.shares <= prev.shares : null, 'Não emitiu ações'),
    sig(gm === null || gmPrev === null ? null : gm > gmPrev, 'Margem bruta subiu'),
    sig(at === null || atPrev === null ? null : at > atPrev, 'Giro do ativo subiu'),
  ];
  const known = signals.filter((s) => s.ok !== null);
  return { score: known.length >= 7 ? signals.filter((s) => s.ok).length : null, signals, known: known.length };
}

/** Altman Z″ para mercados emergentes. */
export function altmanZEM(wcTa: number, reTa: number, ebitTa: number, eqTl: number) {
  return 3.25 + 6.56 * wcTa + 3.26 * reTa + 6.72 * ebitTa + 1.05 * eqTl;
}

export function analyze(a: Asset, s: Settings, market: MarketData, bz: BazinResult, pos: Position | undefined): Analysis {
  const L = s.limits360;
  const m = a.manual || {};
  const mv = (k: string) => (m[k] && isNum(m[k].value) ? (m[k].value as number) : null);
  const msrc = (k: string) => (m[k] ? `${m[k].source} (manual)` : undefined);
  const mdate = (k: string) => m[k]?.date ?? null;
  const fin: CompanyFin | undefined = market.companies[a.ticker];
  const fii: FiiInfo | undefined = market.fiis[a.ticker];
  const risk: RiskStats | undefined = market.risk[a.ticker];
  const isFin = /financ|banc|segur/i.test(a.sector) || !!fin?.financial;
  const insurer = /segur/i.test(a.sector) || /segurid|seguro/i.test(a.name);
  const utility = L.utilitySectors.includes(a.sector);
  const ys = (fin?.years || []).slice().sort((x, y) => x.year - y.year);
  const y0 = ys[ys.length - 1];
  const y1 = ys[ys.length - 2];
  const y4 = ys[ys.length - 5] || ys[0];
  const src = fin ? `${fin.source} · data-base ${fin.dataBase}` : undefined;
  const fdate = fin?.dataBase ?? null;
  const price = a.quote.price;
  const blocks: Block[] = [];
  const mk = (key: string, title: string, items: Indicator[]): Block => ({ key, title, items, status: worst(items.map((i) => i.status)) });
  const ind = (o: Partial<Indicator> & Pick<Indicator, 'key' | 'label' | 'value' | 'fmt' | 'why'>): Indicator => ({ status: o.value === null || o.value === undefined ? 'sem_dado' : 'verde', ...o });

  // ─────────── FIIs ───────────
  if (a.class === 'fii') {
    const pvp = fii && price && fii.vpPerShare ? price / fii.vpPerShare : (a.fundamentals.pvp ?? null);
    const spread = bz.dyCurrent !== null && market.ntnb ? bz.dyCurrent - market.ntnb.rate : null;
    const fsrc = fii ? `${fii.source} · ref. ${fii.month}` : undefined;
    blocks.push(mk('valuation', 'Valuation', [
      ind({ key: 'price', label: 'Cotação', value: price, fmt: 'brl', why: REFS.bazin, source: a.quote.source || undefined, date: a.quote.date }),
      ind({ key: 'pm', label: 'Preço médio da carteira', value: pos && pos.qty ? pos.avgPrice : null, fmt: 'brl', why: 'Custo médio calculado pelo livro de lançamentos.', status: pos?.qty ? 'verde' : 'na' }),
      ind({ key: 'pvp', label: 'P/VP', value: pvp, fmt: 'x', why: REFS.fiiPvp, source: fsrc || 'manual', date: fii?.month ?? a.fundamentals.updatedAt, note: 'contexto, não sinal isolado' }),
      ind({ key: 'dy', label: 'DY 12 meses (líquido)', value: bz.dyCurrent, fmt: 'pct', why: REFS.bazin }),
      ind({ key: 'spread', label: 'Spread do DY sobre a NTN-B', value: spread, fmt: 'pct', why: 'Prêmio exigido sobre o título público indexado à inflação (custo de oportunidade).', source: market.ntnb?.source, date: market.ntnb?.date, status: spread === null ? 'sem_dado' : 'verde', note: spread !== null && spread < 0 ? 'DY abaixo da NTN-B' : undefined }),
      ind({ key: 'teto', label: 'Preço-teto', value: bz.ceiling, fmt: 'brl', why: REFS.bazin }),
      ind({ key: 'margem', label: 'Margem de segurança', value: bz.margin, fmt: 'pct', why: REFS.bazin, status: bz.margin === null ? 'sem_dado' : bz.margin < 0 ? 'amarelo' : 'verde' }),
    ]));
    const over = mv('fiiMonthsOverDistributed');
    blocks.push(mk('resultado', 'Resultado e distribuição', [
      ind({ key: 'distResult', label: 'Rendimento distribuído ÷ resultado caixa', value: mv('fiiPayoutCash'), fmt: 'pct', why: REFS.fiiLaw, source: msrc('fiiPayoutCash'), date: mdate('fiiPayoutCash'), status: mv('fiiPayoutCash') === null ? 'sem_dado' : (mv('fiiPayoutCash') as number) > 100 ? 'amarelo' : 'verde' }),
      ind({ key: 'overDist', label: 'Meses seguidos distribuindo acima do resultado', value: over, fmt: 'num', why: REFS.fiiLaw, source: msrc('fiiMonthsOverDistributed'), date: mdate('fiiMonthsOverDistributed'), status: over === null ? 'sem_dado' : over >= L.fiiOverDistributionMonths ? 'amarelo' : 'verde' }),
      ind({ key: 'reserve', label: 'Reserva acumulada (R$/cota)', value: mv('fiiReservePerShare'), fmt: 'brl', why: REFS.fiiLaw, source: msrc('fiiReservePerShare'), date: mdate('fiiReservePerShare') }),
    ]));
    if (a.fiiType !== 'papel') {
      const vf = a.fundamentals.vacFinanceira ?? null;
      const vfi = a.fundamentals.vacFisica ?? null;
      const vac = (v: number | null): Status => (v === null ? 'sem_dado' : v > L.fiiVacancyRed ? 'vermelho' : v > L.fiiVacancyYellow ? 'amarelo' : 'verde');
      blocks.push(mk('tijolo', 'Imóveis (tijolo)', [
        ind({ key: 'vacFis', label: 'Vacância física', value: vfi, fmt: 'pct', why: 'Imóvel vago não gera renda e ainda tem custos.', status: vac(vfi), source: 'manual', date: a.fundamentals.updatedAt }),
        ind({ key: 'vacFin', label: 'Vacância financeira', value: vf, fmt: 'pct', why: 'Mede a perda de receita efetiva por vacância.', status: vac(vf), source: 'manual', date: a.fundamentals.updatedAt }),
        ind({ key: 'inad', label: 'Inadimplência', value: a.fundamentals.inadimplencia ?? null, fmt: 'pct', why: 'Aluguel não recebido reduz o resultado caixa.', status: a.fundamentals.inadimplencia == null ? 'sem_dado' : a.fundamentals.inadimplencia > s.thesisRules.delinquencyMax ? 'amarelo' : 'verde' }),
        ind({ key: 'conc', label: 'Concentração no maior inquilino/imóvel', value: a.fundamentals.concentration ?? null, fmt: 'pct', why: 'Dependência de um inquilino ou imóvel aumenta o risco de queda abrupta da renda.', status: a.fundamentals.concentration == null ? 'sem_dado' : 'verde' }),
        ind({ key: 'atip', label: 'Contratos atípicos (% da receita)', value: mv('fiiAtypical'), fmt: 'pct', why: 'Contratos atípicos (built-to-suit) dão previsibilidade; típicos sofrem revisionais.', source: msrc('fiiAtypical'), date: mdate('fiiAtypical'), status: mv('fiiAtypical') === null ? 'sem_dado' : 'verde' }),
        ind({ key: 'walt', label: 'Prazo médio remanescente dos contratos (anos)', value: a.fundamentals.walt ?? null, fmt: 'num', why: 'Contratos longos reduzem o risco de vacância e de revisão para baixo.', status: a.fundamentals.walt == null ? 'sem_dado' : 'verde' }),
      ]));
    }
    if (a.fiiType === 'papel' || a.fiiType === 'hibrido') {
      const devedor = mv('fiiDebtorConc');
      blocks.push(mk('papel', 'Recebíveis (papel)', [
        ind({ key: 'ltv', label: 'LTV médio', value: mv('fiiLtv'), fmt: 'pct', why: 'Quanto menor a dívida em relação à garantia, maior a recuperação em caso de calote.', source: msrc('fiiLtv'), date: mdate('fiiLtv'), status: mv('fiiLtv') === null ? 'sem_dado' : 'verde' }),
        ind({ key: 'hy', label: 'Parcela high yield', value: mv('fiiHighYield'), fmt: 'pct', why: 'Crédito high yield paga mais porque tem maior risco de inadimplência.', source: msrc('fiiHighYield'), date: mdate('fiiHighYield'), status: mv('fiiHighYield') === null ? 'sem_dado' : 'verde' }),
        ind({ key: 'devedor', label: 'Concentração no maior devedor', value: devedor, fmt: 'pct', why: 'Concentração por devedor eleva o impacto de um evento de crédito.', source: msrc('fiiDebtorConc'), date: mdate('fiiDebtorConc'), status: devedor === null ? 'sem_dado' : devedor > L.fiiDebtorConcentration ? 'amarelo' : 'verde' }),
        ind({ key: 'eventos', label: 'Eventos de crédito em 12 meses', value: mv('fiiCreditEvents'), fmt: 'num', why: 'Atrasos, renegociações e execução de garantias antecipam perda de renda.', source: msrc('fiiCreditEvents'), date: mdate('fiiCreditEvents'), status: mv('fiiCreditEvents') === null ? 'sem_dado' : 'verde' }),
      ]));
    }
    const holders = fii?.holders ?? null;
    const lev = fii && fii.equity ? ((fii.totalLiabilities ?? 0) / fii.equity) * 100 : (a.fundamentals.leverage ?? null);
    blocks.push(mk('estrutura', 'Estrutura do fundo', [
      ind({ key: 'admin', label: 'Taxa de administração (% a.a. do PL)', value: fii?.adminFeeMonthPct != null ? fii.adminFeeMonthPct * 12 * 100 : null, fmt: 'pct', why: 'Custos recorrentes reduzem o rendimento distribuível.', source: fsrc, date: fii?.month }),
      ind({ key: 'holders', label: 'Número de cotistas', value: holders, fmt: 'num', why: REFS.fiiTax, source: fsrc, date: fii?.month, status: holders === null ? 'sem_dado' : holders < L.fiiMinHolders ? 'amarelo' : 'verde', note: holders !== null && holders < L.fiiMinHolders ? 'perto do mínimo de 100 cotistas exigido para a isenção' : undefined }),
      ind({ key: 'liq', label: 'Liquidez média diária', value: risk?.avgDailyVolume ?? null, fmt: 'brl', why: REFS.qmj, source: risk?.source, date: risk?.dataBase, status: risk?.avgDailyVolume == null ? 'sem_dado' : risk.avgDailyVolume < L.minDailyLiquidity * 1000 ? 'amarelo' : 'verde' }),
      ind({ key: 'alav', label: 'Alavancagem (passivo ÷ PL)', value: lev, fmt: 'pct', why: 'Dívida do fundo concorre com o rendimento do cotista.', source: fsrc, date: fii?.month, status: lev === null ? 'sem_dado' : 'verde', note: lev !== null && lev > s.thesisRules.fiiLeverageMax ? `acima de ${s.thesisRules.fiiLeverageMax}% (gatilho de tese)` : undefined }),
      ind({ key: 'emissao', label: 'Emissões abaixo do VP em 5 anos', value: mv('fiiDilutiveIssues'), fmt: 'num', why: 'Emitir cotas abaixo do valor patrimonial dilui o cotista atual.', source: msrc('fiiDilutiveIssues'), date: mdate('fiiDilutiveIssues'), status: mv('fiiDilutiveIssues') === null ? 'sem_dado' : 'verde' }),
      ind({ key: 'gestor', label: 'Administrador', value: fii?.manager ?? null, fmt: 'txt', why: 'Qualidade e histórico da gestão.', source: fsrc, date: fii?.month, status: fii?.manager ? 'verde' : 'sem_dado' }),
    ]));
    blocks.push(thesisBlock(a));
    return finish('fii', blocks, null, null, fii ? `Informe mensal CVM de ${fii.month}` : 'Sem informe mensal da CVM para este fundo; usando dados manuais.');
  }

  if (a.class !== 'acao') return { kind: 'outro', blocks: [thesisBlock(a)], reds: [], yellows: [], fScore: null, altman: null, dataNote: 'ETFs, Tesouro e cripto: avaliados por alocação (sem análise fundamentalista de empresa).' };

  // ─────────── Ações ───────────
  // units (ex.: TAEE11 = 3 ações): lucro e VP por UNIT
  const shares = y0?.shares ? y0.shares / (fin?.unitShares || 1) : null;
  const eps = y0 && shares ? div(y0.netIncome, shares) : (a.fundamentals.lpa ?? null);
  const bvps = y0 && shares ? div(y0.equity, shares) : (a.fundamentals.vpa ?? null);
  const mcap = price && shares ? price * shares : null;
  const ev = mcap !== null && netDebt(y0) !== null ? mcap + (netDebt(y0) as number) : null;
  const roe = y0 ? div(y0.netIncome, avg(y0.equity, y1?.equity)) : null;
  const roePct = roe !== null ? roe * 100 : (a.fundamentals.roe ?? null);
  const payoutPct = payout3y(ys) ?? (a.fundamentals.payout ?? null);
  const k = a.valuation?.gordonK ?? null;
  const g = roe !== null && payoutPct !== null ? roe * (1 - payoutPct / 100) : null;
  const fairPvp = roe !== null && k && g !== null && k / 100 > g ? (roe - g) / (k / 100 - g) : null;
  blocks.push(mk('valuation', 'Valuation', [
    ind({ key: 'price', label: 'Cotação', value: price, fmt: 'brl', why: REFS.bazin, source: a.quote.source || undefined, date: a.quote.date }),
    ind({ key: 'pm', label: 'Preço médio da carteira', value: pos && pos.qty ? pos.avgPrice : null, fmt: 'brl', why: 'Custo médio calculado pelo livro de lançamentos.', status: pos?.qty ? 'verde' : 'na' }),
    ind({ key: 'pl', label: 'P/L', value: price && eps ? price / eps : (a.fundamentals.pl ?? null), fmt: 'x', why: REFS.bazin, source: src || 'manual', date: fdate }),
    ind({ key: 'pvp', label: 'P/VP', value: price && bvps ? price / bvps : (a.fundamentals.pvp ?? null), fmt: 'x', why: REFS.afp, source: src || 'manual', date: fdate }),
    ind({ key: 'pvpFair', label: 'P/VP justificado (Gordon, k informado)', value: fairPvp, fmt: 'x', why: REFS.afp, note: k ? `k = ${k}%; g = ROE × (1 − payout)` : 'informe o custo de capital (k) na aba Valuation', status: fairPvp === null ? 'sem_dado' : 'verde' }),
    ind({ key: 'evEbitda', label: 'EV/EBITDA', value: ev !== null && ebitda(y0) ? ev / (ebitda(y0) as number) : (a.fundamentals.evEbitda ?? null), fmt: 'x', why: REFS.bazin, source: src || 'manual', date: fdate }),
    ind({ key: 'dy', label: 'DY 12 meses (líquido)', value: bz.dyCurrent, fmt: 'pct', why: REFS.bazin, status: bz.dyCurrent === null ? 'sem_dado' : bz.dyCurrent < s.bazinDy ? 'amarelo' : 'verde' }),
    ind({ key: 'teto', label: 'Preço-teto', value: bz.ceiling, fmt: 'brl', why: REFS.bazin }),
    ind({ key: 'oport', label: 'Preço de oportunidade', value: bz.opportunityPrice, fmt: 'brl', why: REFS.bazin }),
    ind({ key: 'margem', label: 'Margem de segurança', value: bz.margin, fmt: 'pct', why: REFS.bazin, status: bz.margin === null ? 'sem_dado' : bz.margin < 0 ? 'amarelo' : 'verde' }),
  ]));

  if (isFin) {
    const kind = insurer ? 'seguradora' : 'banco';
    const items: Indicator[] = [ind({ key: 'roe', label: 'ROE', value: roePct, fmt: 'pct', why: REFS.ff, source: src || 'manual', date: fdate, status: roePct === null ? 'sem_dado' : roePct < L.roeMin ? 'amarelo' : 'verde' })];
    if (kind === 'banco') {
      const bas = mv('basel'), ef = mv('efficiency'), npl = mv('npl90'), cov = mv('provisionCoverage');
      items.push(
        ind({ key: 'basel', label: 'Índice de Basileia', value: bas, fmt: 'pct', why: REFS.bank, source: msrc('basel'), date: mdate('basel'), status: bas === null ? 'sem_dado' : bas < 10.5 ? 'vermelho' : 'verde', note: 'mínimo regulatório com colchão de conservação: 10,5%' }),
        ind({ key: 'eff', label: 'Índice de eficiência', value: ef, fmt: 'pct', why: REFS.bank, source: msrc('efficiency'), date: mdate('efficiency'), status: ef === null ? 'sem_dado' : 'verde', note: 'quanto menor, melhor' }),
        ind({ key: 'npl', label: 'Inadimplência acima de 90 dias', value: npl, fmt: 'pct', why: REFS.bank, source: msrc('npl90'), date: mdate('npl90'), status: npl === null ? 'sem_dado' : 'verde' }),
        ind({ key: 'cov', label: 'Cobertura de provisões', value: cov, fmt: 'pct', why: REFS.bank, source: msrc('provisionCoverage'), date: mdate('provisionCoverage'), status: cov === null ? 'sem_dado' : 'verde' }),
      );
    } else {
      const comb = mv('combinedRatio'), sin = mv('lossRatio');
      items.push(
        ind({ key: 'comb', label: 'Índice combinado', value: comb, fmt: 'pct', why: REFS.insurer, source: msrc('combinedRatio'), date: mdate('combinedRatio'), status: comb === null ? 'sem_dado' : comb > 100 ? 'vermelho' : 'verde', note: 'acima de 100% a operação de seguros dá prejuízo' }),
        ind({ key: 'sin', label: 'Sinistralidade', value: sin, fmt: 'pct', why: REFS.insurer, source: msrc('lossRatio'), date: mdate('lossRatio') }),
        ind({ key: 'finres', label: 'Resultado financeiro (% do lucro)', value: mv('financialResultShare'), fmt: 'pct', why: REFS.insurer, source: msrc('financialResultShare'), date: mdate('financialResultShare') }),
      );
    }
    blocks.push(mk('rentabilidade', kind === 'banco' ? 'Banco: rentabilidade e solidez' : 'Seguradora: rentabilidade e subscrição', items));
    blocks.push(sustainBlock(a, s, y0, payoutPct, null));
    blocks.push(governanceBlock(a, fin, market, ys));
    blocks.push(riskBlock(risk, L));
    blocks.push(thesisBlock(a));
    return finish(kind, blocks, null, null, fin ? `DFP/CVM ${fin.dataBase}` : 'Sem demonstrações da CVM: use os indicadores manuais.');
  }

  // Rentabilidade
  const series = (f: (y: FinYear, prev?: FinYear) => number | null) => ys.slice(-5).map((y) => ({ year: y.year, value: f(y, ys[ys.indexOf(y) - 1]) }));
  const roic = y0 && isNum(y0.ebit) && isNum(y0.equity) ? (y0.ebit * 0.66) / (y0.equity + Math.max(0, netDebt(y0) ?? 0)) * 100 : (a.fundamentals.roic ?? null);
  blocks.push(mk('rentabilidade', 'Rentabilidade', [
    ind({ key: 'roe', label: 'ROE', value: roePct, fmt: 'pct', why: REFS.ff, source: src || 'manual', date: fdate, status: roePct === null ? 'sem_dado' : roePct < L.roeMin ? 'amarelo' : 'verde', series: series((y, p) => { const r = div(y.netIncome, avg(y.equity, p?.equity)); return r !== null ? r * 100 : null; }) }),
    ind({ key: 'roic', label: 'ROIC (EBIT × 66% ÷ capital investido)', value: roic, fmt: 'pct', why: REFS.ff, source: src || 'manual', date: fdate, note: 'alíquota de IR/CSLL de 34% sobre o EBIT' }),
    ind({ key: 'mbruta', label: 'Margem bruta', value: y0 ? pctOf(y0.grossProfit, y0.revenue) : null, fmt: 'pct', why: REFS.novy, source: src, date: fdate, series: series((y) => pctOf(y.grossProfit, y.revenue)) }),
    ind({ key: 'mebit', label: 'Margem EBIT', value: y0 ? pctOf(y0.ebit, y0.revenue) : null, fmt: 'pct', why: REFS.ff, source: src, date: fdate, series: series((y) => pctOf(y.ebit, y.revenue)) }),
    ind({ key: 'mliq', label: 'Margem líquida', value: y0 ? pctOf(y0.netIncome, y0.revenue) : (a.fundamentals.netMargin ?? null), fmt: 'pct', why: REFS.ff, source: src || 'manual', date: fdate, series: series((y) => pctOf(y.netIncome, y.revenue)) }),
    ind({ key: 'gpa', label: 'Lucro bruto ÷ ativos', value: y0 ? pctOf(y0.grossProfit, y0.totalAssets) : null, fmt: 'pct', why: REFS.novy, source: src, date: fdate }),
  ]));

  // Qualidade do lucro
  const fcoNi = (y?: FinYear) => (y && isNum(y.fco) && isNum(y.netIncome) && y.netIncome !== 0 ? y.fco / y.netIncome : null);
  const twoBad = y0 && y1 && isNum(y0.fco) && isNum(y0.netIncome) && isNum(y1.fco) && isNum(y1.netIncome) && y0.fco < y0.netIncome && y1.fco < y1.netIncome;
  blocks.push(mk('qualidade', 'Qualidade do lucro', [
    ind({ key: 'fcoNi', label: 'FCO ÷ lucro líquido', value: fcoNi(y0), fmt: 'x', why: REFS.sloan, source: src, date: fdate, status: fcoNi(y0) === null ? 'sem_dado' : twoBad ? 'amarelo' : 'verde', note: twoBad ? 'FCO abaixo do lucro por 2 anos seguidos' : undefined, series: series((y) => fcoNi(y)) }),
    ind({ key: 'accruals', label: 'Accruals ((lucro − FCO) ÷ ativo)', value: y0 && isNum(y0.netIncome) && isNum(y0.fco) && y0.totalAssets ? ((y0.netIncome - y0.fco) / y0.totalAssets) * 100 : null, fmt: 'pct', why: REFS.sloan, source: src, date: fdate }),
  ]));

  // Saúde financeira composta
  const pz = y0 && y1 ? piotroski(y0, y1) : null;
  let z: number | null = null;
  if (y0 && y0.totalAssets && isNum(y0.currentAssets) && isNum(y0.currentLiabilities) && isNum(y0.ebit) && isNum(y0.equity) && totalLiab(y0)) {
    z = altmanZEM((y0.currentAssets - y0.currentLiabilities) / y0.totalAssets, (y0.retainedEarnings ?? 0) / y0.totalAssets, y0.ebit / y0.totalAssets, y0.equity / (totalLiab(y0) as number));
  }
  blocks.push(mk('saude', 'Saúde financeira composta', [
    ind({ key: 'fscore', label: 'Piotroski F-Score', value: pz?.score ?? null, fmt: 'score', why: REFS.piotroski, source: src, date: fdate, status: pz?.score == null ? 'sem_dado' : pz.score <= 3 ? 'vermelho' : pz.score < L.fScoreMin ? 'amarelo' : 'verde', note: pz ? pz.signals.map((x) => `${x.ok === null ? '·' : x.ok ? '✓' : '✗'} ${x.label}`).join(' | ') : undefined }),
    ind({ key: 'altman', label: 'Altman Z″ (emergentes)', value: z, fmt: 'num', why: REFS.altman, source: src, date: fdate, status: z === null ? 'sem_dado' : z < L.altmanGrey ? 'vermelho' : z <= L.altmanSafe ? 'amarelo' : 'verde', note: z === null ? undefined : z > L.altmanSafe ? 'zona segura' : z >= L.altmanGrey ? 'zona cinzenta' : 'zona de alerta' }),
  ]));

  // Endividamento
  const ndE = y0 && netDebt(y0) !== null && ebitda(y0) ? (netDebt(y0) as number) / (ebitda(y0) as number) : (a.fundamentals.netDebtEbitda ?? null);
  const yel = utility ? L.utilityNetDebtEbitdaYellow : L.netDebtEbitdaYellow;
  const red = utility ? L.utilityNetDebtEbitdaRed : L.netDebtEbitdaRed;
  const cover = y0 && isNum(y0.ebit) && y0.financialExpense ? y0.ebit / y0.financialExpense : null;
  blocks.push(mk('endividamento', 'Endividamento', [
    ind({ key: 'ndEbitda', label: 'Dív. Líq./EBITDA', value: ndE, fmt: 'x', why: REFS.bazin + (utility ? ' ' + REFS.utility : ''), source: src || 'manual', date: fdate, status: ndE === null ? 'sem_dado' : ndE > red ? 'vermelho' : ndE > yel ? 'amarelo' : 'verde', note: ndE !== null && ndE > red ? `endividamento acima de ${red.toLocaleString('pt-BR')}x` : undefined }),
    ind({ key: 'dbpl', label: 'Dív. Bruta/PL', value: y0 && debt(y0) !== null && y0.equity ? (debt(y0) as number) / y0.equity : null, fmt: 'x', why: REFS.qmj, source: src, date: fdate }),
    ind({ key: 'cover', label: 'Cobertura de juros (EBIT ÷ despesa financeira)', value: cover, fmt: 'x', why: REFS.damodaran, source: src, date: fdate, status: cover === null ? 'sem_dado' : cover < L.interestCoverageRed ? 'vermelho' : cover < L.interestCoverageYellow ? 'amarelo' : 'verde' }),
    ind({ key: 'lc', label: 'Liquidez corrente', value: y0 ? div(y0.currentAssets, y0.currentLiabilities) : null, fmt: 'x', why: REFS.piotroski, source: src, date: fdate }),
  ]));

  // Perfil da dívida
  const stShare = y0 && debt(y0) ? ((y0.shortDebt ?? 0) / (debt(y0) as number)) * 100 : null;
  const stRisk = stShare !== null && stShare > L.shortTermDebtPct && (y0!.cash ?? 0) < (y0!.shortDebt ?? 0);
  blocks.push(mk('perfil', 'Perfil da dívida', [
    ind({ key: 'st', label: 'Dívida vencendo em 12 meses', value: stShare, fmt: 'pct', why: REFS.damodaran, source: src, date: fdate, status: stShare === null ? 'sem_dado' : stRisk ? 'amarelo' : 'verde', note: stRisk ? 'acima do limite e sem caixa equivalente' : undefined }),
    ind({ key: 'prazo', label: 'Prazo médio (anos)', value: mv('debtDuration'), fmt: 'num', why: REFS.damodaran, source: msrc('debtDuration'), date: mdate('debtDuration') }),
    ind({ key: 'custo', label: 'Custo médio (% a.a.)', value: mv('debtCost'), fmt: 'pct', why: REFS.damodaran, source: msrc('debtCost'), date: mdate('debtCost') }),
    ind({ key: 'fx', label: 'Parcela em moeda estrangeira', value: mv('debtFx'), fmt: 'pct', why: REFS.damodaran, source: msrc('debtFx'), date: mdate('debtFx') }),
    ind({ key: 'cdi', label: 'Parcela indexada ao CDI', value: mv('debtCdi'), fmt: 'pct', why: REFS.damodaran, source: msrc('debtCdi'), date: mdate('debtCdi') }),
  ]));

  // Crescimento e investimento
  const n = y0 && y4 ? y0.year - y4.year : 0;
  const assetG = y0 && y4 ? cagr(y4.totalAssets, y0.totalAssets, n) : null;
  const niG = y0 && y4 ? cagr(y4.netIncome, y0.netIncome, n) : null;
  const dpaYears = annualDpa(a);
  const dpaG = dpaYears.length >= 2 ? cagr(dpaYears[Math.max(0, dpaYears.length - 6)][1], dpaYears[dpaYears.length - 1][1], dpaYears[dpaYears.length - 1][0] - dpaYears[Math.max(0, dpaYears.length - 6)][0]) : null;
  const overInvest = assetG !== null && (niG === null || assetG - niG > 10);
  blocks.push(mk('crescimento', 'Crescimento e investimento', [
    ind({ key: 'gRec', label: `Receita (CAGR ${n || '—'} anos)`, value: y0 && y4 ? cagr(y4.revenue, y0.revenue, n) : (a.fundamentals.revenueGrowth ?? null), fmt: 'pct', why: REFS.ff, source: src || 'manual', date: fdate }),
    ind({ key: 'gEbitda', label: 'EBITDA (CAGR)', value: y0 && y4 ? cagr(ebitda(y4), ebitda(y0), n) : null, fmt: 'pct', why: REFS.ff, source: src, date: fdate }),
    ind({ key: 'gLucro', label: 'Lucro (CAGR)', value: niG ?? (a.fundamentals.earningsGrowth ?? null), fmt: 'pct', why: REFS.ff, source: src || 'manual', date: fdate }),
    ind({ key: 'gDpa', label: 'DPA (CAGR)', value: dpaG, fmt: 'pct', why: REFS.lintner, source: 'proventos por unidade' }),
    ind({ key: 'capex', label: 'Capex ÷ depreciação', value: y0 ? div(y0.capex, y0.depreciation) : null, fmt: 'x', why: REFS.ff, source: src, date: fdate }),
    ind({ key: 'gAtivo', label: 'Ativo total (CAGR)', value: assetG, fmt: 'pct', why: REFS.ff, source: src, date: fdate, status: assetG === null ? 'sem_dado' : overInvest ? 'amarelo' : 'verde', note: overInvest ? 'ativo crescendo bem acima do lucro (fator CMA)' : undefined }),
  ]));

  blocks.push(sustainBlock(a, s, y0, payoutPct, dpaYears));

  // Armadilha de DY
  const dy5 = avgDy5(a);
  const trapRatio = bz.dyCurrent !== null && dy5 ? bz.dyCurrent / dy5 : null;
  const niFalling = y0 && y1 && isNum(y0.netIncome) && isNum(y1.netIncome) ? y0.netIncome < y1.netIncome : null;
  blocks.push(mk('armadilha', 'Armadilha de DY', [
    ind({ key: 'trap', label: 'DY atual ÷ DY médio 5 anos', value: trapRatio, fmt: 'x', why: REFS.bmw, status: trapRatio === null ? 'sem_dado' : trapRatio >= L.dyTrapRatio && niFalling ? 'amarelo' : 'verde', note: trapRatio !== null && trapRatio >= L.dyTrapRatio && niFalling ? 'DY bem acima da média com lucro em queda: possível armadilha' : undefined }),
    ind({ key: 'chg12', label: 'Variação do preço em 12 meses', value: risk?.priceChange12m ?? null, fmt: 'pct', why: REFS.bmw, source: risk?.source, date: risk?.dataBase }),
  ]));
  blocks.push(governanceBlock(a, fin, market, ys));
  blocks.push(riskBlock(risk, L));

  // Ajustes setoriais
  const sect: Indicator[] = [];
  if (utility) {
    sect.push(
      ind({ key: 'concessao', label: 'Prazo restante das concessões (anos)', value: mv('concessionYears'), fmt: 'num', why: REFS.utility, source: msrc('concessionYears'), date: mdate('concessionYears'), status: mv('concessionYears') === null ? 'sem_dado' : 'verde' }),
      ind({ key: 'rap', label: 'RAP / receita regulada anual (R$ mi)', value: mv('rap'), fmt: 'num', why: REFS.utility, source: msrc('rap'), date: mdate('rap') }),
      ind({ key: 'revisao', label: 'Próxima revisão tarifária (ano)', value: mv('tariffReview'), fmt: 'num', why: REFS.utility, source: msrc('tariffReview'), date: mdate('tariffReview') }),
    );
  }
  if (L.commoditySectors.includes(a.sector)) sect.push(ind({ key: 'ciclo', label: 'DPA de referência', value: bz.base.label, fmt: 'txt', why: REFS.commodity, note: bz.dpaNote || undefined, status: 'verde' }));
  if (/holding/i.test(a.sector) || /itaúsa|itausa|holding/i.test(a.name))
    sect.push(ind({ key: 'desconto', label: 'Desconto sobre a soma das partes', value: mv('holdingDiscount'), fmt: 'pct', why: REFS.holding, source: msrc('holdingDiscount'), date: mdate('holdingDiscount') }));
  if (sect.length) blocks.push(mk('setor', 'Ajustes setoriais', sect));
  blocks.push(thesisBlock(a));
  return finish('acao', blocks, pz?.score ?? null, z, fin ? `DFP/CVM (consolidado) até ${fin.dataBase}` : 'Sem demonstrações da CVM coletadas: indicadores manuais quando preenchidos.');
}

const pctOf = (a?: number | null, b?: number | null) => (isNum(a) && isNum(b) && b !== 0 ? (a / b) * 100 : null);

function annualDpa(a: Asset): [number, number][] {
  const cur = new Date().getFullYear();
  const map = new Map<number, number>();
  for (const d of a.distributions) if (d.recurring && d.type !== 'amortizacao') map.set(Number(d.exDate.slice(0, 4)), (map.get(Number(d.exDate.slice(0, 4))) || 0) + d.value);
  return [...map.entries()].filter(([y]) => y < cur).sort((x, y) => x[0] - y[0]);
}

function avgDy5(a: Asset): number | null {
  const years = annualDpa(a).slice(-5);
  const dys = years.map(([y, v]) => (a.annualPrices?.[String(y)] ? (v / a.annualPrices[String(y)]) * 100 : null)).filter(isNum);
  return dys.length >= 3 ? dys.reduce((x, y) => x + y, 0) / dys.length : null;
}

function sustainBlock(a: Asset, s: Settings, y0: FinYear | undefined, payoutPct: number | null, dpaYears: [number, number][] | null): Block {
  const L = s.limits360;
  const years = dpaYears || annualDpa(a);
  let streak = 0;
  for (let i = years.length - 1; i > 0; i--) {
    if (years[i][1] >= years[i - 1][1] * 0.999 && years[i][0] === years[i - 1][0] + 1) streak++;
    else break;
  }
  const growth = years.slice(1).map((y, i) => (years[i][1] > 0 ? y[1] / years[i][1] - 1 : 0));
  const mean = growth.length ? growth.reduce((x, y) => x + y, 0) / growth.length : 0;
  const vol = growth.length >= 3 ? Math.sqrt(growth.reduce((x, y) => x + (y - mean) ** 2, 0) / (growth.length - 1)) * 100 : null;
  const fcf = y0 && isNum(y0.fco) ? y0.fco - (y0.capex ?? 0) : null;
  const cover = fcf !== null && y0?.dividendsPaid ? fcf / y0.dividendsPaid : null;
  const recent = a.distributions.filter((d) => d.exDate >= String(new Date().getFullYear() - 2));
  const jcpShare = recent.length ? (recent.filter((d) => d.type === 'jcp').reduce((x, d) => x + d.value, 0) / recent.reduce((x, d) => x + d.value, 0)) * 100 : null;
  const st: Status = payoutPct === null ? 'sem_dado' : payoutPct > L.payoutRed ? 'vermelho' : payoutPct > L.payoutYellow ? 'amarelo' : 'verde';
  const items: Indicator[] = [
    { key: 'payout', label: 'Payout sobre lucro', value: payoutPct, fmt: 'pct', status: st, why: REFS.morningstar, note: st === 'vermelho' ? `payout acima de ${L.payoutRed}%` : undefined },
    { key: 'payoutFcl', label: 'Payout sobre fluxo de caixa livre', value: fcf && y0?.dividendsPaid ? (y0.dividendsPaid / fcf) * 100 : null, fmt: 'pct', status: fcf === null ? 'sem_dado' : 'verde', why: REFS.lintner },
    { key: 'fclCover', label: 'Cobertura FCL ÷ proventos', value: cover, fmt: 'x', status: cover === null ? 'sem_dado' : cover < L.fcfCoverageYellow ? 'amarelo' : 'verde', why: REFS.lintner },
    { key: 'streak', label: 'Anos consecutivos sem corte', value: years.length >= 2 ? streak : null, fmt: 'num', status: years.length < 2 ? 'sem_dado' : 'verde', why: REFS.bmw },
    { key: 'dpaVol', label: 'Volatilidade do DPA (desvio do crescimento anual)', value: vol, fmt: 'pct', status: vol === null ? 'sem_dado' : 'verde', why: REFS.lintner },
    { key: 'jcp', label: 'Proporção JCP nos proventos (2 anos)', value: jcpShare, fmt: 'pct', status: jcpShare === null ? 'sem_dado' : 'verde', why: 'JCP sofre IRRF na fonte; a proporção muda o rendimento líquido.' },
  ];
  return { key: 'sustentabilidade', title: 'Sustentabilidade do provento', items, status: worst(items.map((i) => i.status)) };
}

function governanceBlock(a: Asset, fin: CompanyFin | undefined, market: MarketData, ys: FinYear[]): Block {
  const seg = fin?.segment || market.segments[a.ticker] || null;
  const segName: Record<string, string> = { NM: 'Novo Mercado', N2: 'Nível 2', N1: 'Nível 1', MA: 'Bovespa Mais', M2: 'Bovespa Mais Nível 2', DR: 'Tradicional' };
  const tag = a.manual?.tagAlong?.value ?? (seg === 'NM' || seg === 'N2' ? 100 : /3$/.test(a.ticker) ? 80 : /4$|5$|6$/.test(a.ticker) ? 0 : null);
  const ctrl = a.manual?.controller?.source ?? null;
  const estatal = /estatal/i.test(ctrl || '') || /petrobras|banco do brasil|sabesp|cemig|eletrobras|copel|sanepar/i.test(a.name);
  const first = ys[0];
  const last = ys[ys.length - 1];
  const issued = first?.shares && last?.shares ? ((last.shares - first.shares) / first.shares) * 100 : null;
  const items: Indicator[] = [
    { key: 'seg', label: 'Segmento de listagem', value: seg ? segName[seg] || seg : null, fmt: 'txt', status: seg ? 'verde' : 'sem_dado', why: REFS.governance, source: 'B3' },
    { key: 'tag', label: 'Tag along', value: tag, fmt: 'pct', status: tag === null ? 'sem_dado' : 'verde', why: 'Lei 6.404/1976, art. 254-A: 80% para ON; Novo Mercado e Nível 2 garantem 100%.', note: a.manual?.tagAlong ? 'manual' : 'estimado pelo segmento e classe' },
    { key: 'freefloat', label: 'Free float', value: a.manual?.freeFloat?.value ?? null, fmt: 'pct', status: a.manual?.freeFloat?.value == null ? 'sem_dado' : 'verde', why: REFS.governance, source: a.manual?.freeFloat?.source },
    { key: 'ctrl', label: 'Controlador', value: ctrl || (estatal ? 'estatal' : null), fmt: 'txt', status: estatal ? 'amarelo' : ctrl ? 'verde' : 'sem_dado', why: REFS.governance, note: estatal ? 'risco de interferência na política de dividendos' : undefined },
    { key: 'classe', label: 'Classe', value: /3$/.test(a.ticker) ? 'ON' : /4$|5$|6$/.test(a.ticker) ? 'PN' : /11$/.test(a.ticker) ? 'Unit' : '—', fmt: 'txt', status: 'verde', why: 'Ações ON votam; PN têm preferência nos proventos e costumam ter menor tag along.' },
    { key: 'emissoes', label: 'Variação do nº de ações em 5 anos', value: issued, fmt: 'pct', status: issued === null ? 'sem_dado' : 'verde', note: issued !== null && issued > 0 ? 'houve emissão (sinal negativo no F-Score)' : issued !== null && issued < 0 ? 'recompras' : undefined, why: REFS.piotroski },
  ];
  return { key: 'governanca', title: 'Governança', items, status: worst(items.map((i) => i.status)) };
}

function riskBlock(r: RiskStats | undefined, L: Settings['limits360']): Block {
  const items: Indicator[] = [
    { key: 'liq', label: 'Liquidez média diária', value: r?.avgDailyVolume ?? null, fmt: 'brl', status: r?.avgDailyVolume == null ? 'sem_dado' : r.avgDailyVolume < L.minDailyLiquidity * 1000 ? 'amarelo' : 'verde', why: REFS.qmj, source: r?.source, date: r?.dataBase },
    { key: 'vol', label: 'Volatilidade 12 meses (a.a.)', value: r?.volatility12m ?? null, fmt: 'pct', status: r?.volatility12m == null ? 'sem_dado' : 'verde', why: REFS.qmj, source: r?.source, date: r?.dataBase },
    { key: 'hi', label: 'Máxima de 52 semanas', value: r?.high52 ?? null, fmt: 'brl', status: r?.high52 == null ? 'sem_dado' : 'verde', why: REFS.qmj, source: r?.source, date: r?.dataBase },
    { key: 'lo', label: 'Mínima de 52 semanas', value: r?.low52 ?? null, fmt: 'brl', status: r?.low52 == null ? 'sem_dado' : 'verde', why: REFS.qmj, source: r?.source, date: r?.dataBase },
    { key: 'dd', label: 'Maior queda em 12 meses', value: r?.maxDrawdown12m ?? null, fmt: 'pct', status: r?.maxDrawdown12m == null ? 'sem_dado' : 'verde', why: REFS.qmj, source: r?.source, date: r?.dataBase },
  ];
  return { key: 'risco', title: 'Mercado e risco', items, status: worst(items.map((i) => i.status)) };
}

function thesisBlock(a: Asset): Block {
  const due = (a.triggers || []).filter((t) => t.date <= new Date().toISOString().slice(0, 10));
  const items: Indicator[] = [
    { key: 'tese', label: 'Tese registrada', value: a.thesis?.trim() ? 'sim' : null, fmt: 'txt', status: a.thesis?.trim() ? 'verde' : 'amarelo', why: REFS.thesis, note: a.thesis?.trim() ? undefined : 'obrigatória para classificar como Oportunidade' },
    { key: 'status', label: 'Status da tese', value: { valida: 'válida', observacao: 'em observação', deteriorada: 'deteriorada' }[a.thesisStatus], fmt: 'txt', status: a.thesisStatus === 'deteriorada' ? 'vermelho' : a.thesisStatus === 'observacao' ? 'amarelo' : 'verde', why: REFS.thesis },
    { key: 'gatilhos', label: 'Gatilhos de revisão vencidos', value: due.length, fmt: 'num', status: due.length ? 'amarelo' : 'verde', why: REFS.thesis, note: due.map((t) => t.text).join('; ') || undefined },
  ];
  return { key: 'tese', title: 'Tese e vigilância', items, status: worst(items.map((i) => i.status)) };
}

function finish(kind: Analysis['kind'], blocks: Block[], fScore: number | null, altman: number | null, dataNote: string): Analysis {
  const all = blocks.flatMap((b) => b.items.map((i) => ({ ...i, label: `${b.title}: ${i.label}` })));
  return { kind, blocks, reds: all.filter((i) => i.status === 'vermelho'), yellows: all.filter((i) => i.status === 'amarelo'), fScore, altman, dataNote };
}
