// Robô de coleta de dados de mercado (roda no GitHub Actions, sem CORS e sem token).
// Gera public/market-data.json, publicado junto com o site e lido pelo app.
// Uso: node scripts/fetch-market.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const cfg = JSON.parse(await readFile(new URL('../market/tickers.json', import.meta.url), 'utf8'));
const UA = { 'User-Agent': 'Mozilla/5.0 (radar-de-investimentos)' };
const out = { generatedAt: new Date().toISOString(), quotes: {}, dividends: {}, annualPrices: {}, tesouro: {}, macro: {}, errors: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (ts) => new Date(ts * 1000).toISOString();
const day = (ts) => new Date(ts * 1000 - 3 * 3600 * 1000).toISOString().slice(0, 10); // horário de Brasília

async function getJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(1500 * i);
    }
  }
}

// ── Ações, FIIs e ETFs da B3 (Yahoo Finance: cotação, proventos e preços diários de 10 anos).
// Intervalo diário: com intervalo mensal o Yahoo omite proventos.
for (const t of cfg.b3) {
  try {
    const d = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${t}.SA?range=10y&interval=1d&events=div`);
    const r = d.chart?.result?.[0];
    if (!r?.meta?.regularMarketPrice) throw new Error('sem cotação');
    out.quotes[t] = { price: r.meta.regularMarketPrice, time: iso(r.meta.regularMarketTime) };
    out.dividends[t] = Object.values(r.events?.dividends || {})
      .filter((x) => x.amount > 0)
      .map((x) => ({ exDate: day(x.date), value: Math.round(x.amount * 1e8) / 1e8 }))
      .sort((a, b) => a.exDate.localeCompare(b.exDate));
    const byYear = {};
    (r.timestamp || []).forEach((ts, i) => {
      const c = r.indicators?.quote?.[0]?.close?.[i];
      if (c == null) return;
      const y = day(ts).slice(0, 4);
      (byYear[y] ||= []).push(c);
    });
    const curYear = new Date().getFullYear();
    out.annualPrices[t] = Object.fromEntries(
      Object.entries(byYear)
        .filter(([y, xs]) => Number(y) < curYear && xs.length >= 150)
        .map(([y, xs]) => [y, Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) / 100]),
    );
  } catch (e) {
    out.errors.push(`${t}: ${e.message}`);
  }
  await sleep(400);
}

// ── Criptoativos (CoinGecko)
try {
  const ids = Object.values(cfg.crypto).join(',');
  const d = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=brl&include_last_updated_at=true`);
  for (const [t, id] of Object.entries(cfg.crypto)) if (d[id]?.brl) out.quotes[t] = { price: d[id].brl, time: iso(d[id].last_updated_at) };
} catch (e) {
  out.errors.push(`Cripto: ${e.message}`);
}

// ── Tesouro Direto (arquivo oficial do Tesouro Transparente)
try {
  const r = await fetch('https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv', { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const lines = (await r.text()).split(/\r?\n/);
  const num = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));
  const toIso = (s) => s.split('/').reverse().join('-');
  for (const [t, { tipo, vencimento }] of Object.entries(cfg.tesouro)) {
    let best = null;
    for (const l of lines) {
      const c = l.split(';');
      if (c[0] !== tipo || c[1] !== vencimento) continue;
      const dt = toIso(c[2]);
      if (!best || dt > best.dataBase) best = { dataBase: dt, taxaCompra: num(c[3]), taxaVenda: num(c[4]), puCompra: num(c[5]), puVenda: num(c[6]), puBase: num(c[7]) };
    }
    if (best) out.tesouro[t] = { ...best, tipo, vencimento: toIso(vencimento) };
    else out.errors.push(`${t}: título não encontrado no arquivo do Tesouro`);
  }
} catch (e) {
  out.errors.push(`Tesouro: ${e.message}`);
}

// ── Banco Central (SGS)
for (const [k, s] of Object.entries({ selic: 432, ipca12: 13522, cdi: 4389, usd: 1 })) {
  try {
    const [row] = await getJson(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${s}/dados/ultimos/1?formato=json`);
    out.macro[k] = { value: Number(String(row.valor).replace(',', '.')), date: row.data.split('/').reverse().join('-') };
  } catch (e) {
    out.errors.push(`Banco Central ${k}: ${e.message}`);
  }
}

await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/market-data.json', import.meta.url), JSON.stringify(out));
console.log(`Cotações: ${Object.keys(out.quotes).length} · Tesouro: ${Object.keys(out.tesouro).length} · Macro: ${Object.keys(out.macro).length} · Erros: ${out.errors.length}`);
if (out.errors.length) console.log(out.errors.join('\n'));
if (Object.keys(out.quotes).length === 0) process.exit(1);
