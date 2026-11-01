// Aplica os dados coletados pelo robô diário (market-data.json, publicado junto com o site).
// Não precisa de token. Preserva o que o usuário editou: cotações manuais mais recentes,
// marcações de extraordinário, proventos lançados à mão e preços anuais digitados.
import { useStore } from '../store/store';
import { useMarket } from '../store/market';
import type { MarketData } from '../domain/market';
import type { Asset, Distribution } from '../domain/types';
import { suspectExtraordinary } from '../domain/calc/dividends';
import { planAutoProventos } from '../domain/calc/proventos';
import { uid } from '../domain/util';

export const ROBOT_SOURCE = 'B3';
/** Proventos vindos de coleta automática (podem ser substituídos pela próxima coleta). */
const isAuto = (src: string) => /^(B3|Yahoo|brapi)/.test(src);

export interface MarketFile extends Omit<MarketData, 'generatedAt'> {
  generatedAt: string;
  quotes: Record<string, { price: number; time: string; source?: string }>;
  dividends: Record<string, { exDate: string; value: number; type?: Distribution['type']; payDate?: string | null; source?: string }[]>;
  annualPrices: Record<string, Record<string, number>>;
  tesouro: Record<string, { dataBase: string; taxaCompra: number; taxaVenda: number; puCompra: number; puVenda: number; puBase: number }>;
  macro: Record<string, { value: number; date: string }>;
  errors: string[];
}

export interface MarketReport {
  generatedAt: string | null;
  quotes: number;
  dividendsChanged: number;
  tesouro: number;
  macro: number;
  covered: Set<string>;
  error?: string;
}

const days = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
const same = (a: Distribution, b: { exDate: string; value: number }) => days(a.exDate, b.exDate) <= 5 && Math.abs(a.value - b.value) < 1e-6;

export async function fetchMarketFile(): Promise<MarketFile> {
  const r = await fetch(`./market-data.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 404 ? 'Arquivo de dados do robô ainda não publicado.' : `HTTP ${r.status}`);
  return r.json();
}

/** Monta a nova lista de proventos de um ativo a partir do robô, mantendo as escolhas do usuário. */
export function mergeRobotDistributions(a: Asset, robot: { exDate: string; value: number; type?: Distribution['type']; payDate?: string | null; source?: string }[]): Distribution[] {
  const manual = a.distributions.filter((d) => !isAuto(d.source));
  const prevAuto = a.distributions.filter((d) => isAuto(d.source));
  const fresh: Distribution[] = [];
  const isNew = new Set<string>();
  for (const r of robot) {
    if (manual.some((m) => same(m, r))) continue; // já lançado à mão/importado
    const prev = prevAuto.find((p) => same(p, r));
    const d: Distribution = {
      id: prev?.id ?? uid(),
      exDate: r.exDate,
      payDate: r.payDate ?? prev?.payDate ?? null,
      value: r.value,
      // tipo informado pela B3 prevalece; sem tipo na fonte, mantém o que o usuário marcou
      type: r.source === 'B3' && r.type ? r.type : prev?.type ?? r.type ?? (a.class === 'fii' ? 'rendimento' : 'dividendo'),
      recurring: prev?.recurring ?? true,
      source: r.source || ROBOT_SOURCE,
    };
    if (!prev) isNew.add(d.id);
    fresh.push(d);
  }
  const all = [...manual, ...fresh].sort((x, y) => x.exDate.localeCompare(y.exDate));
  // pagamentos atípicos recém-chegados entram como extraordinários (revisável na ficha)
  const sus = suspectExtraordinary({ ...a, distributions: all });
  return all.map((d) => (isNew.has(d.id) && sus.has(d.id) ? { ...d, recurring: false } : d));
}

const sig = (ds: Distribution[]) => JSON.stringify(ds.map((d) => [d.exDate, d.value, d.type, d.recurring, d.source, d.payDate]));

export async function applyMarketData(): Promise<MarketReport> {
  const rep: MarketReport = { generatedAt: null, quotes: 0, dividendsChanged: 0, tesouro: 0, macro: 0, covered: new Set() };
  let m: MarketFile;
  try {
    m = await fetchMarketFile();
  } catch (e: any) {
    rep.error = e?.message || String(e);
    return rep;
  }
  rep.generatedAt = m.generatedAt;
  // dados de mercado: armazenamento próprio, separado do livro
  useMarket.getState().setMarket({
    generatedAt: m.generatedAt,
    calendar: m.calendar || {},
    companies: m.companies || {},
    fiis: m.fiis || {},
    risk: m.risk || {},
    monthEnd: m.monthEnd || {},
    series: m.series || {},
    ntnb: m.ntnb || null,
    segments: m.segments || {},
    stockEvents: m.stockEvents || {},
    sources: m.sources || {},
    errors: m.errors || [],
  });
  const st = useStore.getState();
  for (const a of st.assets) {
    const t = a.ticker.toUpperCase();
    // cotação: só substitui se a do robô for mais nova
    const q = m.quotes[t];
    if (q && a.class !== 'tesouro') {
      rep.covered.add(a.id);
      if (!a.quote.date || q.time > a.quote.date || (a.quote.price !== q.price && q.time >= a.quote.date)) {
        if (a.quote.price !== q.price || a.quote.date !== q.time) {
          useStore.getState().setQuote(a.id, q.price, q.time, `${q.source || (a.class === 'cripto' ? 'CoinGecko' : 'B3')} · robô`);
          rep.quotes++;
        }
      }
    }
    // proventos por unidade
    const dv = m.dividends[t];
    if (dv && (a.class === 'acao' || a.class === 'fii')) {
      const cur = useStore.getState().assets.find((x) => x.id === a.id)!;
      const next = mergeRobotDistributions(cur, dv);
      if (sig(next) !== sig(cur.distributions)) {
        useStore.getState().setDistributions(a.id, next);
        rep.dividendsChanged++;
      }
    }
    // preço médio anual (para DY de 5 e 10 anos): só preenche anos vazios
    const ap = m.annualPrices[t];
    if (ap) {
      const cur = useStore.getState().assets.find((x) => x.id === a.id)!;
      const missing = Object.entries(ap).filter(([y]) => cur.annualPrices[y] === undefined);
      if (missing.length) useStore.getState().updateAsset(a.id, { annualPrices: { ...cur.annualPrices, ...Object.fromEntries(missing) } });
    }
    // Tesouro Direto: PU de venda (valor de resgate antecipado) e taxa de compra atual
    const td = m.tesouro[t];
    if (td && a.class === 'tesouro') {
      rep.covered.add(a.id);
      const time = td.dataBase + 'T18:00:00.000Z';
      if (!a.quote.date || time > a.quote.date) {
        if (a.quote.price !== td.puVenda) {
          useStore.getState().setQuote(a.id, td.puVenda, time, 'Tesouro Transparente (PU de venda) via robô');
          rep.tesouro++;
        }
      }
      const cur = useStore.getState().assets.find((x) => x.id === a.id)!;
      if (cur.fixed && (cur.fixed.marketRate !== td.taxaCompra || cur.fixed.marketRateDate !== td.dataBase))
        useStore.getState().updateAsset(a.id, { fixed: { ...cur.fixed, marketRate: td.taxaCompra, marketRateDate: td.dataBase } });
    }
  }
  for (const mc of useStore.getState().macro) {
    const v = m.macro[mc.key];
    if (v && (v.value !== mc.value || v.date !== mc.date)) {
      useStore.getState().setMacro({ ...mc, value: v.value, date: v.date, fetchedAt: m.generatedAt });
      rep.macro++;
    }
  }
  return rep;
}

/** Roda o lançamento automático de proventos pela data-com e grava o plano (idempotente). */
export function runAutoProventos(): { created: number; reversed: number; upcoming: number; divergences: number } {
  const st = useStore.getState();
  const cal = useMarket.getState().calendar;
  if (!cal || !Object.keys(cal).length) return { created: 0, reversed: 0, upcoming: 0, divergences: 0 };
  const plan = planAutoProventos(st.assets, st.transactions, cal, st.settings);
  st.applyAutoPlan(plan);
  return { created: plan.create.length, reversed: plan.reverse.length, upcoming: plan.upcoming.length, divergences: plan.divergences.length };
}
