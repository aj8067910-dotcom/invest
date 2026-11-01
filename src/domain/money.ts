// Aritmética decimal para valores monetários e quantidades.
// Fundamento: valores financeiros não podem sofrer erro de representação binária
// (0,1 + 0,2 ≠ 0,3 em ponto flutuante). Todo cálculo usa Decimal; o arredondamento
// acontece só na exibição. Os números gravados no banco são lidos pela sua representação
// decimal mais curta (a mesma digitada ou importada), sem perda.
import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

export { Decimal };
export type Dec = Decimal;

/** Converte qualquer entrada numérica em Decimal (null/undefined/NaN → 0). */
export const D = (v: Decimal.Value | null | undefined): Decimal => {
  if (v === null || v === undefined) return new Decimal(0);
  if (typeof v === 'number' && !Number.isFinite(v)) return new Decimal(0);
  return v instanceof Decimal ? v : new Decimal(v);
};
/** Decimal → number apenas para exibição e gráficos. */
export const N = (d: Decimal): number => d.toNumber();
export const ZERO = new Decimal(0);
/** Arredondamento monetário a centavos (meio para cima, padrão bancário de exibição/retensão). */
export const cents = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export const sumD = (xs: (Decimal.Value | null | undefined)[]) => xs.reduce<Decimal>((s, x) => s.plus(D(x)), ZERO);
