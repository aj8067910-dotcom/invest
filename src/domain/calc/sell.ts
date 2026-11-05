// Oportunidade de Venda: critérios e status (metodologia aprovada em docs/METODOLOGIA_VENDA.md).
// A plataforma classifica e explica; a decisão de vender é do investidor.
import type { Asset, Settings, Transaction } from '../types';
import { INCOME_TX } from '../types';
import type { MarketData } from '../market';
import { isNum, addMonths, todayISO } from '../util';
import { isReceived } from '../ledger';
import { isHeld, type Position } from './positions';
import { projectedPerUnit } from './yoc';
import { payout3y } from './cvmFundamentals';

export type SellStatus = 'vender' | 'aguardar' | 'nao_vender' | 'sem_posicao';
export const SELL_STATUS: Record<SellStatus, { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' }> = {
  vender: { label: 'VENDER', tone: 'good' },
  aguardar: { label: 'AGUARDAR', tone: 'warn' },
  nao_vender: { label: 'NÃO VENDER', tone: 'bad' },
  sem_posicao: { label: 'SEM POSIÇÃO', tone: 'muted' },
};

export type CritKey = 'bazin' | 'graham' | 'multiplos' | 'oportunidade' | 'sustentabilidade' | 'meta';
export interface Crit {
  key: CritKey;
  label: string;
  signal: boolean | null; // null = não se aplica ou sem dado
  value: string;
  detail: string;
}

export interface SellEval {
  asset: Asset;
  price: number | null;
  avgPrice: number;
  qty: number;
  cost: number;
  marketValue: number;
  income: number; // proventos recebidos (líquidos)
  totalReturn: number | null;
  totalReturnPct: number | null;
  cdiPct: number | null;
  ipcaPlusPct: number | null;
  dyProjected: number | null;
  exitPrice: number | null; // DPA ÷ DY de saída configurado
  bookExitPrice: number | null; // DPA ÷ 4% (regra de venda do livro de Bazin)
  graham: number | null;
  premium: number | null;
  pl: number | null;
  plAvg: number | null;
  pvp: number | null;
  pvpAvg: number | null;
  criteria: Crit[];
  signals: number;
  metaHit: boolean;
  status: SellStatus;
  reviewThesis: boolean; // retorno negativo com deterioração (Fisher; Odean 1998)
  triggerPrice: number | null; // cotação a partir da qual o status vira VENDER
  taxNote: string;
  taxEstimate: number | null;
}

const fmt = (v: number | null | undefined, d = 2) => (isNum(v) ? v.toFixed(d).replace('.', ',') : '—');
const pctS = (v: number | null | undefined, d = 1) => (isNum(v) ? `${v >= 0 ? '+' : ''}${fmt(v, d)}%` : '—');
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Fator acumulado de uma série mensal (%), dos meses seguintes ao da operação até o último disponível. */
function growth(series: [string, number][] | undefined, fromYm: string, extra?: (ym: string) => number): number | null {
  if (!series?.length) return null;
  let f = 1;
  for (const [ym, v] of series) if (ym > fromYm) f *= (1 + v / 100) * (extra ? extra(ym) : 1);
  return f;
}
const rateAt = (series: [string, number][] | undefined, ym: string, fallback: number | null) => {
  let r: number | null = null;
  for (const [m, v] of series || []) if (m <= ym) r = v;
  return r ?? fallback;
};

export function evaluateSell(o: { asset: Asset; eff: Asset; position: Position | undefined; txs: Transaction[]; market: MarketData; settings: Settings; asOf?: string }): SellEval {
  const { asset: a, eff, market: m, settings: s } = o;
  const R = s.sell;
  const asOf = o.asOf || todayISO();
  const p = o.position;
  const held = isHeld(p);
  const price0 = isNum(a.quote.price) && a.quote.price > 0 ? a.quote.price : null;
  const qty = held ? p!.qty : 0;
  const unit = m.companies?.[a.ticker]?.unitShares || 1;
  const isFin = /financ|banc|segur/i.test(a.sector) || !!m.companies?.[a.ticker]?.financial;

  // ── dados estáticos (não dependem da cotação)
  const u = projectedPerUnit(a, s, asOf);
  const dpa = u.perUnit;
  const exitPrice = dpa ? dpa / (R.exitDy / 100) : null;
  const bookExitPrice = dpa ? dpa / 0.04 : null;
  const f = eff.fundamentals || {};
  const lpa = isNum(f.lpa) ? f.lpa : null;
  const vpa = isNum(f.vpa) ? f.vpa : null;
  const graham = a.class === 'acao' && lpa && vpa && lpa > 0 && vpa > 0 ? Math.sqrt(22.5 * lpa * vpa) : null;

  // múltiplos históricos: preço médio do ano ÷ LPA/VPA do ano (CVM), últimos 5 anos
  const fin = m.companies?.[a.ticker];
  const ys = (fin?.years || []).filter((y) => isNum(y.netIncome) && y.shares).sort((x, y) => x.year - y.year);
  const hist = ys.slice(-5).map((y) => {
    const ap = a.annualPrices?.[String(y.year)];
    const l = ((y.netIncome as number) / (y.shares as number)) * unit;
    const v = isNum(y.equity) ? (y.equity / (y.shares as number)) * unit : null;
    return { pl: ap && l > 0 ? ap / l : null, pvp: ap && v && v > 0 ? ap / v : null };
  });
  const plAvg = avg(hist.map((h) => h.pl).filter(isNum));
  const pvpAvg = a.class === 'acao' ? avg(hist.map((h) => h.pvp).filter(isNum)) : null;

  // fluxos para custo de oportunidade
  const mine = o.txs.filter((t) => t.assetId === a.id);
  const buys = mine.filter((t) => t.type === 'compra' || t.type === 'saldo_inicial' || t.type === 'subscricao');
  const invested = buys.reduce((x, t) => x + t.amount, 0);
  const sales = mine.filter((t) => t.type === 'venda').reduce((x, t) => x + t.amount, 0);
  const income = mine.filter((t) => INCOME_TX.includes(t.type) && isReceived(t, asOf)).reduce((x, t) => x + t.amount, 0);
  const cdiFinal = buys.reduce((x, t) => { const g = growth(m.series?.cdi, t.date.slice(0, 7)); return g === null ? NaN : x + t.amount * g; }, 0);
  const ipcaFinal = buys.reduce((x, t) => {
    const r = rateAt(m.series?.ntnb, t.date.slice(0, 7), m.ntnb?.rate ?? null);
    const g = r === null ? null : growth(m.series?.ipca, t.date.slice(0, 7), () => Math.pow(1 + r / 100, 1 / 12));
    return g === null ? NaN : x + t.amount * g;
  }, 0);
  const cdiPct = invested > 0 && isFinite(cdiFinal) ? (cdiFinal / invested - 1) * 100 : null;
  const ipcaPlusPct = invested > 0 && isFinite(ipcaFinal) ? (ipcaFinal / invested - 1) * 100 : null;

  // sustentabilidade (independe da cotação)
  const subs: { label: string; hit: boolean }[] = [];
  if (a.class === 'acao' && ys.length >= 3) {
    const last3 = ys.slice(-3);
    const po = last3.map((y) => (isNum(y.dividendsPaid) && (y.netIncome as number) > 0 ? (y.dividendsPaid / (y.netIncome as number)) * 100 : null));
    const p3 = payout3y(ys);
    if (p3 !== null || po.every(isNum)) {
      const rising = po.every(isNum) && po[0]! < po[1]! && po[1]! < po[2]! && po[2]! > R.payoutRising;
      subs.push({ label: `payout 3 anos ${fmt(p3, 0)}%${rising ? ', subindo há 3 anos' : ''}`, hit: (p3 !== null && p3 > R.payoutMax) || rising });
    }
    const ni = last3.map((y) => y.netIncome as number);
    subs.push({ label: `lucro ${ni[2] < ni[1] && ni[1] < ni[0] ? 'caiu 2 anos seguidos' : 'sem 2 quedas seguidas'}`, hit: ni[2] < ni[1] && ni[1] < ni[0] });
    if (!isFin) {
      const nd = last3.map((y) => {
        const e = isNum(y.ebit) ? y.ebit + (y.depreciation ?? 0) : null;
        const debt = (y.shortDebt ?? 0) + (y.longDebt ?? 0) - (y.cash ?? 0);
        return e && e > 0 ? debt / e : null;
      });
      if (isNum(nd[2])) subs.push({ label: `DL/EBITDA ${fmt(nd[2], 1)}x${isNum(nd[0]) ? ` (era ${fmt(nd[0], 1)}x)` : ''}`, hit: nd[2] > R.ndEbitdaMax || (isNum(nd[0]) && nd[2] - nd[0] >= R.ndEbitdaRise) });
    } else {
      const roe = last3.map((y) => (isNum(y.equity) && y.equity > 0 ? ((y.netIncome as number) / y.equity) * 100 : null));
      if (roe.every(isNum)) subs.push({ label: `ROE ${fmt(roe[2], 1)}% (${roe[2]! < roe[1]! && roe[1]! < roe[0]! ? 'caindo 2 anos' : 'estável ou subindo'})`, hit: roe[2]! < roe[1]! && roe[1]! < roe[0]! });
    }
  }
  const y1 = addMonths(asOf, -12), y2 = addMonths(asOf, -24);
  const sumD = (from: string, to: string) => a.distributions.filter((d) => d.type !== 'amortizacao' && d.exDate > from && d.exDate <= to).reduce((x, d) => x + d.value, 0);
  const d12 = sumD(y1, asOf), d24 = sumD(y2, y1);
  if (d24 > 0) subs.push({ label: `provento 12m ${pctS((d12 / d24 - 1) * 100, 0)} vs 12m anteriores`, hit: (1 - d12 / d24) * 100 >= R.dividendCut });
  const subHits = subs.filter((x) => x.hit).length;
  const sustSignal = subs.length ? (subs.length === 1 ? subHits === 1 : subHits >= 2) : null;

  // ── avaliação numa cotação (usada também para achar o preço-gatilho)
  const at = (price: number | null) => {
    const mv = held ? (p!.valueOnly ? p!.marketValue : qty * (price ?? 0)) : 0;
    const totalReturn = held && price ? mv - p!.costBasis + p!.realized + p!.income : held ? p!.totalReturn : null;
    const base = held ? p!.totalBought : 0;
    const totalReturnPct = totalReturn !== null && base > 0 ? (totalReturn / base) * 100 : null;
    const dyProjected = price && dpa ? (dpa / price) * 100 : null;
    const premium = graham && price ? (price / graham - 1) * 100 : null;
    const pl = price && lpa && lpa > 0 ? price / lpa : null;
    const pvp = price && vpa && vpa > 0 ? price / vpa : null;
    const assetPct = invested > 0 && price ? ((mv + sales + income) / invested - 1) * 100 : null;
    const c: Crit[] = [];
    c.push({ key: 'bazin', label: 'Preço de saída Bazin', signal: exitPrice && price ? price >= exitPrice : null, value: exitPrice ? `R$ ${fmt(exitPrice)}` : 'sem proventos', detail: dpa ? `DPA ${fmt(dpa, 4)} ÷ ${fmt(R.exitDy, 1)}% · DY projetado ${fmt(dyProjected, 1)}% · regra do livro (4%): R$ ${fmt(bookExitPrice)}` : 'sem histórico de proventos' });
    c.push({ key: 'graham', label: 'Prêmio sobre Graham', signal: premium === null ? null : premium > R.grahamPremium, value: premium === null ? (a.class === 'acao' ? 'sem LPA/VPA' : 'não se aplica') : pctS(premium, 0), detail: graham ? `Número de Graham √(22,5 × ${fmt(lpa)} × ${fmt(vpa)}) = R$ ${fmt(graham)}` : a.class === 'fii' ? 'FII: Graham não se aplica' : 'precisa de LPA e VPA positivos' });
    const plHi = isNum(pl) && isNum(plAvg) ? pl / plAvg - 1 : null;
    const pvHi = isNum(pvp) && isNum(pvpAvg) ? pvp / pvpAvg - 1 : null;
    const multSig = plHi === null || pvHi === null ? null : plHi > 0 && pvHi > 0 && Math.max(plHi, pvHi) * 100 >= R.multiplesPct;
    c.push({ key: 'multiplos', label: 'P/L e P/VP vs. 5 anos', signal: a.class === 'acao' ? multSig : null, value: a.class === 'acao' ? `P/L ${fmt(pl, 1)} (média ${fmt(plAvg, 1)}) · P/VP ${fmt(pvp, 2)} (média ${fmt(pvpAvg, 2)})` : 'não se aplica', detail: a.class === 'acao' ? `sinal: os dois acima da média e um deles ${fmt(R.multiplesPct, 0)}% acima · preço médio do ano ÷ LPA/VPA da CVM` : 'FII: sem histórico de P/VP na base' });
    const ntnb = m.ntnb?.rate ?? null;
    const oppSig = assetPct === null || cdiPct === null || dyProjected === null || ntnb === null ? null : assetPct < cdiPct && dyProjected < ntnb;
    c.push({ key: 'oportunidade', label: 'Custo de oportunidade', signal: oppSig, value: `ativo ${pctS(assetPct)} · CDI ${pctS(cdiPct)} · IPCA+ ${pctS(ipcaPlusPct)}`, detail: `sinal: rendeu menos que o CDI e o DY projetado (${fmt(dyProjected, 1)}%) é menor que a NTN-B de hoje (${fmt(ntnb, 2)}% + IPCA) · cada compra comparada como se tivesse ido para o CDI ou para IPCA + taxa da NTN-B da data` });
    c.push({ key: 'sustentabilidade', label: 'Sustentabilidade dos dividendos', signal: sustSignal, value: subs.length ? `${subHits} de ${subs.length} alertas` : 'sem dados', detail: subs.length ? subs.map((x) => `${x.hit ? '▲' : '●'} ${x.label}`).join(' · ') : 'sem balanços da CVM nem histórico de proventos' });
    const metaHit = isNum(a.sellTarget) && totalReturnPct !== null && totalReturnPct >= a.sellTarget;
    c.push({ key: 'meta', label: 'Meta pessoal', signal: isNum(a.sellTarget) ? metaHit : null, value: isNum(a.sellTarget) ? `${fmt(a.sellTarget, 1)}% (atual ${pctS(totalReturnPct)})` : 'não definida', detail: 'retorno total (variação + proventos + vendas) ≥ meta' });
    const signals = c.filter((x) => x.key !== 'meta' && x.signal === true).length;
    let status: SellStatus;
    if (!held || totalReturnPct === null) status = 'sem_posicao';
    else if (totalReturnPct < 0) status = 'nao_vender';
    else if (totalReturnPct > 0 && (signals >= R.minSignals || metaHit)) status = 'vender';
    else status = 'aguardar';
    return { mv, totalReturn, totalReturnPct, dyProjected, premium, pl, pvp, c, signals, metaHit, status };
  };

  const now = at(price0);
  let triggerPrice: number | null = null;
  if (held && price0 && now.status !== 'vender') {
    for (let k = 1; k <= 400; k++) {
      const pr = price0 * Math.pow(1.005, k); // até ~7× a cotação, passos de 0,5%
      if (at(pr).status === 'vender') { triggerPrice = pr; break; }
    }
  }
  const gain = held && price0 ? now.mv - p!.costBasis : 0;
  const saleValue = now.mv;
  let taxEstimate: number | null = null;
  let taxNote = '';
  if (held && price0) {
    if (gain <= 0) { taxEstimate = 0; taxNote = 'sem ganho: não há IR (o prejuízo compensa ganhos futuros da mesma cesta)'; }
    else if (a.class === 'acao' && saleValue <= s.tax.stockSwingMonthlyExempt) { taxEstimate = 0; taxNote = `isento: vendas de ações até R$ ${s.tax.stockSwingMonthlyExempt.toLocaleString('pt-BR')} no mês (Lei 11.033/2004, art. 3º), se não houver outras vendas no mês`; }
    else if (a.class === 'cripto' && saleValue <= s.tax.cryptoMonthlyExempt) { taxEstimate = 0; taxNote = `isento: alienações de cripto até R$ ${s.tax.cryptoMonthlyExempt.toLocaleString('pt-BR')} no mês`; }
    else {
      const rate = a.class === 'fii' ? s.tax.fiiGainRate : a.class === 'etf' ? s.tax.etfGainRate : a.class === 'cripto' ? s.tax.cryptoGainRate : s.tax.stockSwingRate;
      taxEstimate = gain * (rate / 100);
      taxNote = `${rate}% sobre o ganho${a.class === 'fii' ? ' (FII, sem isenção — Lei 8.668/1993)' : a.class === 'etf' ? ' (ETF, sem isenção)' : ''}`;
    }
  }
  return {
    asset: a, price: price0, avgPrice: held ? p!.avgPrice : 0, qty, cost: held ? p!.costBasis : 0, marketValue: now.mv, income,
    totalReturn: now.totalReturn, totalReturnPct: now.totalReturnPct, cdiPct, ipcaPlusPct, dyProjected: now.dyProjected,
    exitPrice, bookExitPrice, graham, premium: now.premium, pl: now.pl, plAvg, pvp: now.pvp, pvpAvg,
    criteria: now.c, signals: now.signals, metaHit: now.metaHit, status: now.status,
    reviewThesis: now.status === 'nao_vender' && sustSignal === true,
    triggerPrice, taxNote, taxEstimate,
  };
}
