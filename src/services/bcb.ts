// Banco Central do Brasil — SGS (Sistema Gerenciador de Séries Temporais), fonte primária
export const SGS: Record<string, number> = { selic: 432, ipca12: 13522, cdi: 4389, usd: 1 };

export async function fetchSgsLast(serie: number): Promise<{ value: number; date: string }> {
  const res = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const [row] = await res.json();
  const [d, m, y] = String(row.data).split('/');
  return { value: Number(String(row.valor).replace(',', '.')), date: `${y}-${m}-${d}` };
}
