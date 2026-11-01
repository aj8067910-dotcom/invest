// Ganho de capital por cesta de compensação, mês a mês.
// Fundamento: Lei 11.033/2004 (ações 15%, isenção para vendas até R$ 20.000/mês), IN RFB 1.585/2015
// (day trade 20%, compensação de prejuízos só dentro da mesma modalidade), Lei 8.668/1993 (FII 20%),
// Lei 14.754/2023 e IN RFB 1.888/2019 (cripto, isenção até R$ 35.000/mês). Estimativa: confirmar com contador.
import type { TaxRules } from '../types';
import type { Basket, Position } from './positions';
import { D, N, ZERO, cents } from '../money';

export interface GainRow {
  month: string;
  basket: Basket;
  sales: number;
  result: number;
  exempt: boolean;
  lossUsed: number;
  taxable: number;
  ir: number;
  lossCarry: number; // prejuízo a compensar após o mês
}

const rateOf = (b: Basket, t: TaxRules) => (b === 'day_trade' ? t.dayTradeRate : b === 'fii' ? t.fiiGainRate : b === 'etf' ? t.etfGainRate : b === 'cripto' ? t.cryptoGainRate : b === 'acoes' ? t.stockSwingRate : 0);

export function monthlyGains(positions: Record<string, Position>, tax: TaxRules): GainRow[] {
  const agg = new Map<string, { sales: ReturnType<typeof D>; result: ReturnType<typeof D> }>();
  for (const p of Object.values(positions))
    for (const e of p.realizedEntries) {
      if (e.basket === 'renda_fixa') continue; // renda fixa: IR retido na fonte (tabela regressiva)
      const k = `${e.date.slice(0, 7)}|${e.basket}`;
      const cur = agg.get(k) || { sales: ZERO, result: ZERO };
      agg.set(k, { sales: cur.sales.plus(e.sales), result: cur.result.plus(e.value) });
    }
  const carry = new Map<Basket, ReturnType<typeof D>>();
  return [...agg.entries()]
    .map(([k, v]) => ({ month: k.split('|')[0], basket: k.split('|')[1] as Basket, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => {
      const exempt = (r.basket === 'acoes' && r.sales.lessThanOrEqualTo(tax.stockSwingMonthlyExempt)) || (r.basket === 'cripto' && r.sales.lessThanOrEqualTo(tax.cryptoMonthlyExempt));
      let loss = carry.get(r.basket) || ZERO;
      let taxable = ZERO;
      let used = ZERO;
      if (r.result.lessThan(0)) loss = loss.plus(r.result.negated());
      else if (!exempt) {
        used = r.result.lessThan(loss) ? r.result : loss;
        loss = loss.minus(used);
        taxable = r.result.minus(used);
      }
      carry.set(r.basket, loss);
      const ir = cents(taxable.times(rateOf(r.basket, tax)).dividedBy(100));
      return { month: r.month, basket: r.basket, sales: N(r.sales), result: N(r.result), exempt, lossUsed: N(used), taxable: N(taxable), ir: N(ir), lossCarry: N(loss) };
    });
}
