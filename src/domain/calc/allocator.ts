import type { Asset, AssetClass } from '../types';
import { CLASS_LABEL, isBazinClass } from '../types';
import { isNum } from '../util';
import { BAND_INFO } from './bazin';
import type { ScoreContext, ScoreResult } from './scoring';
import { PRIORITY_INFO } from './scoring';
import { weights as weightsOf } from './concentration';

export interface AllocatorInput {
  amount: number;
  date: string;
  reserve: number;
  maxPerAsset: number;
  priorityClasses: AssetClass[];
  eligibleIds: string[] | null; // null = todos
  includeMaintenance: boolean;
  mode: 'auto' | 'concentrar' | 'distribuir';
  maxAssets: number;
}

export interface AllocLine {
  asset: Asset;
  result: ScoreResult;
  adjScore: number;
  qty: number;
  price: number;
  cost: number;
  why: string[];
}

export interface Excluded {
  asset: Asset;
  reason: string;
}

export interface AllocatorOutput {
  verdict: 'investir' | 'parcial' | 'aguardar';
  investable: number;
  invested: number;
  leftover: number;
  lines: AllocLine[];
  excluded: Excluded[];
  summary: string[];
}

const unitStep = (a: Asset) => (a.class === 'cripto' ? 1e-8 : a.class === 'tesouro' ? 0.01 : 1);
const floorStep = (v: number, step: number) => Math.floor(v / step + 1e-9) * step;

export function planContribution(input: AllocatorInput, ranking: ScoreResult[], ctx: ScoreContext): AllocatorOutput {
  const investable = Math.max(0, input.amount - input.reserve);
  const summary: string[] = [];
  const excluded: Excluded[] = [];
  const byId = new Map(ctx.assets.map((a) => [a.id, a]));
  const total = ctx.alloc.total;
  const forming = total < ctx.settings.profile.monthlyContribution * 10;
  if (forming) summary.push('Carteira em formação: limites de concentração aplicados de forma flexível (patrimônio < 10 aportes).');

  if (investable <= 0) return { verdict: 'aguardar', investable, invested: 0, leftover: input.amount, lines: [], excluded, summary: ['Valor disponível não supera a reserva desejada.'] };

  type Cand = { a: Asset; r: ScoreResult; adj: number; price: number; room: number; why: string[] };
  const cands: Cand[] = [];
  for (const r of ranking) {
    const a = byId.get(r.assetId);
    if (!a) continue;
    if (input.eligibleIds && !input.eligibleIds.includes(a.id)) continue;
    const price = isNum(a.quote.price) && a.quote.price > 0 ? a.quote.price : null;
    if (r.priority !== 'maxima' && r.priority !== 'alta') {
      excluded.push({ asset: a, reason: `${PRIORITY_INFO[r.priority].label}${r.reasons.length ? ' — ' + r.reasons[r.reasons.length - 1] : ''}` });
      continue;
    }
    if (!price) {
      excluded.push({ asset: a, reason: 'Sem cotação para simular a compra.' });
      continue;
    }
    if (isBazinClass(a.class)) {
      const b = r.bazin.band;
      if (b === 'aguardar' || (b === 'manutencao' && !input.includeMaintenance)) {
        excluded.push({ asset: a, reason: `Faixa "${b ? BAND_INFO[b].label : '—'}" não elegível.` });
        continue;
      }
    }
    const why: string[] = [`Pontuação ${r.score}/100 · ${PRIORITY_INFO[r.priority].label}.`];
    let adj = r.score + (r.priority === 'maxima' ? 5 : 0);
    if (isBazinClass(a.class) && r.bazin.ratio !== null) why.push(`Cotação R$ ${price.toFixed(2)} = ${r.bazin.ratio.toFixed(0)}% do teto R$ ${r.bazin.ceiling!.toFixed(2)} (${BAND_INFO[r.bazin.band!].label}).`);
    const cls = ctx.alloc.rows.find((x) => x.cls === a.class)!;
    if (cls.diff < -2) {
      adj += Math.min(10, -cls.diff);
      why.push(`${CLASS_LABEL[a.class]} subalocada (${cls.current.toFixed(1)}% vs alvo ${cls.target}%).`);
    } else if (cls.diff > 2) {
      adj -= Math.min(15, cls.diff * 1.5);
      why.push(`${CLASS_LABEL[a.class]} já acima do alvo (${cls.current.toFixed(1)}% vs ${cls.target}%): peso reduzido.`);
    }
    if (input.priorityClasses.includes(a.class)) {
      adj += 8;
      why.push('Classe marcada como prioritária neste aporte.');
    }
    // limite de concentração por ativo
    let room = input.maxPerAsset;
    // ETFs, Tesouro e cripto servem à alocação: no máximo o que falta para a classe chegar ao alvo
    if (!isBazinClass(a.class)) {
      const gap = Math.max(0, ((ctx.alloc.total + investable) * cls.target) / 100 - cls.value);
      if (gap < price * unitStep(a)) {
        excluded.push({ asset: a, reason: `${CLASS_LABEL[a.class]} já no alvo de alocação (${cls.current.toFixed(1)}% vs ${cls.target}%).` });
        continue;
      }
      if (gap < room) why.push(`Limitado a R$ ${gap.toFixed(2)}: valor que falta para ${CLASS_LABEL[a.class]} atingir o alvo.`);
      room = Math.min(room, gap);
    }
    if (!forming && a.class !== 'tesouro' && a.class !== 'etf') {
      const w = weightsOf(ctx.assets, ctx.positions, a);
      const allowed = (ctx.settings.limits.maxAssetPct / 100) * (total + investable) - (w.assetPct / 100) * total;
      if (allowed <= price) {
        excluded.push({ asset: a, reason: `Já no limite de concentração (${w.assetPct.toFixed(1)}% vs ${ctx.settings.limits.maxAssetPct}%).` });
        continue;
      }
      if (allowed < room) why.push(`Valor limitado a R$ ${allowed.toFixed(2)} pelo teto de ${ctx.settings.limits.maxAssetPct}% por ativo.`);
      room = Math.min(room, allowed);
      if (w.sectorPct > ctx.settings.limits.maxSectorPct && isBazinClass(a.class)) {
        adj -= 10;
        why.push(`Setor ${a.sector} acima do limite (${w.sectorPct.toFixed(1)}%): peso reduzido.`);
      }
    }
    cands.push({ a, r, adj, price, room, why });
  }

  cands.sort((x, y) => y.adj - x.adj);
  if (!cands.length) {
    summary.push('Nenhum ativo reúne qualidade, preço e alocação adequados agora. Recomendação: aguardar e manter o valor em caixa/reserva (ex.: Tesouro Selic) até a próxima revisão.');
    return { verdict: 'aguardar', investable, invested: 0, leftover: input.amount, lines: [], excluded, summary };
  }

  let mode = input.mode;
  if (mode === 'auto') {
    mode = cands.length === 1 || cands[0].adj - (cands[1]?.adj ?? 0) >= 10 ? 'concentrar' : 'distribuir';
    summary.push(mode === 'concentrar' ? `Concentrando: ${cands[0].a.ticker} se destaca dos demais candidatos.` : 'Distribuindo: candidatos com pontuações próximas.');
  }
  const chosen = mode === 'concentrar' ? cands.slice(0, 1) : cands.slice(0, Math.max(1, input.maxAssets));
  const lines: AllocLine[] = [];
  let remaining = investable;
  const totalAdj = chosen.reduce((s, c) => s + Math.max(1, c.adj), 0);

  // 1ª passada: proporcional à pontuação ajustada
  for (const c of chosen) {
    const share = mode === 'concentrar' ? investable : (investable * Math.max(1, c.adj)) / totalAdj;
    const budget = Math.min(share, c.room, remaining);
    const step = unitStep(c.a);
    const qty = floorStep(budget / c.price, step);
    if (qty <= 0) {
      excluded.push({ asset: c.a, reason: `Preço unitário (R$ ${c.price.toFixed(2)}) acima do valor alocado.` });
      continue;
    }
    const cost = qty * c.price;
    remaining -= cost;
    lines.push({ asset: c.a, result: c.r, adjScore: c.adj, qty, price: c.price, cost, why: c.why });
  }
  // 2ª passada: usa sobras comprando unidades adicionais dos melhores, respeitando limites
  const pool = mode === 'concentrar' ? cands : chosen;
  for (const c of pool) {
    let line = lines.find((l) => l.asset.id === c.a.id);
    const used = line?.cost ?? 0;
    const room = Math.min(c.room - used, remaining);
    const qty = floorStep(room / c.price, unitStep(c.a));
    if (qty <= 0) continue;
    if (!line) {
      if (mode === 'concentrar' && lines.length >= Math.max(1, input.maxAssets)) continue;
      line = { asset: c.a, result: c.r, adjScore: c.adj, qty: 0, price: c.price, cost: 0, why: [...c.why, 'Recebe a sobra do aporte.'] };
      lines.push(line);
    }
    line.qty += qty;
    line.cost += qty * c.price;
    remaining -= qty * c.price;
  }

  const invested = lines.reduce((s, l) => s + l.cost, 0);
  const leftover = input.amount - invested;
  const verdict = invested <= 0 ? 'aguardar' : remaining > investable * 0.25 ? 'parcial' : 'investir';
  if (verdict === 'parcial') summary.push(`R$ ${remaining.toFixed(2)} não alocados: sem candidatos adicionais dentro dos limites. Não há obrigação de investir todo o valor.`);
  if (input.reserve > 0) summary.push(`Reserva mantida: R$ ${input.reserve.toFixed(2)}.`);
  return { verdict, investable, invested, leftover, lines, excluded, summary };
}
