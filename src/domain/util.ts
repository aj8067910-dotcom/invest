export const uid = () =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));

export const todayISO = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

export const addMonths = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setMonth(d.getMonth() + n);
  return todayISO(d);
};

export const monthKey = (iso: string) => iso.slice(0, 7);

export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** Interpolação linear de v entre [a,b] → [0,100]. Se a > b, escala invertida. */
export const scale = (v: number, a: number, b: number) => clamp(((v - a) / (b - a)) * 100);

export const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const groupBy = <T, K extends string>(xs: T[], f: (x: T) => K) => {
  const out = {} as Record<K, T[]>;
  for (const x of xs) (out[f(x)] ||= []).push(x);
  return out;
};

/** Converte texto numérico em pt-BR ("1.234,56") ou en ("1234.56"). */
export const parseNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[R$\s%]/g, '');
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /-$/.test(s);
  s = s.replace(/[()]/g, '').replace(/-$/, '');
  if (s.includes(',') && s.includes('.')) {
    // o separador que aparece por último é o decimal: 1.234,56 (BR) ou 1,234.56 (EN)
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s) && !/^0\./.test(s)) s = s.replace(/\./g, ''); // 3.000 → 3000 (milhar BR)
  if (neg) s = '-' + s;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Confere se ano-mês-dia formam uma data real (rejeita 31/02, 32/13 etc.). */
const validYMD = (y: number, m: number, d: number) => {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const ymd = (y: number, m: number, d: number) => (validYMD(y, m, d) ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);

/** Normaliza datas "dd/mm/aaaa", "dd-mm-aaaa", "aaaa-mm-dd", Date ou serial do Excel → ISO. Data impossível → null. */
export const parseDate = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    // datas do Excel chegam à meia-noite local; usa os componentes locais para não "voltar" um dia
    return ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === 'number') {
    if (v < 1 || v > 100000) return null;
    const d = new Date(Math.round((v - 25569) * 86400000));
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/) || s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})[\sT]/);
  if (m) return ymd(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
};
