import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDerived } from '../store/derived';
import { Card, DataTag, Empty, Stat } from './ui';
import { AssetLink, ChartTip } from './common';
import { brl, brlShort, dateBR, monthBR, pct, priceFmt, qtyFmt } from '../domain/format';
import { realYield, yocHistory } from '../domain/calc/yoc';
import { addMonths } from '../domain/util';

const PERIODS = [
  { k: '12', label: '12 meses' },
  { k: '24', label: '24 meses' },
  { k: '60', label: '5 anos' },
  { k: 'all', label: 'Tudo' },
] as const;

/** Yield on Cost: rendimento sobre o capital investido (não sobre a cotação). */
export function YocPanel() {
  const d = useDerived();
  const y = d.yoc;
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['k']>('24');
  const [assetId, setAssetId] = useState<string>('');
  const hist = useMemo(() => yocHistory(d.assets, d.allTransactions, d.asOf, assetId || undefined), [d.assets, d.allTransactions, d.asOf, assetId]);
  const from = period === 'all' ? '' : addMonths(d.asOf, -Number(period)).slice(0, 7);
  const shown = hist.filter((p) => p.month > from);
  const ry = useMemo(() => realYield(d.assets, d.allTransactions, d.asOf), [d.assets, d.allTransactions, d.asOf]);
  const ryBy = new Map(ry.byAsset.map((x) => [x.assetId, x]));
  const sel = assetId ? y.rows.find((r) => r.asset.id === assetId) : null;

  return (
    <Card
      title="Yield on Cost (rendimento sobre o custo)"
      sub="YoC = proventos anuais projetados ÷ custo de aquisição da posição (preço médio da Receita, já descontadas as vendas). O valor de mercado nunca entra no denominador. Recebido = pago e lançado; projeção = estimativa, nunca contada como receita."
    >
      <div className="grid g6">
        <Stat label="DY atual de mercado" value={pct(y.dyMarket, 2)} sub="projetado ÷ valor de mercado" tag={<DataTag kind="projecao" />} />
        <Stat label="Yield on Cost da carteira" value={pct(y.yoc, 2)} sub={`projetado ÷ custo de ${brl(y.cost)}`} tone="pos" tag={<DataTag kind="projecao" />} />
        <Stat label="YoC dos ativos pagadores" value={pct(y.yocIncomeAssets, 2)} sub={`sem Tesouro, cripto e ETFs que não distribuem · custo ${brl(y.incomeCost)}`} />
        <Stat label="DY médio real" value={pct(ry.portfolio, 2)} sub={`ao ano · recebido ÷ (capital × tempo em carteira) · só pagadores ${pct(ry.payers, 2)}`} tone="pos" tag={<DataTag kind="real" />} />
        <Stat label="Total recebido" value={brl(y.received)} sub={`em ${y.monthsSinceStart} meses · 12m ${brl(y.received12m)}`} tone="pos" tag={<DataTag kind="real" />} />
        <Stat label="Média mensal recebida" value={brl(y.avgMonthly12m)} sub={`12m ÷ 12 · desde o início ${brl(y.avgMonthlySinceStart)}`} tag={<DataTag kind="real" />} />
        <Stat label="Projeção anual" value={brl(y.projectedAnnual)} sub={`${brl(y.projectedMonthly)}/mês equivalente · não é receita realizada`} tone="warn" tag={<DataTag kind="projecao" />} />
      </div>

      <div className="row between" style={{ marginTop: 16 }}>
        <b style={{ fontSize: 13 }}>Evolução do YoC realizado {sel ? `— ${sel.asset.ticker}` : '— carteira'}</b>
        <div className="row">
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">Carteira inteira</option>
            {y.rows.map((r) => <option key={r.asset.id} value={r.asset.id}>{r.asset.ticker}</option>)}
          </select>
          <div className="seg">
            {PERIODS.map((p) => <button key={p.k} className={period === p.k ? 'on' : ''} onClick={() => setPeriod(p.k)}>{p.label}</button>)}
          </div>
        </div>
      </div>
      {shown.some((p) => p.cost > 0) ? (
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={shown} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthBR} stroke="var(--dim)" fontSize={11} />
            <YAxis yAxisId="r" stroke="var(--dim)" fontSize={11} tickFormatter={(v) => brlShort(v)} width={60} />
            <YAxis yAxisId="p" orientation="right" stroke="var(--dim)" fontSize={11} tickFormatter={(v) => `${v.toFixed(1)}%`} width={48} />
            <Tooltip content={<ChartTip fmt={(v: number, k: string) => (k === 'yoc12m' ? pct(v, 2) : brl(v))} labelFmt={monthBR} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="r" dataKey="receivedMonth" name="Recebido no mês" fill="var(--pos)" radius={[3, 3, 0, 0]} />
            <Line yAxisId="p" dataKey="yoc12m" name="YoC realizado 12m" stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <Empty>Sem compras no período escolhido.</Empty>
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        A evolução usa só o realizado: proventos recebidos nos 12 meses até cada mês ÷ custo de aquisição naquele mês. Por isso fica abaixo do YoC projetado nos primeiros 12 meses de cada compra.
      </p>

      <div className="tbl-wrap" style={{ marginTop: 8 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Ativo</th><th className="num">Qtd</th><th className="num">Preço médio</th><th className="num">Custo de aquisição</th><th className="num">Valor de mercado</th>
              <th className="num">DY mercado</th><th className="num">YoC</th><th className="num">Projeção anual</th><th className="num">Recebido total</th><th className="num">Recebido 12m</th><th className="num">YoC realizado 12m</th><th className="num" title="Proventos recebidos ÷ (custo × anos em carteira), com as datas reais de compra e venda">DY médio real</th><th>1ª compra</th>
            </tr>
          </thead>
          <tbody>
            {y.rows.map((r) => (
              <tr key={r.asset.id}>
                <td><AssetLink a={r.asset} /></td>
                <td className="num">{r.qty ? qtyFmt(r.qty, r.asset.class) : <span className="dim">zerada</span>}</td>
                <td className="num">{r.qty ? priceFmt(r.avgPrice, r.asset.class) : '—'}</td>
                <td className="num">{brl(r.cost)}</td>
                <td className="num">{brl(r.marketValue)}</td>
                <td className="num">{pct(r.dyMarket, 2)}</td>
                <td className="num pos" title={`Base: ${r.basis}`}>{pct(r.yoc, 2)}</td>
                <td className="num" title={`Base: ${r.basis}`}>{r.projectedAnnual ? brl(r.projectedAnnual) : <span className="dim">—</span>}</td>
                <td className="num">{brl(r.received)}</td>
                <td className="num">{brl(r.received12m)}</td>
                <td className="num">{pct(r.yocRealized12m, 2)}</td>
                <td className="num" title={ryBy.get(r.asset.id) ? `capital médio ${brl(ryBy.get(r.asset.id)!.avgCapital)} por ${ryBy.get(r.asset.id)!.years.toFixed(1).replace('.', ',')} ano(s)` : ''}>{pct(ryBy.get(r.asset.id)?.yieldPct, 2)}</td>
                <td className="dim" style={{ fontSize: 12 }}>{r.firstBuy ? `${dateBR(r.firstBuy)} · ${r.buys} compra(s)` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Carteira</th><th></th><th></th><th className="num">{brl(y.cost)}</th><th className="num">{brl(y.marketValue)}</th>
              <th className="num">{pct(y.dyMarket, 2)}</th><th className="num">{pct(y.yoc, 2)}</th><th className="num">{brl(y.projectedAnnual)}</th><th className="num">{brl(y.received)}</th><th className="num">{brl(y.received12m)}</th><th></th><th className="num">{pct(ry.portfolio, 2)}</th><th></th>
            </tr>
          </tfoot>
        </table>
      </div>
      {!y.rows.length && <Empty>Lance compras na Central de Operações para calcular o Yield on Cost.</Empty>}
    </Card>
  );
}
