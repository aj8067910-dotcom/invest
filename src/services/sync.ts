import { useStore } from '../store/store';
import { fetchBrapi } from './brapi';
import { fetchCryptoBRL } from './coingecko';
import { fetchSgsLast, SGS } from './bcb';
import { suspectExtraordinary } from '../domain/calc/dividends';
import { applyMarketData, type MarketReport } from './marketdata';

export interface SyncReport {
  ok: string[];
  failed: { ticker: string; error: string }[];
  dividendsAdded: number;
  robot?: MarketReport;
  needToken: string[]; // ativos fora do robô que precisam do token da brapi
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function syncQuotes(opts: { ids?: string[]; withDividends?: boolean; onProgress?: (msg: string) => void } = {}): Promise<SyncReport> {
  const st = useStore.getState();
  const token = st.settings.integrations.brapiToken.trim();
  const report: SyncReport = { ok: [], failed: [], dividendsAdded: 0, needToken: [] };
  // 1) dados do robô diário (sem token): cotações, proventos, Tesouro e Banco Central
  opts.onProgress?.('Dados do robô diário…');
  const robot = await applyMarketData();
  report.robot = robot;
  report.dividendsAdded += robot.dividendsChanged;
  const all = useStore.getState().assets.filter((a) => !opts.ids || opts.ids.includes(a.id));
  for (const a of all) if (robot.covered.has(a.id)) report.ok.push(a.ticker);
  // 2) ativos fora do robô: brapi.dev (exige token, exceto PETR4, VALE3, ITUB4 e MGLU3)
  const FREE = ['PETR4', 'VALE3', 'ITUB4', 'MGLU3'];
  const targets = all.filter((a) => a.class !== 'tesouro' && !robot.covered.has(a.id));
  for (const a of targets.filter((x) => x.class !== 'cripto' && !token && !FREE.includes(x.ticker))) report.needToken.push(a.ticker);

  for (const a of targets.filter((x) => x.class !== 'cripto' && (token || FREE.includes(x.ticker)))) {
    opts.onProgress?.(`brapi.dev: ${a.ticker}…`);
    try {
      const q = await fetchBrapi(a.ticker, token);
      useStore.getState().setQuote(a.id, q.price, q.time, 'brapi.dev (B3, com atraso)');
      if (opts.withDividends !== false && q.distributions.length && !a.distributions.some((d) => d.source.startsWith('Yahoo'))) {
        const added = useStore.getState().mergeDistributions(a.id, q.distributions);
        report.dividendsAdded += added;
        // sinaliza automaticamente pagamentos atípicos como extraordinários (revisável na ficha)
        if (added) {
          const fresh = useStore.getState().assets.find((x) => x.id === a.id)!;
          const sus = suspectExtraordinary(fresh);
          if (sus.size) useStore.getState().setDistributions(a.id, fresh.distributions.map((d) => (sus.has(d.id) && d.source === 'brapi.dev' ? { ...d, recurring: false } : d)));
        }
      }
      report.ok.push(a.ticker);
    } catch (e: any) {
      report.failed.push({ ticker: a.ticker, error: e?.message || String(e) });
    }
    await sleep(250);
  }

  const cryptos = targets.filter((x) => x.class === 'cripto' && x.crypto?.coingeckoId);
  if (cryptos.length) {
    opts.onProgress?.('CoinGecko: criptoativos…');
    try {
      const prices = await fetchCryptoBRL(cryptos.map((c) => c.crypto!.coingeckoId));
      for (const c of cryptos) {
        const p = prices[c.crypto!.coingeckoId];
        if (p) {
          useStore.getState().setQuote(c.id, p.price, p.time, 'CoinGecko (BRL)');
          report.ok.push(c.ticker);
        } else report.failed.push({ ticker: c.ticker, error: 'Sem preço na resposta' });
      }
    } catch (e: any) {
      for (const c of cryptos) report.failed.push({ ticker: c.ticker, error: e?.message || String(e) });
    }
  }

  useStore.getState().log({
    source: 'Cotações',
    ok: report.failed.length === 0,
    message:
      `${report.ok.length} atualizados, ${report.failed.length} falhas, ${report.dividendsAdded} ativo(s) com proventos atualizados.` +
      (report.robot?.generatedAt ? ` Robô: dados de ${new Date(report.robot.generatedAt).toLocaleString('pt-BR')}.` : report.robot?.error ? ` Robô indisponível: ${report.robot.error}` : '') +
      (report.needToken.length ? ` Sem token da brapi: ${report.needToken.join(', ')}.` : '') +
      (report.failed.length ? ' Falhas: ' + report.failed.map((f) => `${f.ticker} (${f.error})`).join('; ') : ''),
  });
  return report;
}

export async function syncMacro(): Promise<{ ok: number; failed: string[] }> {
  const failed: string[] = [];
  let ok = 0;
  for (const m of useStore.getState().macro) {
    const serie = SGS[m.key];
    if (!serie) continue;
    try {
      const r = await fetchSgsLast(serie);
      useStore.getState().setMacro({ ...m, value: r.value, date: r.date, fetchedAt: new Date().toISOString() });
      ok++;
    } catch (e: any) {
      failed.push(`${m.label}: ${e?.message || e}`);
    }
  }
  useStore.getState().log({ source: 'Banco Central (SGS)', ok: failed.length === 0, message: `${ok} séries atualizadas${failed.length ? '. Falhas: ' + failed.join('; ') : ''}` });
  return { ok, failed };
}
