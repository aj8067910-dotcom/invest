import { useEffect, useMemo, useState } from 'react';
import { useDerived } from '../store/derived';
import { useStore } from '../store/store';
import { Badge, Card, DataTag, Empty, Modal, NumInput, Stat } from './ui';
import { PriorityBadge } from './common';
import { brl, pct, priceFmt, qtyFmt, signedPct } from '../domain/format';
import { projectedPerUnit, unitStep } from '../domain/calc/yoc';
import { capOf, weights } from '../domain/calc/concentration';
import { breakdown, classify } from '../domain/calc/breakdown';
import { CLASS_LABEL, type AssetClass } from '../domain/types';
import { isNum, uid } from '../domain/util';
import { toast } from './toast';

export interface ManualLine { id: string; assetId: string; mode: 'valor' | 'qtd'; value: number | null; qty: number | null }
const KEY = 'radar-aporte-manual';
const load = (): ManualLine[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };

/** Aporte escolhido por você (além da recomendação). Nada é lançado sem confirmação. */
export function ManualAporte({ amount, date, suggestion, onChange }: { amount: number; date: string; suggestion: { assetId: string; qty: number }[]; onChange?: (tickers: string[]) => void }) {
  const d = useDerived();
  const addTransaction = useStore((s) => s.addTransaction);
  const [lines, setLines] = useState<ManualLine[]>(load);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* sem armazenamento */ } }, [lines]);
  const options = useMemo(() => d.assets.filter((a) => !a.isReserve && isNum(a.quote.price) && a.quote.price > 0).sort((x, y) => x.ticker.localeCompare(y.ticker)), [d.assets]);
  const byId = useMemo(() => new Map(d.assets.map((a) => [a.id, a])), [d.assets]);
  const ret = useMemo(() => ({
    ativo: new Map(breakdown('ativo', d.assets, d.positions, d.yoc, d.market).map((r) => [r.key, r])),
    classe: new Map(breakdown('classe', d.assets, d.positions, d.yoc, d.market).map((r) => [r.key, r])),
    setor: new Map(breakdown('setor', d.assets, d.positions, d.yoc, d.market).map((r) => [r.key, r])),
    segmento: new Map(breakdown('segmento', d.assets, d.positions, d.yoc, d.market).map((r) => [r.key, r])),
  }), [d.assets, d.positions, d.yoc, d.market]);

  const calc = lines.map((l) => {
    const a = byId.get(l.assetId);
    if (!a || !isNum(a.quote.price)) return { l, a, qty: 0, cost: 0, income: 0, warns: [] as string[] };
    const price = a.quote.price;
    const step = unitStep(a);
    const qty = l.mode === 'qtd' ? l.qty ?? 0 : isNum(l.value) && l.value > 0 ? Math.floor(l.value / price / step + 1e-9) * step : 0;
    const cost = qty * price;
    const u = projectedPerUnit(a, d.settings, d.asOf);
    const income = u.perUnit ? u.perUnit * qty : 0;
    const r = d.scoreById[a.id];
    const warns: string[] = [];
    if (a.status === 'venda') warns.push('está em Oportunidade de Venda');
    if (r?.priority === 'aguardar') warns.push(`classificação Aguardar: ${r.reasons[r.reasons.length - 1] || ''}`);
    else if (a.status === 'watchlist' && r?.priority !== 'oportunidade') warns.push('watchlist fora de Oportunidade (pela sua regra, não entraria na sugestão)');
    const cap = capOf(a, d.settings);
    const w = weights(d.assets, d.positions, a, cost);
    if (cost > 0 && w.assetPct > cap.pct && d.alloc.total > d.settings.profile.monthlyContribution * 10) warns.push(`passa do teto de ${pct(cap.pct, 0)} na carteira (ficaria com ${pct(w.assetPct, 1)})`);
    if (l.mode === 'valor' && isNum(l.value) && l.value > 0 && qty === 0) warns.push('valor menor que 1 unidade');
    return { l, a, qty, cost, income, warns, price, r };
  });
  const total = calc.reduce((s, x) => s + x.cost, 0);
  const investable = Math.max(0, amount - d.settings.allocator.reserve);
  const incomeAdd = calc.reduce((s, x) => s + x.income, 0);
  const yocAfter = d.yoc.cost + total > 0 ? ((d.yoc.projectedAnnual + incomeAdd) / (d.yoc.cost + total)) * 100 : null;
  const add: Record<AssetClass, number> = { acao: 0, fii: 0, tesouro: 0, etf: 0, cripto: 0 };
  for (const x of calc) if (x.a) add[x.a.class] += x.cost;
  const allocTotal = d.alloc.total + total;
  const tickers = calc.filter((x) => x.a && x.cost > 0).map((x) => x.a!.ticker);
  useEffect(() => { onChange?.(tickers); }, [tickers.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id: string, p: Partial<ManualLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const addLine = () => setLines((ls) => [...ls, { id: uid(), assetId: options[0]?.id || '', mode: 'valor', value: null, qty: null }]);
  const useSuggestion = () => {
    if (!suggestion.length) return toast('Não há sugestão para copiar neste aporte.', true);
    setLines(suggestion.map((s) => ({ id: uid(), assetId: s.assetId, mode: 'qtd', value: null, qty: s.qty })));
  };
  const register = () => {
    addTransaction({ date, type: 'aporte', amount: Math.max(amount, total), notes: 'Aporte registrado pela central (escolha manual)' });
    for (const x of calc) if (x.a && x.qty > 0) addTransaction({ date, type: 'compra', assetId: x.a.id, ticker: x.a.ticker, qty: x.qty, price: x.price!, fees: 0, amount: x.cost, notes: 'Compra escolhida na central de aportes' });
    setConfirm(false);
    setLines([]);
    toast(`Registradas ${calc.filter((x) => x.qty > 0).length} compra(s). Ajuste preços e taxas reais na Central de Operações, se necessário.`);
  };

  return (
    <Card
      title="Minha escolha de aporte"
      sub="Escolha você os ativos e quanto aplicar em cada um, independentemente da sugestão. O painel calcula quantidade, custo, renda estimada e impacto, e avisa quando a escolha vai contra suas regras. A decisão é sua."
      right={<div className="row"><button className="btn sm" onClick={useSuggestion}>Copiar a sugestão</button><button className="btn sm primary" onClick={addLine}>+ Ativo</button></div>}
    >
      {lines.length ? (
        <>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Ativo</th><th>Informar</th><th className="num">Valor ou quantidade</th><th className="num">Cotação</th><th className="num">Qtd</th><th className="num">Custo</th><th className="num">Renda estimada/ano</th><th>Rendimento: ativo · classe · setor · segmento</th><th>Classificação</th><th></th></tr>
              </thead>
              <tbody>
                {calc.map((x) => {
                  const c = x.a ? classify(x.a, d.market) : null;
                  const rA = x.a ? ret.ativo.get(x.a.ticker) : undefined;
                  const rC = x.a ? ret.classe.get(CLASS_LABEL[x.a.class]) : undefined;
                  const rS = c ? ret.setor.get(c.setor) : undefined;
                  const rG = c ? ret.segmento.get(c.segmento) : undefined;
                  const cell = (r: typeof rA, label: string) => <span title={label} className={(r?.totalReturnPct ?? 0) >= 0 ? 'pos' : 'neg'}>{r ? signedPct(r.totalReturnPct) : <span className="dim">—</span>}</span>;
                  return (
                    <tr key={x.l.id}>
                      <td>
                        <select value={x.l.assetId} onChange={(e) => set(x.l.id, { assetId: e.target.value })} style={{ minWidth: 120 }}>
                          {options.map((a) => <option key={a.id} value={a.id}>{a.ticker}{a.status === 'watchlist' ? ' (W)' : a.status === 'venda' ? ' (venda)' : ''}</option>)}
                        </select>
                        {c && <div className="dim" style={{ fontSize: 11 }}>{c.setor} · {c.segmento}</div>}
                      </td>
                      <td>
                        <div className="seg">
                          <button className={x.l.mode === 'valor' ? 'on' : ''} onClick={() => set(x.l.id, { mode: 'valor' })}>R$</button>
                          <button className={x.l.mode === 'qtd' ? 'on' : ''} onClick={() => set(x.l.id, { mode: 'qtd' })}>Qtd</button>
                        </div>
                      </td>
                      <td className="num" style={{ minWidth: 120 }}>
                        {x.l.mode === 'valor' ? <NumInput value={x.l.value} onChange={(v) => set(x.l.id, { value: v })} /> : <NumInput value={x.l.qty} onChange={(v) => set(x.l.id, { qty: v })} />}
                      </td>
                      <td className="num">{x.a ? priceFmt(x.price, x.a.class) : '—'}</td>
                      <td className="num">{x.a ? qtyFmt(x.qty, x.a.class) : '—'}</td>
                      <td className="num"><b>{brl(x.cost)}</b></td>
                      <td className="num">{x.income ? brl(x.income) : <span className="dim">—</span>}</td>
                      <td className="nowrap" style={{ fontSize: 12.5 }}>{cell(rA, 'ativo')} · {cell(rC, 'classe')} · {cell(rS, 'setor')} · {cell(rG, 'segmento')}</td>
                      <td>
                        {x.r && <PriorityBadge p={x.r.priority} />}
                        {x.warns.map((w) => <div key={w}><Badge tone="warn" title={w}>▲ {w.length > 46 ? w.slice(0, 46) + '…' : w}</Badge></div>)}
                      </td>
                      <td><button className="btn ghost sm" onClick={() => setLines((ls) => ls.filter((l) => l.id !== x.l.id))}>remover</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid g4" style={{ marginTop: 12 }}>
            <Stat label="Total escolhido" value={brl(total)} sub={`disponível ${brl(investable)}${d.settings.allocator.reserve ? ` (reserva ${brl(d.settings.allocator.reserve)})` : ''}`} tone={total > investable ? 'warn' : 'pos'} />
            <Stat label={total > investable ? 'Passa do disponível' : 'Sobra'} value={brl(Math.abs(investable - total))} tone={total > investable ? 'warn' : undefined} />
            <Stat label="Renda estimada a mais" value={`${brl(incomeAdd)}/ano`} sub={`${brl(incomeAdd / 12)}/mês equivalente`} tag={<DataTag kind="projecao" />} />
            <Stat label="YoC da carteira" value={`${pct(d.yoc.yoc, 2)} → ${pct(yocAfter, 2)}`} sub="projetado ÷ custo, antes → depois" />
          </div>
          <div className="tbl-wrap" style={{ marginTop: 10 }}>
            <table className="tbl">
              <thead><tr><th>Classe</th><th className="num">Hoje</th><th className="num">Após a sua escolha</th><th className="num">Alvo</th><th className="num">Aporte</th></tr></thead>
              <tbody>
                {d.alloc.rows.filter((r) => r.value > 0 || add[r.cls] > 0 || r.target > 0).map((r) => {
                  const after = allocTotal ? ((r.value + add[r.cls]) / allocTotal) * 100 : 0;
                  return <tr key={r.cls}><td>{CLASS_LABEL[r.cls]}</td><td className="num">{pct(r.current)}</td><td className="num">{pct(after)} <span className={Math.abs(after - r.target) < Math.abs(r.current - r.target) ? 'pos' : 'dim'} style={{ fontSize: 11 }}>{signedPct(after - r.current)}</span></td><td className="num">{pct(r.target, 0)}</td><td className="num">{add[r.cls] ? brl(add[r.cls]) : '—'}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn" disabled={!total} onClick={() => setConfirm(true)}>Registrar minha escolha (após executar na corretora)</button>
          </div>
        </>
      ) : (
        <Empty>Nenhum ativo escolhido. Use “+ Ativo” para montar o seu aporte ou “Copiar a sugestão” para partir da recomendação e ajustar.</Empty>
      )}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Registrar aporte e compras escolhidas">
        <p>O sistema <b>não executa ordens</b>. Use isto somente depois de comprar na {d.settings.profile.broker}. Serão lançados:</p>
        <ul>
          <li>Aporte de {brl(Math.max(amount, total))} em {date}</li>
          {calc.filter((x) => x.a && x.qty > 0).map((x) => <li key={x.l.id}>Compra de {qtyFmt(x.qty, x.a!.class)} {x.a!.ticker} a {priceFmt(x.price, x.a!.class)}</li>)}
        </ul>
        {calc.some((x) => x.warns.length) && <p className="warn-t">Há avisos em {calc.filter((x) => x.warns.length).map((x) => x.a?.ticker).join(', ')}. Confira antes de registrar.</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => setConfirm(false)}>Cancelar</button>
          <button className="btn primary" onClick={register}>Registrar</button>
        </div>
      </Modal>
    </Card>
  );
}
