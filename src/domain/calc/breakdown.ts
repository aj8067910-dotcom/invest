// Rendimento por nível: carteira, classe, setor, segmento e ativo.
// Retorno total = valorização (a mercado) + resultado das vendas + proventos recebidos (líquidos).
// Percentual sobre o total comprado (mesma base da ficha do ativo). Fonte: livro da Central de Operações.
import type { Asset } from '../types';
import { CLASS_LABEL, FII_TYPE_LABEL } from '../types';
import type { MarketData } from '../market';
import { isHeld, type Position } from './positions';
import type { YocSummary } from './yoc';

export type Level = 'carteira' | 'classe' | 'setor' | 'segmento' | 'ativo';
export const LEVEL_LABEL: Record<Level, string> = { carteira: 'Carteira', classe: 'Classe', setor: 'Setor', segmento: 'Segmento', ativo: 'Ativo' };

/** Setor e segmento: classificação oficial da B3 para ações; para os demais, o tipo do ativo. */
export function classify(a: Asset, m: MarketData): { setor: string; segmento: string } {
  const b3 = m.classification?.[a.ticker];
  if (a.class === 'acao') return { setor: b3?.setor || a.sector || 'Sem setor', segmento: b3?.segmento || b3?.subsetor || a.sector || 'Sem segmento' };
  if (a.class === 'fii') return { setor: `FII ${a.fiiType ? FII_TYPE_LABEL[a.fiiType].toLowerCase() : ''}`.trim(), segmento: a.fiiSegment || m.fiis?.[a.ticker]?.segment || a.sector || 'Sem segmento' };
  if (a.class === 'etf') return { setor: a.international ? 'ETF internacional' : 'ETF Brasil', segmento: a.etf?.index || a.sector || 'ETF' };
  if (a.class === 'tesouro') return { setor: 'Renda fixa', segmento: a.fixed?.indexer ? `Tesouro ${a.fixed.indexer}` : 'Tesouro' };
  return { setor: 'Criptoativos', segmento: a.crypto?.role || a.name || a.ticker };
}

export interface GroupRow {
  key: string;
  tickers: string[];
  cost: number; // custo da posição atual
  bought: number; // total comprado (base do %)
  marketValue: number;
  appreciation: number; // valorização não realizada
  realized: number;
  income: number; // proventos recebidos
  income12m: number;
  totalReturn: number;
  totalReturnPct: number | null;
  appreciationPct: number | null;
  projectedAnnual: number;
  yoc: number | null;
  dyMarket: number | null;
  weight: number; // % do patrimônio
}

export function breakdown(level: Level, assets: Asset[], positions: Record<string, Position>, yoc: YocSummary, m: MarketData): GroupRow[] {
  const yr = new Map(yoc.rows.map((r) => [r.asset.id, r]));
  const map = new Map<string, GroupRow>();
  let totalMv = 0;
  for (const a of assets) {
    const p = positions[a.id];
    if (!p || a.isReserve || (!isHeld(p) && !p.totalBought)) continue;
    const c = classify(a, m);
    const key = level === 'carteira' ? 'Carteira' : level === 'classe' ? CLASS_LABEL[a.class] : level === 'setor' ? c.setor : level === 'segmento' ? c.segmento : a.ticker;
    const g = map.get(key) || { key, tickers: [], cost: 0, bought: 0, marketValue: 0, appreciation: 0, realized: 0, income: 0, income12m: 0, totalReturn: 0, totalReturnPct: null, appreciationPct: null, projectedAnnual: 0, yoc: null, dyMarket: null, weight: 0 };
    const held = isHeld(p);
    g.tickers.push(a.ticker);
    g.cost += held ? p.costBasis : 0;
    g.bought += p.totalBought;
    g.marketValue += held ? p.marketValue : 0;
    g.appreciation += held ? p.unrealized ?? 0 : 0;
    g.realized += p.realized;
    g.income += p.income;
    g.income12m += yr.get(a.id)?.received12m ?? 0;
    g.projectedAnnual += yr.get(a.id)?.projectedAnnual ?? 0;
    map.set(key, g);
    totalMv += held ? p.marketValue : 0;
  }
  const rows = [...map.values()];
  for (const g of rows) {
    g.totalReturn = g.appreciation + g.realized + g.income;
    g.totalReturnPct = g.bought > 0 ? (g.totalReturn / g.bought) * 100 : null;
    g.appreciationPct = g.cost > 0 ? (g.appreciation / g.cost) * 100 : null;
    g.yoc = g.cost > 0 && g.projectedAnnual > 0 ? (g.projectedAnnual / g.cost) * 100 : null;
    g.dyMarket = g.marketValue > 0 && g.projectedAnnual > 0 ? (g.projectedAnnual / g.marketValue) * 100 : null;
    g.weight = totalMv > 0 ? (g.marketValue / totalMv) * 100 : 0;
  }
  return rows.sort((x, y) => y.marketValue - x.marketValue);
}
