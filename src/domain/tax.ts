// Regras tributárias. Os valores padrão seguem a especificação do usuário e ficam editáveis
// em Parâmetros. ATENÇÃO: confirme com um contador; a plataforma não substitui orientação fiscal.
import type { TaxRules, TxType } from './types';
import { D, Decimal, ZERO, cents } from './money';

export const TAX_REFS = {
  jcp: 'IRRF de 17,5% sobre JCP a partir de 01/01/2026 — LC 224/2025 (antes: 15%, Lei 9.249/1995, art. 9º).',
  dividend: 'Dividendos isentos até R$ 50.000/mês por empresa; acima, retenção de 10% sobre o TOTAL do mês — Lei 15.270/2025.',
  fii: 'Rendimento de FII isento para pessoa física se o fundo tiver ≥ 100 cotistas, cotas negociadas só em bolsa e o cotista tiver < 10% das cotas — Lei 8.668/1993, art. 3º, com redação da Lei 14.754/2023.',
  gains: 'Ganho de capital: ações 15% (isenção para vendas até R$ 20.000/mês), day trade 20%, FII 20%, ETF de renda variável 15% sem isenção, cripto 15% com isenção até R$ 35.000/mês em vendas — Lei 11.033/2004, IN RFB 1.585/2015, Lei 14.754/2023. Confirmar com contador.',
} as const;

export function defaultTaxRules(): TaxRules {
  return {
    jcpRate: 17.5,
    dividendMonthlyExempt: 50000,
    dividendRateAbove: 10,
    fiiExemptDefault: true,
    fiiRateIfNotExempt: 20,
    stockSwingRate: 15,
    stockSwingMonthlyExempt: 20000,
    dayTradeRate: 20,
    fiiGainRate: 20,
    etfGainRate: 15,
    cryptoGainRate: 15,
    cryptoMonthlyExempt: 35000,
  };
}

export interface ProvTax {
  gross: Decimal;
  ir: Decimal;
  net: Decimal;
  rule: string;
}

/**
 * IR de um provento isolado. Dividendos dependem do total do mês por empresa:
 * use `dividendMonthlyIR` para ratear o imposto entre os pagamentos do mês.
 */
export function provTax(type: TxType, gross: Decimal.Value, rules: TaxRules, opts: { fiiExempt?: boolean } = {}): ProvTax {
  const g = D(gross);
  if (type === 'jcp') {
    const ir = g.times(rules.jcpRate).dividedBy(100); // exato; o valor retido em cada pagamento é arredondado a centavos no lançamento
    return { gross: g, ir, net: g.minus(ir), rule: TAX_REFS.jcp };
  }
  if (type === 'rendimento') {
    const exempt = opts.fiiExempt ?? rules.fiiExemptDefault;
    const ir = exempt ? ZERO : g.times(rules.fiiRateIfNotExempt).dividedBy(100);
    return { gross: g, ir, net: g.minus(ir), rule: exempt ? TAX_REFS.fii : 'FII sem os requisitos de isenção: IRRF de ' + rules.fiiRateIfNotExempt + '%.' };
  }
  if (type === 'amortizacao') return { gross: g, ir: ZERO, net: g, rule: 'Amortização devolve capital: reduz o custo, não é renda tributável.' };
  return { gross: g, ir: ZERO, net: g, rule: type === 'dividendo' ? TAX_REFS.dividend : 'Sem retenção.' };
}

/** IR do mês para dividendos de UMA empresa: 10% sobre o total quando ele passa de R$ 50 mil. */
export function dividendMonthlyIR(totalMonth: Decimal.Value, rules: TaxRules): Decimal {
  const t = D(totalMonth);
  return t.greaterThan(rules.dividendMonthlyExempt) ? cents(t.times(rules.dividendRateAbove).dividedBy(100)) : ZERO;
}
