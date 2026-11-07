// Robô de dados de mercado (GitHub Actions; sem CORS e sem token).
// Hierarquia de fontes: B3 → CVM dados abertos → Banco Central SGS → Tesouro Nacional; Yahoo Finance
// só como fallback identificado. Gera public/market-data.json, publicado junto com o site.
// Uso: npx vite-node scripts/fetch-market.ts
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { dataComFromEx, addBusinessDays, isBusinessDay } from '../src/domain/b3calendar';
import type { CalendarItem } from '../src/domain/calc/proventos';
import type { CompanyFin, FiiInfo, FinYear, RiskStats } from '../src/domain/market';

const SITE = 'https://aj8067910-dotcom.github.io/invest/market-data.json';
const UA = { 'User-Agent': 'Mozilla/5.0 (radar-de-investimentos)' };
const now = new Date().toISOString();
const today = now.slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cfg = JSON.parse(await readFile(new URL('../market/tickers.json', import.meta.url), 'utf8'));
const out: any = {
  generatedAt: now,
  quotes: {},
  dividends: {},
  annualPrices: {},
  tesouro: {},
  macro: {},
  calendar: {},
  stockEvents: {},
  companies: {},
  fiis: {},
  risk: {},
  monthEnd: {},
  series: {},
  ntnb: null,
  segments: {},
  classification: {},
  sources: {
    quotes: 'B3 — COTAHIST (fechamento oficial); fallback Yahoo Finance',
    calendar: 'B3 — proventos em dinheiro (listados); fallback Yahoo Finance (data-com = pregão anterior à data-ex)',
    companies: 'CVM — dados abertos DFP (consolidado)',
    fiis: 'CVM — Informe Mensal Estruturado de FII',
    series: 'Banco Central — SGS 4391 (CDI mensal) e 433 (IPCA mensal)',
    tesouro: 'Tesouro Nacional — Tesouro Transparente',
  },
  errors: [] as string[],
};
const err = (m: string) => {
  out.errors.push(m);
  console.log('ERRO', m);
};

async function get(url: string, tries = 3): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      // tempo-limite por requisição: uma fonte travada não segura o robô inteiro (achado D-01)
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(90000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(1500 * i);
    }
  }
}
const getJson = async (u: string) => (await get(u)).json();
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');
const brNum = (s: unknown) => Number(String(s ?? '').replace(/\./g, '').replace(',', '.'));
const brDate = (s: unknown) => (s && /^\d{2}\/\d{2}\/\d{4}$/.test(String(s)) ? String(s).split('/').reverse().join('-') : null);

// estado anterior publicado: preserva o histórico do calendário e dados pesados recentes
let prev: any = {};
try {
  prev = await (await get(SITE, 1)).json();
} catch {
  console.log('sem arquivo anterior publicado');
}

const stocks: string[] = cfg.b3;
const isFii = (t: string) => /11$/.test(t) && (cfg.fiis || []).includes(t);
const code4 = (t: string) => t.slice(0, 4);
const isinSuffix = (t: string) => (/11$/.test(t) ? (isFii(t) ? 'CTF' : 'CDAM') : /3$/.test(t) ? 'ACNOR' : /4$/.test(t) ? 'ACNPR' : /5$/.test(t) ? 'ACNPA' : /6$/.test(t) ? 'ACNPB' : '');
const mapLabel = (l: string): CalendarItem['type'] | null => {
  const s = l.toUpperCase();
  if (s.includes('JRS') || s.includes('JUROS')) return 'jcp';
  if (s.includes('DIVID')) return 'dividendo';
  if (s.includes('REND')) return 'rendimento';
  if (s.includes('AMORT') || s.includes('RESTIT')) return 'amortizacao';
  return null;
};

// ───────── 1) B3: proventos, eventos, segmento e código CVM ─────────
const codeCVM: Record<string, string> = {};
for (const t of stocks) {
  try {
    const fii = isFii(t);
    const url = fii
      ? `https://sistemaswebb3-listados.b3.com.br/fundsProxy/fundsCall/GetListedSupplementFunds/${b64({ cnpj: '0', identifierFund: code4(t), typeFund: 7 })}`
      : `https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetListedSupplementCompany/${b64({ issuingCompany: code4(t), language: 'pt-br' })}`;
    const raw = await getJson(url);
    const d = Array.isArray(raw) ? raw[0] : raw;
    if (!d) throw new Error('resposta vazia');
    if (d.codeCVM) codeCVM[t] = String(d.codeCVM);
    if (d.segment && !fii) out.segments[t] = d.segment;
    // classificação setorial oficial da B3: "Setor / Subsetor / Segmento"
    if (!fii && d.codeCVM) {
      try {
        const det = await getJson(`https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetDetail/${b64({ codeCVM: String(d.codeCVM), language: 'pt-br' })}`);
        const [setor, subsetor, segmento] = String(det?.industryClassification || '').split('/').map((x: string) => x.trim());
        if (setor) out.classification[t] = { setor, subsetor: subsetor || null, segmento: segmento || null, source: 'B3 — classificação setorial' };
      } catch (e: any) {
        if (prev.classification?.[t]) out.classification[t] = prev.classification[t];
      }
    }
    const suffix = isinSuffix(t);
    const mine = (isin: string) => !suffix || String(isin || '').includes(code4(t) + suffix);
    const items: CalendarItem[] = (d.cashDividends || [])
      .filter((c: any) => mine(c.isinCode || c.assetIssued))
      .map((c: any) => {
        const type = mapLabel(c.label || '');
        const dataCom = brDate(c.lastDatePrior);
        if (!type || !dataCom) return null;
        return { type, perUnit: brNum(c.rate), dataCom, dataEx: addBusinessDays(dataCom, 1), payDate: brDate(c.paymentDate), approvedOn: brDate(c.approvedOn), source: 'B3', collectedAt: now } as CalendarItem;
      })
      .filter(Boolean);
    // une com o histórico já publicado (a B3 só devolve a janela recente)
    const old: CalendarItem[] = (prev.calendar?.[t] || []).filter((x: CalendarItem) => x.source === 'B3');
    const key = (x: CalendarItem) => `${x.type}|${x.dataCom}`;
    const map = new Map(old.map((x) => [key(x), x]));
    for (const x of items) map.set(key(x), x); // aviso retificado substitui o anterior
    out.calendar[t] = [...map.values()].sort((a, b) => a.dataCom.localeCompare(b.dataCom));
    out.stockEvents[t] = (d.stockDividends || [])
      .filter((c: any) => mine(c.isinCode || c.assetIssued))
      .map((c: any) => ({ label: c.label, factor: brNum(c.factor), dataCom: brDate(c.lastDatePrior), approvedOn: brDate(c.approvedOn), source: 'B3', collectedAt: now }));
  } catch (e: any) {
    err(`B3 ${t}: ${e.message}`);
    if (prev.calendar?.[t]) out.calendar[t] = prev.calendar[t];
  }
  await sleep(300);
}

// ───────── 2) B3 COTAHIST: fechamento oficial e liquidez (últimos 21 pregões) ─────────
const volumes: Record<string, number[]> = {};
const closes: Record<string, { price: number; date: string }> = {};
{
  let d = today;
  let got = 0;
  let tries = 0;
  while (got < 21 && tries < 40) {
    tries++;
    if (!isBusinessDay(d) || d === today) {
      d = addBusinessDays(d, -1);
      continue;
    }
    const tag = d.split('-').reverse().join('');
    try {
      const r = await get(`https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D${tag}.ZIP`, 1);
      const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
      const txt = new TextDecoder('latin1').decode(Object.values(files)[0]);
      for (const line of txt.split('\n')) {
        if (!line.startsWith('01')) continue;
        const tk = line.slice(12, 24).trim();
        if (!stocks.includes(tk) || line.slice(24, 27) !== '010') continue; // mercado à vista
        const close = Number(line.slice(108, 121)) / 100;
        const vol = Number(line.slice(170, 188)) / 100;
        (volumes[tk] ||= []).push(vol);
        if (!closes[tk]) closes[tk] = { price: close, date: d };
      }
      got++;
    } catch {
      /* pregão sem arquivo ainda */
    }
    d = addBusinessDays(d, -1);
  }
  console.log(`COTAHIST: ${got} pregões, ${Object.keys(closes).length} ativos`);
}

// ───────── 3) Yahoo (fallback): histórico diário para risco, fim de mês, preço médio anual e proventos antigos ─────────
for (const t of stocks) {
  try {
    const d = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${t}.SA?range=10y&interval=1d&events=div`);
    const r = d.chart?.result?.[0];
    const ts: number[] = r?.timestamp || [];
    const cl: (number | null)[] = r?.indicators?.quote?.[0]?.close || [];
    const vo: (number | null)[] = r?.indicators?.quote?.[0]?.volume || [];
    const days = ts.map((x, i) => ({ date: new Date(x * 1000 - 3 * 3600 * 1000).toISOString().slice(0, 10), close: cl[i], vol: vo[i] })).filter((x) => x.close != null) as { date: string; close: number; vol: number | null }[];
    const official = closes[t];
    out.quotes[t] = official
      ? { price: official.price, time: official.date + 'T18:00:00.000Z', source: 'B3 (COTAHIST)' }
      : r?.meta?.regularMarketPrice
        ? { price: r.meta.regularMarketPrice, time: new Date(r.meta.regularMarketTime * 1000).toISOString(), source: 'Yahoo Finance (fallback)' }
        : undefined;
    // fim de mês
    const me = new Map<string, number>();
    for (const x of days) me.set(x.date.slice(0, 7), x.close);
    out.monthEnd[t] = [...me.entries()];
    // preço médio anual
    const byY: Record<string, number[]> = {};
    for (const x of days) (byY[x.date.slice(0, 4)] ||= []).push(x.close);
    const cy = new Date().getFullYear();
    out.annualPrices[t] = Object.fromEntries(Object.entries(byY).filter(([y, xs]) => Number(y) < cy && xs.length >= 150).map(([y, xs]) => [y, Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 100) / 100]));
    // risco 12 meses
    const last = days.slice(-252);
    if (last.length > 30) {
      const rets = last.slice(1).map((x, i) => Math.log(x.close / last[i].close));
      const mean = rets.reduce((s, v) => s + v, 0) / rets.length;
      const vol = Math.sqrt(rets.reduce((s, v) => s + (v - mean) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252) * 100;
      let peak = last[0].close;
      let mdd = 0;
      for (const x of last) {
        peak = Math.max(peak, x.close);
        mdd = Math.min(mdd, x.close / peak - 1);
      }
      const vols = volumes[t];
      const yahooVol = last.slice(-21).map((x) => (x.vol || 0) * x.close);
      out.risk[t] = {
        ticker: t,
        avgDailyVolume: vols?.length ? vols.reduce((s, v) => s + v, 0) / vols.length : yahooVol.reduce((s, v) => s + v, 0) / yahooVol.length,
        volatility12m: vol,
        high52: Math.max(...last.map((x) => x.close)),
        low52: Math.min(...last.map((x) => x.close)),
        maxDrawdown12m: mdd * 100,
        priceChange12m: (last[last.length - 1].close / last[0].close - 1) * 100,
        source: vols?.length ? 'B3 COTAHIST (liquidez) + Yahoo Finance (preços diários)' : 'Yahoo Finance (fallback)',
        dataBase: last[last.length - 1].date,
        collectedAt: now,
      } satisfies RiskStats;
    }
    // proventos por unidade: B3 tipada; anos fora da janela da B3 vêm do Yahoo (data-ex → data-com)
    const b3 = (out.calendar[t] || []) as CalendarItem[];
    const b3Start = b3.length ? b3[0].dataCom : '9999';
    const yahoo = Object.values(r?.events?.dividends || {})
      .map((x: any) => ({ dataCom: dataComFromEx(new Date(x.date * 1000 - 3 * 3600 * 1000).toISOString().slice(0, 10)), value: Math.round(x.amount * 1e8) / 1e8 }))
      .filter((x) => x.value > 0 && x.dataCom < b3Start);
    out.dividends[t] = [
      ...yahoo.map((x) => ({ exDate: x.dataCom, value: x.value, type: isFii(t) ? 'rendimento' : 'dividendo', source: 'Yahoo Finance (fallback; data-com = pregão anterior à data-ex; tipo não informado)' })),
      ...b3.filter((x) => x.type !== 'amortizacao' || isFii(t)).map((x) => ({ exDate: x.dataCom, value: x.perUnit, type: x.type, payDate: x.payDate, source: 'B3' })),
    ].sort((a, b) => a.exDate.localeCompare(b.exDate));
    // para o lançamento automático: completa o calendário com o Yahoo antes da janela da B3 (confiabilidade estimada)
    out.calendar[t] = [...yahoo.map((x) => ({ type: isFii(t) ? 'rendimento' : 'dividendo', perUnit: x.value, dataCom: x.dataCom, dataEx: addBusinessDays(x.dataCom, 1), payDate: null, source: 'Yahoo Finance (fallback)', collectedAt: now })), ...b3];
  } catch (e: any) {
    err(`Yahoo ${t}: ${e.message}`);
    if (closes[t]) out.quotes[t] = { price: closes[t].price, time: closes[t].date + 'T18:00:00.000Z', source: 'B3 (COTAHIST)' };
  }
  await sleep(350);
}

// ───────── 4) Cripto (CoinGecko) ─────────
try {
  const ids = Object.values(cfg.crypto).join(',');
  const d = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=brl&include_last_updated_at=true`);
  for (const [t, id] of Object.entries(cfg.crypto) as [string, string][]) if (d[id]?.brl) out.quotes[t] = { price: d[id].brl, time: new Date(d[id].last_updated_at * 1000).toISOString(), source: 'CoinGecko' };
} catch (e: any) {
  err(`Cripto: ${e.message}`);
}

// ───────── 5) Tesouro Nacional: PU, taxa, NTN-B de referência e PU de fim de mês ─────────
try {
  const txt = await (await get('https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv')).text();
  const lines = txt.split(/\r?\n/);
  const toIso = (s: string) => s.split('/').reverse().join('-');
  for (const [t, { tipo, vencimento }] of Object.entries(cfg.tesouro) as [string, any][]) {
    let best: any = null;
    const me = new Map<string, number>();
    for (const l of lines) {
      const c = l.split(';');
      if (c[0] !== tipo || c[1] !== vencimento) continue;
      const dt = toIso(c[2]);
      const pu = brNum(c[6]);
      const m = dt.slice(0, 7);
      if (!me.has(m) || dt > (me as any)[m + 'd']) {
        me.set(m, pu);
        (me as any)[m + 'd'] = dt;
      }
      if (!best || dt > best.dataBase) best = { dataBase: dt, taxaCompra: brNum(c[3]), taxaVenda: brNum(c[4]), puCompra: brNum(c[5]), puVenda: pu, puBase: brNum(c[7]) };
    }
    if (best) out.tesouro[t] = { ...best, tipo, vencimento: toIso(vencimento) };
    out.monthEnd[t] = [...me.entries()].sort();
  }
  // NTN-B de referência: Tesouro IPCA+ com Juros Semestrais de vencimento mais próximo de 10 anos
  let ref: any = null;
  const target = new Date().getFullYear() + 10;
  let lastDate = '';
  for (const l of lines) {
    const c = l.split(';');
    if (c[0] === 'Tesouro IPCA+ com Juros Semestrais' && toIso(c[2]) > lastDate) lastDate = toIso(c[2]);
  }
  for (const l of lines) {
    const c = l.split(';');
    if (c[0] !== 'Tesouro IPCA+ com Juros Semestrais' || toIso(c[2]) !== lastDate) continue;
    const y = Number(c[1].slice(6));
    if (!ref || Math.abs(y - target) < Math.abs(ref.y - target)) ref = { y, rate: brNum(c[3]), maturity: toIso(c[1]) };
  }
  if (ref) out.ntnb = { rate: ref.rate, maturity: ref.maturity, date: lastDate, source: 'Tesouro Transparente (NTN-B, taxa de compra)' };
  // série mensal da taxa real da NTN-B (~10 anos) no último dia de cada mês: base do "IPCA+ do mesmo período"
  const byMonth = new Map<string, { d: string; best: { gap: number; rate: number } | null }>();
  for (const l of lines) {
    const c = l.split(';');
    if (c[0] !== 'Tesouro IPCA+ com Juros Semestrais') continue;
    const d = toIso(c[2]);
    const m = d.slice(0, 7);
    const rate = brNum(c[3]) || brNum(c[4]);
    if (!rate) continue;
    const gap = Math.abs(Number(c[1].slice(6)) - (Number(d.slice(0, 4)) + 10));
    const cur = byMonth.get(m);
    if (!cur || d > cur.d) byMonth.set(m, { d, best: { gap, rate } });
    else if (d === cur.d && (!cur.best || gap < cur.best.gap)) cur.best = { gap, rate };
  }
  out.series.ntnb = [...byMonth.entries()].filter(([, v]) => v.best).map(([m, v]) => [m, v.best!.rate] as [string, number]).sort((x, y) => x[0].localeCompare(y[0]));
} catch (e: any) {
  err(`Tesouro: ${e.message}`);
}

// ───────── 6) Banco Central: último valor e séries mensais ─────────
for (const [k, s] of Object.entries({ selic: 432, ipca12: 13522, cdi: 4389, usd: 1 })) {
  try {
    const [row] = await getJson(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${s}/dados/ultimos/1?formato=json`);
    out.macro[k] = { value: Number(String(row.valor).replace(',', '.')), date: row.data.split('/').reverse().join('-') };
  } catch (e: any) {
    err(`Banco Central ${k}: ${e.message}`);
  }
}
for (const [k, s] of Object.entries({ cdi: 4391, ipca: 433 })) {
  try {
    const rows = await getJson(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${s}/dados?formato=json&dataInicial=01/01/2010&dataFinal=${today.split('-').reverse().join('/')}`);
    out.series[k] = rows.map((r: any) => [r.data.split('/').reverse().join('-').slice(0, 7), Number(String(r.valor).replace(',', '.'))]);
  } catch (e: any) {
    err(`Banco Central série ${k}: ${e.message}`);
    if (prev.series?.[k]) out.series[k] = prev.series[k];
  }
}

// ───────── 7) CVM: DFP (5 anos) — renovado semanalmente ─────────
const fundAge = prev.companiesCollectedAt ? (Date.now() - new Date(prev.companiesCollectedAt).getTime()) / 86400000 : 999;
const FUND_SCHEMA = 4; // muda quando o mapeamento das contas muda → força nova coleta
if (fundAge < 7 && prev.companiesSchema === FUND_SCHEMA && prev.companies && Object.keys(prev.companies).length) {
  out.companies = prev.companies;
  out.companiesCollectedAt = prev.companiesCollectedAt;
} else {
  const wanted = new Map(Object.entries(codeCVM).filter(([t]) => !isFii(t)).map(([t, c]) => [String(Number(c)), t]));
  const years: Record<string, Record<number, FinYear>> = {};
  const meta: Record<string, { name: string; dataBase: string; financial: boolean }> = {};
  const parseCsv = (buf: Uint8Array) => {
    const lines = new TextDecoder('latin1').decode(buf).split(/\r?\n/);
    const h = lines[0].split(';');
    return lines.slice(1).filter(Boolean).map((l) => {
      const c = l.split(';');
      return Object.fromEntries(h.map((k, i) => [k, c[i]]));
    });
  };
  const cy = new Date().getFullYear();
  for (let y = cy - 1; y >= cy - 6; y--) {
    try {
      const r = await get(`https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${y}.zip`);
      const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
      const pick = (name: string) => {
        const con = files[`dfp_cia_aberta_${name}_con_${y}.csv`];
        const ind = files[`dfp_cia_aberta_${name}_ind_${y}.csv`];
        return [...(con ? parseCsv(con) : []), ...(ind ? parseCsv(ind).map((r) => ({ ...r, __ind: '1' })) : [])];
      };
      const cnpjToCvm = new Map<string, string>();
      for (const row of parseCsv(files[`dfp_cia_aberta_${y}.csv`])) cnpjToCvm.set(row.CNPJ_CIA, String(Number(row.CD_CVM)));
      const rows = [...pick('BPA'), ...pick('BPP'), ...pick('DRE'), ...pick('DFC_MI'), ...pick('DFC_MD')].filter((r) => wanted.has(String(Number(r.CD_CVM))) && r.ORDEM_EXERC === 'ÚLTIMO');
      // prefere consolidado; usa individual se a empresa não tiver consolidado OU se o consolidado vier zerado
      // (ex.: TIM S.A. sem controladas publica o consolidado com todas as contas em 0)
      const hasCon = new Set(rows.filter((r) => !r.__ind && r.CD_CONTA === '1' && Number(r.VL_CONTA) > 0).map((r) => r.CD_CVM));
      const use = rows.filter((r) => !r.__ind || !hasCon.has(r.CD_CVM));
      for (const r of use) {
        const t = wanted.get(String(Number(r.CD_CVM)))!;
        const fy = Number(r.DT_FIM_EXERC.slice(0, 4));
        const Y = ((years[t] ||= {})[fy] ||= { year: fy });
        const v = Number(r.VL_CONTA) * (r.ESCALA_MOEDA === 'MIL' ? 1000 : 1);
        const cd = r.CD_CONTA;
        const ds = (r.DS_CONTA || '').toLowerCase();
        meta[t] = { name: r.DENOM_CIA, dataBase: r.DT_REFER > (meta[t]?.dataBase || '') ? r.DT_REFER : meta[t].dataBase, financial: meta[t]?.financial || (cd === '3.01' && /intermedia/.test(ds)) };
        if (cd === '1') Y.totalAssets = v;
        else if (cd === '1.01') Y.currentAssets = v;
        else if (cd === '1.01.01' || cd === '1.01.02') Y.cash = (Y.cash ?? 0) + v;
        else if (cd === '2.01') Y.currentLiabilities = v;
        else if (cd === '2.02') Y.nonCurrentLiabilities = v;
        else if (/^2\.0\d$/.test(cd) && /patrim.nio l.quido/.test(ds)) Y.equity = v;
        else if (/^2\.0\d\.04$/.test(cd) && /reservas de lucro/.test(ds)) Y.retainedEarnings = v;
        // dívida bancária: só quando a conta é de fato empréstimos/financiamentos/debêntures
        // (no plano de seguradoras e holdings a 2.02.01 é "Passivo Exigível a Longo Prazo")
        else if (cd === '2.01.04') Y.shortDebt = /empr.stimo|financiamento|deb.nture/.test(ds) ? v : 0;
        else if (cd === '2.02.01') Y.longDebt = /empr.stimo|financiamento|deb.nture/.test(ds) ? v : 0;
        else if (cd === '3.01') Y.revenue = v;
        else if (cd === '3.03') Y.grossProfit = v;
        else if (cd === '3.05') Y.ebit = v;
        else if (cd === '3.06.02') Y.financialExpense = Math.abs(v);
        // lucro líquido: a conta muda de número conforme o plano (3.11 indústria; 3.09 Itaú; 3.11 Bradesco).
        // Prefere a parcela atribuída aos sócios da controladora (base do LPA e do payout).
        else if (/^3\.\d\d$/.test(cd) && /lucro.*per.odo/.test(ds) && !/antes|opera..es continuadas/.test(ds)) { if (v !== 0) (Y as any).__niTotal = v; }
        else if (/^3\.\d\d\.01$/.test(cd) && /controladora/.test(ds)) { if (v !== 0) (Y as any).__niCtrl = v; }
        // LPA básico informado (R$/ação, sem escala): usado para conferir a escala da quantidade de ações
        else if (/^3\.99\.01\.0\d$/.test(cd) && Number(r.VL_CONTA) !== 0 && !(Y as any).__lpa) (Y as any).__lpa = Number(r.VL_CONTA);
        else if (cd === '6.01') Y.fco = v;
        else if (cd.startsWith('6.01.01') && /deprecia|amortiza|exaust/.test(ds)) Y.depreciation = (Y.depreciation ?? 0) + Math.abs(v);
        else if (cd.startsWith('6.02') && v < 0 && /imobilizad|intang/.test(ds)) Y.capex = (Y.capex ?? 0) + Math.abs(v);
        else if (cd.startsWith('6.03') && v < 0 && /dividend|juros sobre (o )?capital|remunera..o aos acionistas/.test(ds)) Y.dividendsPaid = (Y.dividendsPaid ?? 0) + Math.abs(v);
      }
      const comp = files[`dfp_cia_aberta_composicao_capital_${y}.csv`];
      if (comp) for (const row of parseCsv(comp)) {
        const cvm = cnpjToCvm.get(row.CNPJ_CIA);
        const t = cvm ? wanted.get(cvm) : undefined;
        if (!t) continue;
        const fy = Number(row.DT_REFER.slice(0, 4));
        const Y = ((years[t] ||= {})[fy] ||= { year: fy });
        Y.shares = Number(row.QT_ACAO_TOTAL_CAP_INTEGR || 0) - Number(row.QT_ACAO_TOTAL_TESOURO || 0);
      }
      console.log(`DFP ${y}: ok`);
    } catch (e: any) {
      err(`CVM DFP ${y}: ${e.message}`);
    }
  }
  for (const ys of Object.values(years)) for (const Y of Object.values(ys) as any[]) {
    const ni = Y.__niCtrl ?? Y.__niTotal;
    if (ni !== undefined) Y.netIncome = ni;
    // a composição do capital vem ora em unidades, ora em milhares (sem coluna de escala):
    // confere com lucro ÷ LPA informado na DRE; sem LPA, < 100 milhões de ações é tratado como milhares
    if (Y.shares) {
      const est = Y.__lpa && Y.netIncome ? Math.abs(Y.netIncome / Y.__lpa) : null;
      const k = est ? (Math.abs(Math.log10((Y.shares * 1000) / est)) < Math.abs(Math.log10(Y.shares / est)) ? 1000 : 1) : Y.shares < 1e8 ? 1000 : 1;
      Y.shares *= k;
    }
    delete Y.__niCtrl;
    delete Y.__niTotal;
    delete Y.__lpa;
  }
  for (const [t, ys] of Object.entries(years)) {
    out.companies[t] = {
      ticker: t,
      codeCVM: codeCVM[t] || null,
      name: meta[t]?.name || t,
      segment: out.segments[t] || null,
      financial: !!meta[t]?.financial,
      unitShares: cfg.units?.[t] ?? 1,
      years: Object.values(ys).sort((a, b) => a.year - b.year).slice(-6),
      source: 'CVM — DFP (dados abertos)',
      dataBase: meta[t]?.dataBase || '',
      collectedAt: now,
    } satisfies CompanyFin;
  }
  out.companiesCollectedAt = now;
  out.companiesSchema = FUND_SCHEMA;
}

// ───────── 8) CVM: Informe Mensal Estruturado de FII ─────────
try {
  const cy = new Date().getFullYear();
  let files: Record<string, Uint8Array> | null = null;
  let yy = cy;
  for (; yy >= cy - 1 && !files; yy--) {
    try {
      const r = await get(`https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_${yy}.zip`);
      files = unzipSync(new Uint8Array(await r.arrayBuffer()));
    } catch {
      /* ano sem arquivo */
    }
  }
  if (files) {
    const parse = (n: string) => {
      const f = Object.entries(files!).find(([k]) => k.includes(n))?.[1];
      if (!f) return [];
      const lines = new TextDecoder('latin1').decode(f).split(/\r?\n/);
      const h = lines[0].split(';');
      return lines.slice(1).filter(Boolean).map((l) => Object.fromEntries(h.map((k, i) => [k, l.split(';')[i]])));
    };
    const geral = parse('geral');
    const comp = parse('complemento');
    const ap = parse('ativo_passivo');
    const fiis = stocks.filter(isFii);
    for (const t of fiis) {
      const g = geral.filter((r) => (r.Codigo_ISIN || '').startsWith(`BR${code4(t)}CTF`)).sort((a, b) => b.Data_Referencia.localeCompare(a.Data_Referencia))[0];
      if (!g) continue;
      const cnpj = g.CNPJ_Fundo_Classe;
      const c = comp.filter((r) => r.CNPJ_Fundo_Classe === cnpj).sort((a, b) => b.Data_Referencia.localeCompare(a.Data_Referencia))[0];
      const a = ap.filter((r) => r.CNPJ_Fundo_Classe === cnpj).sort((x, y) => y.Data_Referencia.localeCompare(x.Data_Referencia))[0];
      const n = (v: unknown) => (v === undefined || v === '' ? null : Number(String(v).replace(',', '.')));
      out.fiis[t] = {
        ticker: t,
        cnpj,
        name: g.Nome_Fundo_Classe,
        month: c?.Data_Referencia || g.Data_Referencia,
        vpPerShare: n(c?.Valor_Patrimonial_Cotas),
        holders: n(c?.Total_Numero_Cotistas),
        equity: n(c?.Patrimonio_Liquido),
        totalAssets: n(c?.Valor_Ativo),
        totalLiabilities: n(a?.Total_Passivo),
        adminFeeMonthPct: n(c?.Percentual_Despesas_Taxa_Administracao),
        dyMonthPct: n(c?.Percentual_Dividend_Yield_Mes),
        segment: g.Segmento_Atuacao || null,
        mandate: g.Mandato || null,
        manager: g.Nome_Administrador || null,
        source: 'CVM — Informe Mensal Estruturado',
        collectedAt: now,
      } satisfies FiiInfo;
    }
  }
} catch (e: any) {
  err(`CVM FII: ${e.message}`);
}

await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/market-data.json', import.meta.url), JSON.stringify(out));
console.log(`Cotações: ${Object.keys(out.quotes).length} · Calendário: ${Object.keys(out.calendar).length} · Empresas CVM: ${Object.keys(out.companies).length} · FIIs CVM: ${Object.keys(out.fiis).length} · Erros: ${out.errors.length}`);
if (!Object.keys(out.quotes).length) process.exit(1);
