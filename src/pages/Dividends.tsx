import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDerived } from '../store/derived';
import { Badge, Card, DataTag, Disclaimer, Empty, Stat, Tabs, Why } from '../components/ui';
import { provStatus } from '../domain/calc/proventos';
import { TAX_REFS } from '../domain/tax';
import { AssetLink, ChartTip, PALETTE } from '../components/common';
import { brl, brlShort, dateBR, monthBR, num, pct, qtyFmt, signedPct } from '../domain/format';
import { annualHistory, avgDy, dividendCagr, monthlyReceived, paymentFrequency, portfolioAnnualProForma, ttmPerUnit } from '../domain/calc/dividends';
import { isBazinClass, TX_LABEL } from '../domain/types';

export default function Dividends() {
  const d = useDerived();
  const [view, setView] = useState<'recebido' | 'estimado'>('estimado');
  const months = monthlyReceived(d.transactions, d.historyStart, d.asOf).map((m) => ({ month: m.month, ...m.byType, total: m.received }));
  const proForma = portfolioAnnualProForma(d.assets, d.positions);
  const inc = d.income;
  const provs = d.transactions.filter((t) => ['dividendo', 'jcp', 'rendimento', 'amortizacao', 'outro_provento', 'juros'].includes(t.type) && t.assetId).sort((a, b) => (b.exDate || b.date).localeCompare(a.exDate || a.date));
  const share = view === 'recebido' ? inc.byAsset.map((x) => ({ name: x.ticker, value: x.value, share: x.share })) : d.forward.rows.map((x) => ({ name: x.ticker, value: x.annual, share: x.share }));
  const top1 = share[0]?.share ?? 0;
  const top3 = share.slice(0, 3).reduce((s, x) => s + x.share, 0);
  const hhi = share.reduce((s, x) => s + (x.share / 100) ** 2, 0);
  const effN = hhi ? 1 / hhi : 0;

  const table = useMemo(
    () =>
      d.assets
        .filter((a) => isBazinClass(a.class))
        .map((a) => {
          const rows = annualHistory(a, d.asOf);
          const p = d.positions[a.id];
          const r = d.scoreById[a.id];
          const ttm = ttmPerUnit(a, d.asOf);
          const fw = d.forward.rows.find((x) => x.assetId === a.id);
          return { a, p, r, ttm, cagr: dividendCagr(rows), dy5: avgDy(rows, 5), freq: paymentFrequency(a, d.asOf).label, fw, sust: r.criteria.find((c) => c.key === 'sustentabilidade')?.score ?? null };
        })
        .sort((x, y) => (y.fw?.annual ?? 0) - (x.fw?.annual ?? 0) || (y.p.income - x.p.income)),
    [d],
  );
  const types = [...new Set(d.transactions.filter((t) => ['dividendo', 'jcp', 'rendimento', 'juros'].includes(t.type)).map((t) => t.type))];
  const typeColor: Record<string, string> = { dividendo: '#2fd38a', jcp: '#2f8cff', rendimento: '#38c6f4', juros: '#f5b83d' };

  return (
    <div className="stack">
      <div className="page-h">
        <div>
          <div className="kicker">Renda passiva</div>
          <h1>Análise de dividendos</h1>
          <p>Separação rigorosa entre o que foi <b>recebido</b> (lançado na Central de Operações) e o que é <b>estimado</b> (quantidade atual × proventos recorrentes por unidade). Extraordinários não entram na renda sustentável.</p>
        </div>
      </div>
      <div className="grid g6">
        <Stat label="Renda do último mês" value={brl(inc.lastMonth)} tag={<DataTag kind="real" />} tone="pos" />
        <Stat label="Renda 12 meses" value={brl(inc.last12m)} tag={<DataTag kind="real" />} sub={`${inc.monthsOfHistory} meses de histórico`} />
        <Stat label="Média mensal 12m" value={brl(inc.avgMonthly12m)} tag={<DataTag kind="real" />} sub="soma dos 12 meses ÷ 12" />
        <Stat label="Crescimento" value={inc.growthPct === null ? '—' : signedPct(inc.growthPct)} sub={inc.growthLabel} tone={inc.growthPct && inc.growthPct > 0 ? 'pos' : undefined} />
        <Stat label="Provisionado" value={brl(inc.provisioned)} sub="data-com passada, pagamento futuro" tone="warn" />
        <Stat label="Renda estimada anual" value={brl(d.forward.annual)} tag={<DataTag kind="estimativa" />} sub={`total já recebido ${brl(inc.totalReceived)}`} />
      </div>

      <div className="grid g2">
        <Card title="Proventos recebidos por mês" sub={<>Por tipo, desde o início da carteira <DataTag kind="real" /></>}>
          {months.some((m) => m.total > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={months}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthBR} stroke="var(--dim)" fontSize={11} />
                <YAxis stroke="var(--dim)" fontSize={11} tickFormatter={brlShort} width={70} />
                <Tooltip content={<ChartTip labelFmt={monthBR} />} cursor={{ fill: 'rgba(47,140,255,.06)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {types.map((t) => <Bar key={t} dataKey={t} stackId="a" name={TX_LABEL[t]} fill={typeColor[t]} />)}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty>Lance dividendos, JCP e rendimentos recebidos na Central de Operações.</Empty>
          )}
        </Card>
        <Card title="Evolução anual pro forma" sub={<>Proventos por unidade × quantidade atual: mostra o histórico de pagamento dos ativos que você tem hoje <DataTag kind="estimativa" /></>}>
          {proForma.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={proForma}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="year" stroke="var(--dim)" fontSize={11} />
                <YAxis stroke="var(--dim)" fontSize={11} tickFormatter={brlShort} width={70} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(47,140,255,.06)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="recorrente" stackId="a" name="Recorrente" fill="#2fd38a" />
                <Bar dataKey="extraordinario" stackId="a" name="Extraordinário" fill="#f5b83d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty>Requer posições e histórico de proventos por unidade.</Empty>
          )}
        </Card>
      </div>

      <Card title="Participação na renda e dependência dos maiores pagadores" right={<Tabs tabs={[{ key: 'estimado', label: 'Estimada' }, { key: 'recebido', label: 'Recebida' }]} value={view} onChange={setView} />}>
        {share.length ? (
          <div className="grid g2">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={share} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={1} stroke="#060b16">
                  {share.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="stack" style={{ gap: 10 }}>
              <div className="grid g3">
                <Stat label="Maior pagador" value={pct(top1)} sub={share[0]?.name} tone={top1 > d.settings.limits.maxTopPayerPct ? 'warn' : 'pos'} />
                <Stat label="Top 3" value={pct(top3)} />
                <Stat label="Pagadores efetivos" value={num(effN, 1)} sub="1/HHI" />
              </div>
              {top1 > d.settings.limits.maxTopPayerPct && <div className="note warn">{share[0].name} responde por {pct(top1)} da renda {view === 'estimado' ? 'estimada' : 'recebida'} (limite {d.settings.limits.maxTopPayerPct}%). Um corte nesse ativo afetaria bastante a renda.</div>}
              <table className="tbl"><tbody>{share.slice(0, 8).map((x, i) => (
                <tr key={x.name}><td><span style={{ color: PALETTE[i % PALETTE.length] }}>■</span> <span className="mono">{x.name}</span></td><td className="num">{brl(x.value)}</td><td className="num">{pct(x.share)}</td></tr>
              ))}</tbody></table>
            </div>
          </div>
        ) : (
          <Empty>Sem dados de renda {view === 'estimado' ? 'estimada (requer posições e proventos por unidade)' : 'recebida'}.</Empty>
        )}
      </Card>

      <Card title="Proventos lançados" sub={<>Lançamento automático pela data-com (posição no fechamento do pregão da data-com) e lançamentos manuais. Renda recebida conta pela data de pagamento; provisionado, pela data-com. <Why text={`${TAX_REFS.jcp} ${TAX_REFS.dividend} ${TAX_REFS.fii}`} /></>}>
        {provs.length ? (
          <div className="tbl-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Ativo</th><th>Tipo</th><th>Data-com</th><th>Pagamento</th><th className="num">Qtd elegível</th><th className="num">R$/un.</th><th className="num">Bruto</th><th className="num">IR</th><th className="num">Líquido</th><th>Status</th><th>Origem</th></tr></thead>
              <tbody>
                {provs.slice(0, 200).map((t) => {
                  const st = provStatus(t, d.asOf, d.conferred);
                  const pend = d.conciliations.find((c) => c.txId === t.id && c.status === 'pendente');
                  return (
                    <tr key={t.id}>
                      <td className="mono">{t.ticker}</td>
                      <td>{TX_LABEL[t.type]}</td>
                      <td>{dateBR(t.exDate)}</td>
                      <td>{t.payDate || !t.auto ? dateBR(t.payDate || t.date) : <span className="dim">a definir</span>}</td>
                      <td className="num">{t.qty ? qtyFmt(t.qty) : '—'}</td>
                      <td className="num">{t.perUnit ? num(t.perUnit, 6) : '—'}</td>
                      <td className="num">{brl(t.gross ?? t.amount)}</td>
                      <td className="num">{t.ir ? brl(t.ir) : '—'}</td>
                      <td className="num pos">{brl(t.amount)}</td>
                      <td>
                        <Badge tone={st === 'conferido' ? 'good' : st === 'recebido' ? 'info' : 'warn'}>{st}</Badge>
                        {pend && <Badge tone="bad" title={pend.cause}>pendência {brl(pend.diff)}</Badge>}
                      </td>
                      <td style={{ fontSize: 12 }}>{t.auto ? <>automático{t.reliability === 'estimada' && <span className="warn-t" title="anterior a 01/11/2019 ou fonte sem tipo/pagamento"> · estimado</span>}</> : 'manual/importado'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nenhum provento lançado. Os automáticos aparecem quando há posição na data-com de um provento do calendário da B3.</Empty>
        )}
        {(d.provDivergences.length > 0 || d.conciliations.some((c) => c.status === 'pendente')) && (
          <div className="note warn" style={{ marginTop: 10 }}>
            <b>Pendências de conciliação</b>
            {d.provDivergences.map((x, i) => <div key={'m' + i}>{x.ticker} · {TX_LABEL[x.type]} · {dateBR(x.payDate)}: lançado à mão {brl(x.manual)} × calculado {brl(x.computed)} (o lançamento manual foi mantido; nada duplicado).</div>)}
            {d.conciliations.filter((c) => c.status === 'pendente').map((c) => { const t = d.allTransactions.find((x) => x.id === c.txId); return <div key={c.id}>{t?.ticker} · {dateBR(t?.payDate || t?.date)}: extrato {brl(c.extractValue)} × calculado {brl(t?.amount)} (diferença {brl(c.diff)}). Causa provável: {c.cause}</div>; })}
          </div>
        )}
      </Card>

      <Card title="Por ativo" sub="Ações e FIIs (carteira e watchlist)">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ativo</th><th className="num">DY rec.</th><th className="num">DY 5a</th><th className="num">12m/unid.</th><th className="num">Extra 12m</th><th className="num">CAGR</th><th>Frequência</th><th className="num">Payout</th><th className="num">Sustent.</th><th className="num">Qtd</th><th className="num">Renda est./ano</th><th className="num">Recebido</th>
              </tr>
            </thead>
            <tbody>
              {table.map(({ a, p, r, ttm, cagr, dy5, freq, fw, sust }) => (
                <tr key={a.id}>
                  <td><AssetLink a={a} /></td>
                  <td className="num">{pct(r.bazin.dyCurrent, 2)}</td>
                  <td className="num">{pct(dy5, 2)}</td>
                  <td className="num">{ttm.recurring ? num(ttm.recurring, 4) : '—'}</td>
                  <td className={`num ${ttm.extraordinary ? 'warn-t' : ''}`}>{ttm.extraordinary ? num(ttm.extraordinary, 4) : '—'}</td>
                  <td className="num">{signedPct(cagr)}</td>
                  <td>{freq}</td>
                  <td className="num">{a.class === 'fii' ? '≥95%' : pct(a.fundamentals.payout, 0)}</td>
                  <td className={`num ${sust === null ? '' : sust >= 65 ? 'pos' : sust < 40 ? 'neg' : 'warn-t'}`}>{sust ?? '—'}</td>
                  <td className="num">{p.qty ? qtyFmt(p.qty) : '—'}</td>
                  <td className="num">{fw ? brl(fw.annual) : '—'}</td>
                  <td className="num pos">{p.income ? brl(p.income) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Disclaimer>JCP é exibido pelo valor bruto anunciado por unidade (sofre IR de 15% na fonte); a renda recebida usa o valor líquido lançado. Renda estimada não é garantia de pagamento.</Disclaimer>
    </div>
  );
}
