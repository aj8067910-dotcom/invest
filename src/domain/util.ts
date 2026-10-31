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
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Normaliza datas "dd/mm/aaaa", "aaaa-mm-dd" ou serial do Excel → ISO. */
export const parseDate = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return todayISO(v);
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
};
