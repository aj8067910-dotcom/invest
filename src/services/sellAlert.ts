// Alerta de venda para o "Radar da Carteira — Resumo Diário" (e-mail).
// Grava num gist SECRETO da sua conta só o necessário para o alerta: ticker, status, sinais acesos
// e os preços de referência por ação. Sem quantidades, sem valores da carteira, sem preço médio.
import { create } from 'zustand';
import { loadConfig } from './cloudsync';
import { SELL_STATUS, type SellEval } from '../domain/calc/sell';

const DESC = 'radar-de-investimentos-alerta-venda';
const FILE = 'radar-venda.json';
const KEY = 'radar-sell-alert';

interface AlertState { url: string | null; at: string | null; error: string | null; set: (p: Partial<Omit<AlertState, 'set'>>) => void }
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') as { id: string; url: string; at: string; hash: string } | null; } catch { return null; } })();
export const useAlert = create<AlertState>((set) => ({ url: saved?.url ?? null, at: saved?.at ?? null, error: null, set: (p) => set(p) }));

export function alertPayload(rows: SellEval[], asOf: string) {
  return {
    app: 'radar-de-investimentos',
    tipo: 'oportunidade-de-venda',
    atualizadoEm: new Date().toISOString(),
    dataBase: asOf,
    regra: 'VENDER = retorno total positivo e 2+ sinais (critérios 1–5) ou meta atingida; AGUARDAR = retorno positivo sem critérios; NÃO VENDER = retorno negativo.',
    itens: rows.map((r) => ({
      ticker: r.asset.ticker,
      nome: r.asset.name,
      status: SELL_STATUS[r.status].label,
      sinais: r.criteria.filter((c) => c.key !== 'meta' && c.signal).map((c) => c.label),
      metaAtingida: r.metaHit,
      revisarTese: r.reviewThesis,
      cotacaoDeReferencia: r.price,
      viraVenderEm: r.status === 'vender' ? null : r.triggerPrice ? Math.round(r.triggerPrice * 100) / 100 : null,
      precoDeSaidaBazin: r.exitPrice ? Math.round(r.exitPrice * 100) / 100 : null,
    })),
  };
}

const hashOf = (o: unknown) => { const s = JSON.stringify(o); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); };

let busy = false;
export async function publishSellAlert(rows: SellEval[], asOf: string) {
  const cfg = loadConfig();
  if (!cfg) { useAlert.getState().set({ error: null }); return; }
  if (busy) return;
  const body = alertPayload(rows, asOf);
  const { atualizadoEm, ...stable } = body;
  const hash = hashOf(stable);
  let st: { id: string; url: string; at: string; hash: string } | null = null;
  try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* sem armazenamento */ }
  if (st && st.hash === hash) return;
  busy = true;
  try {
    const payload = JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content: JSON.stringify(body, null, 2) } } });
    const res = await fetch(st ? `https://api.github.com/gists/${st.id}` : 'https://api.github.com/gists', {
      method: st ? 'PATCH' : 'POST',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${cfg.token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: payload,
    });
    if (!res.ok) throw new Error(res.status === 401 ? 'token do GitHub inválido' : `GitHub respondeu ${res.status}`);
    const g = await res.json();
    const url = `https://gist.githubusercontent.com/${g.owner?.login}/${g.id}/raw/${FILE}`;
    const next = { id: g.id, url, at: atualizadoEm, hash };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sem armazenamento */ }
    useAlert.getState().set({ url, at: atualizadoEm, error: null });
  } catch (e: any) {
    useAlert.getState().set({ error: `alerta não publicado: ${e?.message || e}` });
  } finally {
    busy = false;
  }
}
