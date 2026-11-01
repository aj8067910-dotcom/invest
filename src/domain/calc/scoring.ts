import type { Asset, Criterion, Settings } from '../types';
import { CRITERION_LABEL, isBazinClass } from '../types';
import { isNum, scale, todayISO } from '../util';
import { computeBazin, type BazinResult, BAND_INFO } from './bazin';
import { annualHistory, consecutiveYears, dividendCagr, dividendDrop, ttmPerUnit } from './dividends';
import type { Position } from './positions';
import { classNeedScore, type AllocationResult } from './allocation';
import { weights as weightsOf } from './concentration';
import { thesisAlerts, type Alert } from './thesis';
import { daysBetween } from '../util';
import { analyze, type Analysis } from './analysis360';
import { emptyMarket, type MarketData } from '../market';

/** Classificação de compra (Etapa 8): Oportunidade, Manutenção ou Aguardar. */
export type Priority = 'oportunidade' | 'manutencao' | 'aguardar';

export const PRIORITY_INFO: Record<Priority, { label: string; tone: string; rank: number }> = {
  oportunidade: { label: 'Oportunidade', tone: 'good', rank: 0 },
  manutencao: { label: 'Manutenção', tone: 'info', rank: 1 },
  aguardar: { label: 'Aguardar', tone: 'muted', rank: 2 },
};
const down = (p: Priority): Priority => (p === 'oportunidade' ? 'manutencao' : 'aguardar');

export interface CriterionScore {
  key: Criterion;
  label: string;
  score: number | null; // null = sem dado
  na: boolean; // não se aplica
  weight: number;
  note: string;
}

export interface ScoreResult {
  assetId: string;
  score: number;
  coverage: number; // % do peso aplicável com dado
  priority: Priority;
  criteria: CriterionScore[];
  reasons: string[]; // justificativa
  alerts: Alert[];
  bazin: BazinResult;
  analysis: Analysis;
  quality: { passed: boolean; failures: string[] };
}

export interface ScoreContext {
  assets: Asset[];
  positions: Record<string, Position>;
  settings: Settings;
  alloc: AllocationResult;
  market?: MarketData;
  asOf?: string;
}

const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter(isNum);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
const from5 = (v: number | null | undefined) => (isNum(v) ? scale(v, 1, 5) : null);
const inv5 = (v: number | null | undefined) => (isNum(v) ? scale(v, 5, 1) : null);

function payoutScore(p: number | null | undefined): number | null {
  if (!isNum(p)) return null;
  if (p > 100) return 0;
  if (p > 90) return 25;
  if (p > 75) return 60;
  if (p >= 30) return 100;
  if (p >= 15) return 70;
  return 45;
}

const isFinancial = (a: Asset) => /financ|banc|segur/i.test(a.sector);

export function scoreAsset(a: Asset, ctx: ScoreContext): ScoreResult {
  const s = ctx.settings;
  const asOf = ctx.asOf || todayISO();
  const f = a.fundamentals || {};
  const bz = computeBazin(a, s, asOf);
  const alerts = thesisAlerts(a, s, asOf);
  const w = weightsOf(ctx.assets, ctx.positions, a);
  const crit: Partial<Record<Criterion, { score: number | null; na?: boolean; note: string }>> = {};
  const bazinClass = isBazinClass(a.class);

  // 10, 11, 12 — comuns a todas as classes
  crit.diversificacao = { score: scale(w.assetPct, s.limits.maxAssetPct, 0), note: `Peso atual ${w.assetPct.toFixed(1)}% (limite ${s.limits.maxAssetPct}%)` };
  crit.alocacao = { score: classNeedScore(ctx.alloc, a.class), note: (() => { const r = ctx.alloc.rows.find((x) => x.cls === a.class)!; return `Classe em ${r.current.toFixed(1)}% vs alvo ${r.target}%`; })() };

  if (bazinClass) {
    const rows = annualHistory(a, asOf);
    const ttm = ttmPerUnit(a, asOf);
    const cagr = dividendCagr(rows);
    const years = consecutiveYears(rows);
    const drop = dividendDrop(a, asOf);
    crit.setorial = { score: Math.min(scale(w.sectorPct, s.limits.maxSectorPct, 0), scale(w.issuerPct, s.limits.maxIssuerPct, 0)), note: `Setor ${w.sectorPct.toFixed(1)}% · emissor ${w.issuerPct.toFixed(1)}%` };

    if (a.class === 'acao') {
      const q = avg([
        isNum(f.roe) ? scale(f.roe, 5, 25) : null,
        isNum(f.roic) && !isFinancial(a) ? scale(f.roic, 4, 20) : null,
        isNum(f.netMargin) ? scale(f.netMargin, 0, 25) : null,
        isNum(f.ebitdaMargin) && !isFinancial(a) ? scale(f.ebitdaMargin, 5, 40) : null,
        from5(f.governance),
        from5(f.moat),
        inv5(f.sectorRisk),
      ]);
      const n = [f.roe, f.roic, f.netMargin, f.ebitdaMargin, f.governance, f.moat, f.sectorRisk].filter(isNum).length;
      crit.qualidade = { score: n >= 2 ? q : null, note: n >= 2 ? `${n} indicadores (ROE, ROIC, margens, governança, moat, risco)` : 'Preencha ao menos 2 indicadores de qualidade' };
      crit.endividamento = isFinancial(a)
        ? { score: null, na: true, note: 'Dív. líq./EBITDA não se aplica a financeiras' }
        : isNum(f.netDebtEbitda)
          ? { score: f.netDebtEbitda <= 0 ? 100 : scale(f.netDebtEbitda, 4, 0), note: `Dív. líq./EBITDA ${f.netDebtEbitda.toFixed(2)}x` }
          : { score: null, note: 'Sem Dív. líq./EBITDA' };
      crit.payout = { score: payoutScore(f.payout), note: isNum(f.payout) ? `Payout ${f.payout.toFixed(0)}% (faixa saudável 30–75%)` : 'Sem payout' };
      crit.caixa = isNum(f.fcfYield)
        ? { score: scale(f.fcfYield, 0, 12), note: `FCF yield ${f.fcfYield.toFixed(1)}%` }
        : isNum(f.fcf)
          ? { score: f.fcf > 0 ? 65 : 10, note: `FCF ${f.fcf > 0 ? 'positivo' : 'negativo'}` }
          : isFinancial(a)
            ? { score: null, na: true, note: 'FCF não se aplica a bancos/seguradoras' }
            : { score: null, note: 'Sem FCF' };
    } else {
      const papel = a.fiiType === 'papel';
      const q = avg([
        from5(f.propertyQuality),
        from5(f.management),
        from5(f.tenantDiversification),
        !papel && isNum(f.vacFisica) ? scale(f.vacFisica, 20, 0) : null,
        isNum(f.concentration) ? scale(f.concentration, 60, 10) : null,
        !papel && isNum(f.walt) ? scale(f.walt, 1, 8) : null,
        isNum(f.pvp) ? scale(f.pvp, 1.3, 0.8) : null,
      ]);
      const n = [f.propertyQuality, f.management, f.tenantDiversification, f.vacFisica, f.concentration, f.walt, f.pvp].filter(isNum).length;
      crit.qualidade = { score: n >= 2 ? q : null, note: n >= 2 ? `${n} indicadores (imóveis/carteira, gestão, inquilinos, vacância, P/VP)` : 'Preencha ao menos 2 indicadores' };
      crit.endividamento = isNum(f.leverage) ? { score: scale(f.leverage, 40, 0), note: `Alavancagem ${f.leverage.toFixed(0)}% do PL` } : { score: null, note: 'Sem alavancagem' };
      crit.payout = { score: null, na: true, note: 'FIIs distribuem ≥95% do resultado semestral por lei' };
      const c = avg([isNum(f.inadimplencia) ? scale(f.inadimplencia, 8, 0) : null, isNum(f.vacFinanceira) ? scale(f.vacFinanceira, 25, 0) : null]);
      crit.caixa = { score: c, note: c !== null ? 'Inadimplência e vacância financeira' : 'Sem inadimplência/vacância financeira' };
    }

    // Sustentabilidade
    const sustParts = [
      a.class === 'acao' ? payoutScore(f.payout) : from5(f.distributionQuality),
      years > 0 ? scale(years, 0, 8) : null,
      ttm.total > 0 ? scale(ttm.extraShare, 50, 0) : null,
      drop !== null ? scale(drop, -30, 5) : null,
      a.class === 'acao' && isNum(f.fcfYield) && bz.dyCurrent ? (f.fcfYield >= bz.dyCurrent ? 100 : scale(f.fcfYield / bz.dyCurrent, 0.3, 1)) : null,
      a.class === 'fii' && isNum(f.inadimplencia) ? scale(f.inadimplencia, 8, 0) : null,
    ];
    const sust = avg(sustParts);
    crit.sustentabilidade = {
      score: sust,
      note: sust !== null ? [years ? `${years} ano(s) seguidos pagando` : null, ttm.total ? `${ttm.extraShare.toFixed(0)}% extraordinário` : null, drop !== null ? `variação 12m ${drop.toFixed(0)}%` : null].filter(Boolean).join(' · ') || 'Payout/qualidade da distribuição' : 'Sem dados de sustentabilidade',
    };

    // DY atual — alto demais não é premiado
    if (bz.dyCurrent !== null) {
      const ratio = bz.dyCurrent / bz.dyTarget;
      let sc = scale(ratio, 0.5, 1.3);
      let note = `DY recorrente ${bz.dyCurrent.toFixed(2)}% vs alvo ${bz.dyTarget}%`;
      if (ratio > 2) {
        sc = Math.min(sc, 60);
        note += ' · muito acima do alvo: verificar sustentabilidade';
      }
      crit.dy = { score: sc, note };
    } else crit.dy = { score: null, note: bz.price ? 'Sem proventos recorrentes em 12m' : 'Sem cotação' };

    crit.preco = bz.ratio !== null ? { score: scale(bz.ratio, 110, 60), note: `Preço em ${bz.ratio.toFixed(0)}% do teto (${BAND_INFO[bz.band!].label})` } : { score: null, note: bz.ceiling ? 'Sem cotação' : 'Sem preço-teto' };
    crit.margem = bz.discount !== null ? { score: scale(bz.discount, 0, 40), note: `Margem de segurança ${bz.discount.toFixed(1)}%` } : { score: null, note: 'Sem margem calculável' };
    crit.crescimento = cagr !== null
      ? { score: scale(cagr, -5, 12), note: `CAGR proventos ${cagr.toFixed(1)}% a.a.` }
      : a.class === 'acao' && isNum(f.earningsGrowth)
        ? { score: scale(f.earningsGrowth, -5, 15), note: `Sem histórico de proventos; usando crescimento do lucro ${f.earningsGrowth}%` }
        : { score: null, note: 'Histórico insuficiente (mín. 3 anos completos)' };
  } else {
    // ETFs, Tesouro e cripto: métricas próprias, sem Bazin
    const na = (note: string) => ({ score: null, na: true, note });
    crit.dy = na('Não se aplica');
    crit.margem = na('Não se aplica');
    crit.crescimento = na('Não se aplica');
    crit.payout = na('Não se aplica');
    crit.sustentabilidade = na('Não se aplica');
    crit.endividamento = na('Não se aplica');
    crit.caixa = na('Não se aplica');
    crit.setorial = na('Veículo diversificado / sem setor');
    if (a.class === 'etf') {
      const e = a.etf;
      const parts = [isNum(e?.fee) ? scale(e!.fee!, 1, 0.1) : null, isNum(e?.liquidity) ? scale(e!.liquidity!, 500, 10000) : null];
      const q = avg(parts);
      crit.qualidade = { score: q, note: q !== null ? `Taxa ${e?.fee ?? '—'}% a.a. · liquidez ${e?.liquidity ?? '—'} mil/dia` : 'Preencha taxa de administração e liquidez' };
      crit.preco = na('ETF: sem preço-teto; decisão por alocação');
    } else if (a.class === 'tesouro') {
      const fx = a.fixed;
      crit.qualidade = { score: 90, note: 'Risco soberano (Tesouro Nacional)' };
      if (fx && isNum(fx.marketRate) && fx.indexer === 'IPCA+') {
        const g = s.scoring.goodRealRate;
        crit.preco = { score: scale(fx.marketRate, g - 2, g + 1), note: `Taxa real atual IPCA+ ${fx.marketRate.toFixed(2)}% (referência ${g}%)` };
      } else crit.preco = { score: null, note: 'Informe a taxa atual de compra' };
      if (fx?.maturity && daysBetween(asOf, fx.maturity) < 365) crit.qualidade.note += ' · vence em menos de 1 ano';
    } else {
      crit.qualidade = na('Sem fundamentos; decisão por alocação e limite de risco');
      crit.preco = na('Cripto: sem valuation por fluxo');
    }
  }

  const criteria: CriterionScore[] = (Object.keys(CRITERION_LABEL) as Criterion[]).map((key) => {
    const c = crit[key] || { score: null, note: '—' };
    return { key, label: CRITERION_LABEL[key], score: c.score === null ? null : Math.round(c.score), na: !!c.na, weight: s.weights[key] || 0, note: c.note };
  });
  const applicable = criteria.filter((c) => !c.na && c.weight > 0);
  const withData = applicable.filter((c) => c.score !== null);
  const wApp = applicable.reduce((x, c) => x + c.weight, 0);
  const wData = withData.reduce((x, c) => x + c.weight, 0);
  let score = wData ? withData.reduce((x, c) => x + (c.score as number) * c.weight, 0) / wData : 0;
  score += (a.priority - 3) * 2; // prioridade manual: ajuste leve (±4)
  // ativos que não geram renda não podem superar bons pagadores de dividendos
  if (a.class === 'cripto') score = Math.min(score, 65);
  else if (a.class === 'etf' && !a.etf?.distributes) score = Math.min(score, 75);
  score = Math.max(0, Math.min(100, score));
  const coverage = wApp ? (wData / wApp) * 100 : 0;

  // ── Classificação (Etapa 8) — régua objetiva por margem + filtro de qualidade
  const reasons: string[] = [];
  const analysis = analyze(a, s, ctx.market || emptyMarket(), bz, ctx.positions[a.id]);
  const failures: string[] = [];
  let priority: Priority;
  if (bazinClass) {
    if (bz.margin === null) {
      priority = 'aguardar';
      reasons.push(bz.price === null ? 'Sem cotação: margem não calculável.' : 'Sem preço-teto (faltam proventos recorrentes).');
    } else {
      priority = bz.band === 'oportunidade' ? 'oportunidade' : bz.band === 'manutencao' ? 'manutencao' : 'aguardar';
      reasons.push(`Margem de segurança ${bz.margin.toFixed(1).replace('.', ',')}% (teto R$ ${bz.ceiling!.toFixed(2).replace('.', ',')}): faixa ${PRIORITY_INFO[priority].label}.`);
    }
    // filtro de qualidade
    const blockRed = (k: string) => analysis.blocks.find((b) => b.key === k)?.items.filter((x) => x.status === 'vermelho') || [];
    for (const k of ['endividamento', 'perfil', 'sustentabilidade']) for (const x of blockRed(k)) failures.push(`${x.label}: ${x.note || 'alerta vermelho'}`);
    if (analysis.fScore !== null && analysis.fScore < s.limits360.fScoreMin) failures.push(`F-Score ${analysis.fScore} abaixo de ${s.limits360.fScoreMin}`);
    if (analysis.altman !== null && analysis.altman < s.limits360.altmanGrey) failures.push(`Altman Z″ ${analysis.altman.toFixed(2)} na zona de alerta`);
    if (!a.thesis?.trim()) failures.push('tese não registrada');
    if (priority === 'oportunidade' && failures.length) {
      priority = 'manutencao';
      reasons.push(`Não aprovado no filtro de qualidade: ${failures.join('; ')}.`);
    }
    // alertas
    const reds = analysis.reds;
    if (reds.length) {
      priority = 'aguardar';
      reasons.push(`Alerta vermelho: ${reds.map((x) => (x.note ? `${x.label} (${x.note})` : x.label)).join('; ')}.`);
    } else if (analysis.yellows.length >= 2 && priority === 'oportunidade') {
      priority = 'manutencao';
      reasons.push(`Dois ou mais alertas amarelos: ${analysis.yellows.map((x) => x.label).join('; ')}.`);
    }
  } else {
    // ETFs, Tesouro e cripto: decisão por alocação (banda de tolerância da classe)
    const cls = ctx.alloc.rows.find((x) => x.cls === a.class)!;
    priority = cls.status === 'sub' ? 'oportunidade' : cls.status === 'ok' ? 'manutencao' : 'aguardar';
    reasons.push(`Decisão por alocação: classe em ${cls.current.toFixed(1).replace('.', ',')}% vs alvo ${cls.target}% (banda ±${s.allocationBand} p.p.).`);
    if (!isNum(a.quote.price)) {
      priority = 'aguardar';
      reasons.push(a.class === 'tesouro' ? 'Sem preço unitário atual.' : 'Sem cotação.');
    }
  }
  if (a.riskLevel >= 5 && priority !== 'aguardar') {
    priority = 'aguardar';
    reasons.push('Risco classificado por você como muito alto (5/5).');
  }
  // peso-alvo e sobreposição econômica
  const target = isNum(a.targetWeight) ? a.targetWeight : s.limits.maxAssetPct;
  if (priority !== 'aguardar' && ctx.alloc.total > s.profile.monthlyContribution * 10) {
    const w = weightsOf(ctx.assets, ctx.positions, a);
    if (w.assetPct > target) {
      priority = down(priority);
      reasons.push(`Acima do peso-alvo (${w.assetPct.toFixed(1).replace('.', ',')}% vs ${target}%): cai uma faixa.`);
    } else if (w.issuerPct > s.limits.maxIssuerPct) {
      priority = down(priority);
      reasons.push(`Sobreposição econômica: grupo "${a.issuer}" já soma ${w.issuerPct.toFixed(1).replace('.', ',')}% (limite ${s.limits.maxIssuerPct}%): cai uma faixa.`);
    }
  }

  // Pontos fortes e fracos
  const ranked = withData.filter((c) => c.weight > 0).sort((x, y) => (y.score as number) - (x.score as number));
  const strong = ranked.filter((c) => (c.score as number) >= 70).slice(0, 3);
  const weak = ranked.filter((c) => (c.score as number) < 40).slice(-3);
  // pontos fortes/fracos primeiro; a última justificativa é sempre a trava decisiva
  const head: string[] = [];
  if (strong.length) head.push(`Pontos fortes: ${strong.map((c) => c.label.toLowerCase()).join(', ')}.`);
  if (weak.length) head.push(`Pontos fracos: ${weak.map((c) => c.label.toLowerCase()).join(', ')}.`);
  reasons.unshift(...head);

  return { assetId: a.id, score: Math.round(score), coverage, priority, criteria, reasons, alerts, bazin: bz, analysis, quality: { passed: !failures.length, failures } };
}


export function rankAssets(ctx: ScoreContext, filter?: (a: Asset) => boolean): ScoreResult[] {
  return ctx.assets
    .filter(filter || (() => true))
    .map((a) => scoreAsset(a, ctx))
    .sort((x, y) => PRIORITY_INFO[x.priority].rank - PRIORITY_INFO[y.priority].rank || y.score - x.score);
}
