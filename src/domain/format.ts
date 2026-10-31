import { isNum } from './util';

const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numFmt = (d: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export const brl = (v: number | null | undefined, empty = '—') => (isNum(v) ? brlFmt.format(v) : empty);
export const brlShort = (v: number | null | undefined) => {
  if (!isNum(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return 'R$ ' + numFmt(2).format(v / 1e6) + ' mi';
  if (a >= 1e4) return 'R$ ' + numFmt(1).format(v / 1e3) + ' mil';
  return brlFmt.format(v);
};
export const num = (v: number | null | undefined, d = 2, empty = '—') => (isNum(v) ? numFmt(d).format(v) : empty);
export const pct = (v: number | null | undefined, d = 1, empty = '—') => (isNum(v) ? numFmt(d).format(v) + '%' : empty);
export const signedPct = (v: number | null | undefined, d = 1) => (isNum(v) ? (v > 0 ? '+' : '') + numFmt(d).format(v) + '%' : '—');
export const qtyFmt = (v: number) => (Number.isInteger(v) ? numFmt(0).format(v) : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 }).format(v));
export const dateBR = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
export const dateTimeBR = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? dateBR(iso) : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
export const monthBR = (ym: string) => {
  const [y, m] = ym.split('-');
  return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1] + '/' + y.slice(2);
};
export const ageDays = (iso: string | null | undefined) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity);
