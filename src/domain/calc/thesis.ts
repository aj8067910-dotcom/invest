import type { Asset, Fundamentals, Settings } from '../types';
import { isNum, todayISO } from '../util';
import { dividendDrop, ttmPerUnit } from './dividends';

export interface Alert {
  level: 'info' | 'warn' | 'danger';
  code: string;
  message: string;
}

const prevSnapshot = (a: Asset): Fundamentals | null => {
  const h = [...(a.fundHistory || [])].sort((x, y) => x.date.localeCompare(y.date));
  return h.length >= 2 ? h[h.length - 2].data : null;
};

/**
 * Alertas de revisão da tese. Uma queda de preço NUNCA é tratada como oportunidade
 * se algum destes sinais de deterioração estiver presente.
 */
export function thesisAlerts(a: Asset, s: Settings, asOf = todayISO()): Alert[] {
  const out: Alert[] = [];
  const f = a.fundamentals || {};
  const r = s.thesisRules;
  const prev = prevSnapshot(a);

  if (a.thesisStatus === 'deteriorada') out.push({ level: 'danger', code: 'tese', message: 'Tese marcada como deteriorada: não comprar até nova revisão.' });
  else if (a.thesisStatus === 'observacao') out.push({ level: 'warn', code: 'tese', message: 'Tese em observação.' });
  if (a.riskLevel >= 5) out.push({ level: 'danger', code: 'risco', message: 'Risco classificado como muito alto (5/5).' });
  else if (a.riskLevel >= 4) out.push({ level: 'warn', code: 'risco', message: 'Risco classificado como elevado (4/5).' });

  if (a.class === 'acao') {
    if (isNum(f.payout) && f.payout > r.payoutMax) out.push({ level: 'danger', code: 'payout', message: `Payout de ${f.payout.toFixed(0)}% acima de ${r.payoutMax}%: a empresa distribui mais do que lucra.` });
    if (isNum(f.netDebtEbitda) && f.netDebtEbitda > r.netDebtEbitdaMax) out.push({ level: 'warn', code: 'divida', message: `Dívida líquida/EBITDA de ${f.netDebtEbitda.toFixed(1)}x acima do limite de ${r.netDebtEbitdaMax}x.` });
    if (isNum(f.fcf) && f.fcf < 0) out.push({ level: 'warn', code: 'fcf', message: 'Fluxo de caixa livre negativo: dividendos podem não ser sustentáveis.' });
    if (prev) {
      if (isNum(f.roe) && isNum(prev.roe) && prev.roe - f.roe >= r.roeDropPts) out.push({ level: 'warn', code: 'roe', message: `ROE caiu ${(prev.roe - f.roe).toFixed(1)} p.p. desde a última revisão.` });
      if (isNum(f.netMargin) && isNum(prev.netMargin) && prev.netMargin - f.netMargin >= r.marginDropPts) out.push({ level: 'warn', code: 'margem', message: `Margem líquida caiu ${(prev.netMargin - f.netMargin).toFixed(1)} p.p.` });
      if (isNum(f.netDebtEbitda) && isNum(prev.netDebtEbitda) && f.netDebtEbitda - prev.netDebtEbitda >= 1) out.push({ level: 'warn', code: 'alavancagem', message: `Alavancagem subiu de ${prev.netDebtEbitda.toFixed(1)}x para ${f.netDebtEbitda.toFixed(1)}x.` });
    }
  }
  if (a.class === 'fii') {
    if (isNum(f.vacFinanceira) && f.vacFinanceira > r.vacancyMax) out.push({ level: 'warn', code: 'vacancia', message: `Vacância financeira de ${f.vacFinanceira.toFixed(1)}% acima de ${r.vacancyMax}%.` });
    if (isNum(f.inadimplencia) && f.inadimplencia > r.delinquencyMax) out.push({ level: 'danger', code: 'inadimplencia', message: `Inadimplência de ${f.inadimplencia.toFixed(1)}% acima de ${r.delinquencyMax}%.` });
    if (isNum(f.leverage) && f.leverage > r.fiiLeverageMax) out.push({ level: 'warn', code: 'alavancagem', message: `Alavancagem de ${f.leverage.toFixed(0)}% do PL acima de ${r.fiiLeverageMax}%.` });
    if (prev && isNum(f.vacFinanceira) && isNum(prev.vacFinanceira) && f.vacFinanceira - prev.vacFinanceira >= 5) out.push({ level: 'warn', code: 'vacancia_sub', message: 'Vacância financeira subiu 5 p.p. ou mais desde a última revisão.' });
  }
  if (a.class === 'acao' || a.class === 'fii') {
    const drop = dividendDrop(a, asOf);
    if (drop !== null && drop <= -r.divDropPct) out.push({ level: 'warn', code: 'corte', message: `Proventos recorrentes caíram ${Math.abs(drop).toFixed(0)}% nos últimos 12 meses.` });
    const ttm = ttmPerUnit(a, asOf);
    if (ttm.extraShare >= 30) out.push({ level: 'info', code: 'extra', message: `${ttm.extraShare.toFixed(0)}% dos proventos de 12m são extraordinários (excluídos do preço-teto).` });
    const negative = (a.events || []).filter((e) => e.impact === 'negativo' && e.date >= todayISO(new Date(Date.now() - 90 * 86400000)));
    if (negative.length) out.push({ level: 'warn', code: 'evento', message: `${negative.length} evento(s) negativo(s) registrado(s) nos últimos 90 dias.` });
    if (f.updatedAt) {
      const ageDays = (Date.now() - new Date(f.updatedAt).getTime()) / 86400000;
      if (ageDays > 200) out.push({ level: 'info', code: 'desatualizado', message: `Fundamentos sem revisão há ${Math.round(ageDays)} dias.` });
    }
  }
  return out;
}

export const hasSevere = (alerts: Alert[]) => alerts.some((x) => x.level === 'danger');
export const hasWarn = (alerts: Alert[]) => alerts.some((x) => x.level === 'warn' || x.level === 'danger');
