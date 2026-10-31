// brapi.dev — cotações e proventos da B3 (dados com atraso). Token gratuito em https://brapi.dev
import type { Distribution, DistributionType } from '../domain/types';
import { uid } from '../domain/util';

export interface BrapiQuote {
  ticker: string;
  price: number;
  time: string;
  name?: string;
  distributions: Distribution[];
  dividendsAvailable: boolean;
}

const mapLabel = (l: string): DistributionType => {
  const s = (l || '').toUpperCase();
  if (s.includes('JCP') || s.includes('JUROS')) return 'jcp';
  if (s.includes('REND')) return 'rendimento';
  if (s.includes('AMORT')) return 'amortizacao';
  if (s.includes('DIVID')) return 'dividendo';
  return 'outro';
};

async function call(ticker: string, token: string, dividends: boolean) {
  const qs = new URLSearchParams();
  if (token) qs.set('token', token);
  if (dividends) qs.set('dividends', 'true');
  const res = await fetch(`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?${qs}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.message || `HTTP ${res.status}`);
  return body;
}

export async function fetchBrapi(ticker: string, token: string): Promise<BrapiQuote> {
  let body: any;
  let dividendsAvailable = true;
  try {
    body = await call(ticker, token, true);
  } catch (e) {
    // alguns planos não liberam o módulo de dividendos: tenta só a cotação
    body = await call(ticker, token, false);
    dividendsAvailable = false;
    if (!body) throw e;
  }
  const r = body.results?.[0];
  if (!r || typeof r.regularMarketPrice !== 'number') throw new Error('Resposta sem cotação');
  const cash: any[] = r.dividendsData?.cashDividends || [];
  const distributions: Distribution[] = cash
    .filter((d) => typeof d.rate === 'number' && d.rate > 0 && (d.lastDatePrior || d.paymentDate))
    .map((d) => ({
      id: uid(),
      exDate: String(d.lastDatePrior || d.paymentDate).slice(0, 10),
      payDate: d.paymentDate ? String(d.paymentDate).slice(0, 10) : null,
      value: d.rate,
      type: mapLabel(d.label),
      recurring: true,
      source: 'brapi.dev',
    }));
  return { ticker, price: r.regularMarketPrice, time: r.regularMarketTime || new Date().toISOString(), name: r.longName, distributions, dividendsAvailable: dividendsAvailable && !!r.dividendsData };
}
