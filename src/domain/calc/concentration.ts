import type { Asset, Settings } from '../types';
import { CLASS_LABEL, FII_TYPE_LABEL } from '../types';
import { isHeld as held, type Position } from './positions';
import type { Alert } from './thesis';

export interface ExposureRow {
  key: string;
  value: number;
  pct: number;
  tickers: string[];
}

export type Dimension = 'ativo' | 'setor' | 'emissor' | 'classe' | 'segmentoFii' | 'tipoFii' | 'internacional' | 'moeda';

export const DIMENSION_LABEL: Record<Dimension, string> = {
  ativo: 'Ativo',
  setor: 'Setor',
  emissor: 'Emissor / grupo',
  classe: 'Classe',
  segmentoFii: 'Segmento de FII',
  tipoFii: 'Tipo de FII',
  internacional: 'Exposição internacional',
  moeda: 'Moeda',
};

const keyOf = (a: Asset, d: Dimension): string | null => {
  switch (d) {
    case 'ativo':
      return a.ticker;
    case 'setor':
      return a.sector || 'Sem setor';
    case 'emissor':
      return a.issuer || a.ticker;
    case 'classe':
      return CLASS_LABEL[a.class];
    case 'segmentoFii':
      return a.class === 'fii' ? a.fiiSegment || 'Sem segmento' : null;
    case 'tipoFii':
      return a.class === 'fii' ? (a.fiiType ? FII_TYPE_LABEL[a.fiiType] : 'Sem tipo') : null;
    case 'internacional':
      return a.international ? 'Internacional' : 'Brasil';
    case 'moeda':
      return a.currency === 'USD' ? 'Dólar / global' : 'Real';
  }
};

export function exposure(assets: Asset[], positions: Record<string, Position>, d: Dimension, extra?: { assetId: string; value: number }): ExposureRow[] {
  const map = new Map<string, ExposureRow>();
  let total = 0;
  for (const a of assets) {
    const p = positions[a.id];
    let v = held(p) ? p.marketValue : 0;
    if (extra && extra.assetId === a.id) v += extra.value;
    if (v <= 0) continue;
    const k = keyOf(a, d);
    if (k === null) continue;
    total += v;
    const r = map.get(k) || { key: k, value: 0, pct: 0, tickers: [] };
    r.value += v;
    if (!r.tickers.includes(a.ticker)) r.tickers.push(a.ticker);
    map.set(k, r);
  }
  const rows = [...map.values()].sort((a, b) => b.value - a.value);
  for (const r of rows) r.pct = total ? (r.value / total) * 100 : 0;
  return rows;
}

/** Peso de um grupo calculado sobre o patrimônio TOTAL (não apenas dentro da dimensão). */
function shareOfTotal(assets: Asset[], positions: Record<string, Position>, pred: (a: Asset) => boolean) {
  let total = 0;
  let part = 0;
  for (const a of assets) {
    const p = positions[a.id];
    if (!held(p)) continue;
    total += p.marketValue;
    if (pred(a)) part += p.marketValue;
  }
  return total ? (part / total) * 100 : 0;
}

export function concentrationAlerts(assets: Asset[], positions: Record<string, Position>, s: Settings): Alert[] {
  const out: Alert[] = [];
  const L = s.limits;
  const heldList = assets.filter((a) => held(positions[a.id]));
  if (!heldList.length) return out;

  for (const r of exposure(assets, positions, 'ativo')) {
    const a = assets.find((x) => x.ticker === r.key);
    if (a && (a.class === 'tesouro' || a.class === 'etf')) continue; // veículos diversificados
    if (r.pct > L.maxAssetPct) out.push({ level: 'warn', code: 'ativo', message: `${r.key} representa ${r.pct.toFixed(1)}% da carteira (limite ${L.maxAssetPct}%).` });
  }
  const sectors = new Set(heldList.filter((a) => a.class === 'acao' || a.class === 'fii').map((a) => a.sector));
  for (const sec of sectors) {
    const pct = shareOfTotal(assets, positions, (a) => (a.class === 'acao' || a.class === 'fii') && a.sector === sec);
    if (pct > L.maxSectorPct) out.push({ level: 'warn', code: 'setor', message: `Setor "${sec}" soma ${pct.toFixed(1)}% do patrimônio (limite ${L.maxSectorPct}%).` });
  }
  const issuers = new Set(heldList.filter((a) => a.class !== 'tesouro').map((a) => a.issuer));
  for (const iss of issuers) {
    const pct = shareOfTotal(assets, positions, (a) => a.class !== 'tesouro' && a.issuer === iss);
    const tick = heldList.filter((a) => a.issuer === iss).map((a) => a.ticker);
    if (pct > L.maxIssuerPct) out.push({ level: 'warn', code: 'emissor', message: `Emissor "${iss}" (${tick.join(', ')}) soma ${pct.toFixed(1)}% (limite ${L.maxIssuerPct}%).` });
  }
  for (const r of exposure(assets, positions, 'segmentoFii'))
    if (r.pct > L.maxFiiSegmentPct && r.value > 0)
      out.push({ level: 'info', code: 'segmento', message: `Segmento de FII "${r.key}" é ${r.pct.toFixed(1)}% dos FIIs (limite ${L.maxFiiSegmentPct}%).` });
  const intl = shareOfTotal(assets, positions, (a) => a.international);
  if (intl > L.maxInternationalPct) out.push({ level: 'warn', code: 'internacional', message: `Exposição internacional de ${intl.toFixed(1)}% (limite ${L.maxInternationalPct}%).` });
  return out;
}

export interface Overlap {
  kind: 'emissor' | 'etf-acoes' | 'etf-etf' | 'setor';
  title: string;
  detail: string;
  tickers: string[];
  held: boolean; // todos os envolvidos estão na carteira
}

export function overlaps(assets: Asset[], positions: Record<string, Position>): Overlap[] {
  const out: Overlap[] = [];
  const isHeld = (a: Asset) => held(positions[a.id]) || a.status === 'carteira';
  // 1) mesmo emissor / grupo econômico
  const byIssuer = new Map<string, Asset[]>();
  for (const a of assets) if (a.class !== 'tesouro') byIssuer.set(a.issuer, [...(byIssuer.get(a.issuer) || []), a]);
  for (const [iss, list] of byIssuer)
    if (list.length > 1)
      out.push({
        kind: 'emissor',
        title: `Mesmo grupo econômico: ${iss}`,
        detail: `${list.map((a) => a.ticker).join(' + ')} têm o mesmo risco de emissor. Somar as posições ao avaliar concentração.`,
        tickers: list.map((a) => a.ticker),
        held: list.every(isHeld),
      });
  // 2) ETF × ações já presentes
  for (const etf of assets.filter((a) => a.class === 'etf' && a.etf?.overlapTickers?.length)) {
    const inside = assets.filter((a) => a.class === 'acao' && isHeld(a) && etf.etf!.overlapTickers.includes(a.ticker));
    if (inside.length)
      out.push({
        kind: 'etf-acoes',
        title: `${etf.ticker} × ações da carteira`,
        detail: `${etf.ticker} (${etf.etf!.index}) já contém ${inside.map((a) => a.ticker).join(', ')}. Exposição efetiva a essas empresas é maior que a posição direta.`,
        tickers: [etf.ticker, ...inside.map((a) => a.ticker)],
        held: isHeld(etf),
      });
  }
  // 3) ETF × ETF por exposição comum
  const etfs = assets.filter((a) => a.class === 'etf');
  for (let i = 0; i < etfs.length; i++)
    for (let j = i + 1; j < etfs.length; j++) {
      const common = (etfs[i].etf?.exposureTags || []).filter((t) => (etfs[j].etf?.exposureTags || []).includes(t));
      if (common.length)
        out.push({
          kind: 'etf-etf',
          title: `${etfs[i].ticker} × ${etfs[j].ticker}`,
          detail: `Exposição comum: ${common.join(', ')}. Os dois ETFs carregam boa parte das mesmas empresas.`,
          tickers: [etfs[i].ticker, etfs[j].ticker],
          held: isHeld(etfs[i]) && isHeld(etfs[j]),
        });
    }
  // 4) muitos ativos no mesmo setor
  const bySector = new Map<string, Asset[]>();
  for (const a of assets.filter((x) => x.class === 'acao' || x.class === 'fii')) bySector.set(a.sector, [...(bySector.get(a.sector) || []), a]);
  for (const [sec, list] of bySector) {
    const heldList = list.filter(isHeld);
    if (heldList.length >= 3)
      out.push({
        kind: 'setor',
        title: `${heldList.length} ativos em "${sec}"`,
        detail: `${heldList.map((a) => a.ticker).join(', ')} compartilham riscos setoriais.${list.length > heldList.length ? ` Na watchlist: ${list.filter((a) => !isHeld(a)).map((a) => a.ticker).join(', ')}.` : ''}`,
        tickers: heldList.map((a) => a.ticker),
        held: true,
      });
  }
  return out;
}

/** Peso atual (%) de um ativo, setor e emissor no patrimônio; usado no ranking e na central de aportes. */
export function weights(assets: Asset[], positions: Record<string, Position>, a: Asset, addValue = 0) {
  let total = addValue;
  let asset = addValue;
  let sector = addValue;
  let issuer = addValue;
  for (const x of assets) {
    const p = positions[x.id];
    const v = held(p) ? p.marketValue : 0;
    total += v;
    if (x.id === a.id) asset += v;
    if ((x.class === 'acao' || x.class === 'fii') && x.sector === a.sector) sector += v;
    if (x.issuer === a.issuer) issuer += v;
  }
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  return { total, assetPct: pct(asset), sectorPct: pct(sector), issuerPct: pct(issuer) };
}
