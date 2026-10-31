// CoinGecko — preços de criptoativos em BRL (API pública, sujeita a limite de requisições)
export async function fetchCryptoBRL(ids: string[]): Promise<Record<string, { price: number; time: string }>> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=brl&include_last_updated_at=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 429 ? 'Limite de requisições do CoinGecko atingido; tente em alguns minutos.' : `HTTP ${res.status}`);
  const body = await res.json();
  const out: Record<string, { price: number; time: string }> = {};
  for (const id of ids) {
    const v = body[id];
    if (v && typeof v.brl === 'number') out[id] = { price: v.brl, time: v.last_updated_at ? new Date(v.last_updated_at * 1000).toISOString() : new Date().toISOString() };
  }
  return out;
}
