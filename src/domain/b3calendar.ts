// Calendário de pregões da B3 (aproximação documentada).
// Feriados nacionais (Lei 662/1949 e alterações; 20/11 nacional desde a Lei 14.759/2023),
// Carnaval, Sexta-feira Santa e Corpus Christi (datas móveis pela Páscoa), 24/12 e 31/12 (sem pregão
// na B3) e feriados municipais de São Paulo observados pela B3 até 2021 (25/01, 09/07 e 20/11).
// Uso: converter data-ex em data-com (pregão anterior) e liquidação em data do pregão.
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

const cache = new Map<number, Set<string>>();
export function holidays(y: number): Set<string> {
  if (cache.has(y)) return cache.get(y)!;
  const s = new Set<string>(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25', '12-24', '12-31'].map((md) => `${y}-${md}`));
  if (y >= 2024) s.add(`${y}-11-20`);
  if (y <= 2021) ['01-25', '07-09', '11-20'].forEach((md) => s.add(`${y}-${md}`));
  const e = easter(y).getTime();
  for (const off of [-48, -47, -2, 60]) s.add(iso(new Date(e + off * 86400000)));
  cache.set(y, s);
  return s;
}

export function isBusinessDay(dateIso: string): boolean {
  const d = new Date(dateIso + 'T12:00:00Z');
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6 && !holidays(d.getUTCFullYear()).has(dateIso);
}

export function addBusinessDays(dateIso: string, n: number): string {
  const d = new Date(dateIso + 'T12:00:00Z');
  let left = Math.abs(n);
  const step = n >= 0 ? 1 : -1;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    if (isBusinessDay(iso(d))) left--;
  }
  return iso(d);
}

/** Data-com = pregão imediatamente anterior à data-ex. */
export const dataComFromEx = (dataEx: string) => addBusinessDays(dataEx, -1);
/** Data do pregão a partir da liquidação: D+2 desde 27/05/2019 (antes, D+3). */
export const tradeDateFromSettlement = (settle: string) => addBusinessDays(settle, settle >= '2019-05-29' ? -2 : -3);
