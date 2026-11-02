import { useEffect, useMemo, useState } from 'react';
import { useDerived } from '../store/derived';
import { Card, DataTag, Field, NumInput, Stat } from './ui';
import { brl, pct, priceFmt, qtyFmt } from '../domain/format';
import { isHeld } from '../domain/calc/positions';
import { projectedPerUnit, recovery, simulateAporte } from '../domain/calc/yoc';
import { isNum } from '../domain/util';

const DROPS = [5, 10, 15, 20];
const EXPOSED_CLASSES = ['acao', 'fii', 'etf', 'cripto'];

/** Projeção de renda do aporte + compensação de queda por proventos (Central de aportes). */
export function IncomeTools({ suggestedId }: { suggestedId?: string }) {
  const d = useDerived();
  const candidates = useMemo(() => d.assets.filter((a) => !a.isReserve && isNum(a.quote.price) && a.quote.price > 0 && a.class !== 'tesouro'), [d.assets]);
  const [assetId, setAssetId] = useState<string>(suggestedId || candidates[0]?.id || '');
  useEffect(() => { if (!assetId && candidates[0]) setAssetId(suggestedId || candidates[0].id); }, [candidates, suggestedId, assetId]);
  const a = d.assets.find((x) => x.id === assetId);
  const [mode, setMode] = useState<'valor' | 'qtd'>('valor');
  const [value, setValue] = useState<number | null>(d.settings.profile.monthlyContribution || 400);
  const [qty, setQty] = useState<number | null>(null);
  const [dyEdit, setDyEdit] = useState<number | null>(null);
  useEffect(() => setDyEdit(null), [assetId]);

  const unit = a ? projectedPerUnit(a, d.settings, d.asOf) : null;
  const price = a?.quote.price ?? null;
  const dyHist = unit?.perUnit && price ? (unit.perUnit / price) * 100 : null;
  const dyUsed = dyEdit ?? dyHist;
  const sim = a && price ? simulateAporte({ asset: a, price, qty: mode === 'qtd' ? qty : null, value: mode === 'valor' ? value : null, dyPct: dyUsed, position: d.positions[a.id], perUnit: unit?.perUnit ?? null, summary: d.yoc, asOf: d.asOf }) : null;

  // ── compensação de queda
  const [drop, setDrop] = useState<number | null>(30);
  const [withAporte, setWithAporte] = useState(true);
  const [reinvest, setReinvest] = useState(false);
  const [useContrib, setUseContrib] = useState(false);
  const [contrib, setContrib] = useState<number | null>(d.settings.profile.monthlyContribution || 0);
  const add = withAporte && sim ? sim : null;
  const pos = a ? d.positions[a.id] : undefined;
  const yrow = a ? d.yoc.rows.find((r) => r.asset.id === a.id) : undefined;
  const indivExposed = (isHeld(pos) ? pos!.marketValue : 0) + (add?.invested ?? 0);
  const indivIncome = (yrow?.projectedAnnual ?? 0) + (add?.annual ?? 0);
  const portExposed = d.assets.filter((x) => !x.isReserve && EXPOSED_CLASSES.includes(x.class) && isHeld(d.positions[x.id])).reduce((s, x) => s + d.positions[x.id].marketValue, 0) + (add?.invested ?? 0);
  const portIncome = d.yoc.projectedAnnual + (add?.annual ?? 0);
  const opts = { reinvest, monthlyContribution: useContrib ? contrib ?? 0 : 0 };
  const scen = [...DROPS, ...(isNum(drop) && drop > 0 && drop < 100 && !DROPS.includes(drop) ? [drop] : [])];
  const indiv = scen.map((p) => recovery({ exposed: indivExposed, dropPct: p, annualIncome: indivIncome, ...opts }));
  const port = scen.map((p) => recovery({ exposed: portExposed, dropPct: p, annualIncome: portIncome, ...opts }));

  const table = (rows: ReturnType<typeof recovery>[]) => (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>Queda</th><th className="num">Patrimônio exposto</th><th className="num">Perda estimada</th><th className="num">Proventos anuais</th><th className="num">Proventos mensais equiv.</th><th className="num">Tempo de compensação</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.dropPct}>
              <td className="mono">{DROPS.includes(r.dropPct) ? '' : 'manual '}−{r.dropPct}%</td>
              <td className="num">{brl(r.exposed)}</td>
              <td className="num neg">{brl(-r.loss)}</td>
              <td className="num">{brl(r.annualIncome)}</td>
              <td className="num">{brl(r.monthlyIncome)}</td>
              <td className="num"><b>{r.label}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <Card title="Projeção de renda do aporte" sub="Simule a compra de um ativo e veja a renda passiva estimada. O DY parte do histórico de proventos líquidos do ativo (mesma base do preço-teto) e pode ser editado.">
        <div className="form-grid">
          <Field label="Ativo">
            <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              {candidates.map((x) => <option key={x.id} value={x.id}>{x.ticker} — {x.name}{x.status === 'watchlist' ? ' (watchlist)' : ''}</option>)}
            </select>
          </Field>
          <Field label="Informar por">
            <div className="seg">
              <button className={mode === 'valor' ? 'on' : ''} onClick={() => setMode('valor')}>Valor</button>
              <button className={mode === 'qtd' ? 'on' : ''} onClick={() => setMode('qtd')}>Quantidade</button>
            </div>
          </Field>
          {mode === 'valor' ? <Field label="Valor do aporte" hint="Quantidade arredondada para baixo (não passa do valor)"><NumInput value={value} onChange={setValue} /></Field> : <Field label="Quantidade"><NumInput value={qty} onChange={setQty} /></Field>}
          <Field label="Cotação usada"><input value={price ? priceFmt(price, a?.class) : 'sem cotação'} disabled /></Field>
          <Field label="DY usado na simulação" hint={dyHist ? `Histórico: ${pct(dyHist, 2)} (${unit?.label})` : 'Sem histórico: informe um DY'}>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <NumInput value={dyUsed === null ? null : Math.round(dyUsed * 100) / 100} suffix="%" onChange={setDyEdit} />
              {dyEdit !== null && <button className="btn ghost sm" onClick={() => setDyEdit(null)}>histórico</button>}
            </div>
          </Field>
        </div>
        {sim && (
          <>
            <div className="grid g4" style={{ marginTop: 12 }}>
              <Stat label="Quantidade adquirida" value={qtyFmt(sim.qty, a!.class)} sub={`${priceFmt(price, a!.class)} por unidade`} />
              <Stat label="Valor investido" value={brl(sim.invested)} />
              <Stat label="Proventos anuais estimados" value={brl(sim.annual)} sub={`DY ${pct(sim.dyUsed, 2)}${dyEdit !== null ? ' (editado)' : ''}`} tone="pos" tag={<DataTag kind="projecao" />} />
              <Stat label="Média mensal equivalente" value={brl(sim.monthlyEquivalent)} sub={sim.payments.perYear >= 10 ? 'pagamento mensal' : 'equivalência, não pagamento mensal'} tag={<DataTag kind="projecao" />} />
              <Stat label="Por pagamento" value={sim.perPayment !== null ? brl(sim.perPayment) : '—'} sub={`costuma pagar: ${sim.payments.label}`} />
              <Stat label="Renda passiva da carteira" value={`${brl(sim.portfolioAnnualBefore)} → ${brl(sim.portfolioAnnualAfter)}`} sub={sim.incomeIncreasePct !== null ? `+${pct(sim.incomeIncreasePct, 1)} ao ano` : 'primeira renda projetada'} tone="pos" />
              <Stat label={`YoC de ${a!.ticker}`} value={`${pct(sim.assetYocBefore, 2)} → ${pct(sim.assetYocAfter, 2)}`} sub="projetado ÷ custo, antes → depois" />
              <Stat label="YoC da carteira" value={`${pct(sim.portfolioYocBefore, 2)} → ${pct(sim.portfolioYocAfter, 2)}`} sub="projetado ÷ custo, antes → depois" />
            </div>
            {sim.payments.perYear > 0 && sim.payments.perYear < 10 && (
              <div className="note warn" style={{ marginTop: 10 }}>
                {a!.ticker} não paga todo mês: nos últimos 24 meses pagou em {sim.payments.label}. A média mensal de {brl(sim.monthlyEquivalent)} é só uma equivalência; o dinheiro chega nesses meses, cerca de {sim.perPayment !== null ? brl(sim.perPayment) : '—'} por pagamento.
              </div>
            )}
          </>
        )}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Simulação: nada é lançado. Proventos passados não garantem os futuros. Para registrar a compra use a Central de Operações ou o botão de registro acima.</p>
      </Card>

      <Card title="Proteção patrimonial: compensação de quedas por proventos" sub="Tempo de compensação = perda financeira simulada ÷ proventos mensais estimados. Sem aportes nem reinvestimento, salvo se você ligar as opções abaixo.">
        <div className="form-grid">
          <Field label="Queda manual" hint="Somada aos cenários de 5, 10, 15 e 20%"><NumInput value={drop} suffix="%" onChange={setDrop} /></Field>
          <Field label="Aporte simulado acima"><label className="chk" style={{ padding: '7px 0' }}><input type="checkbox" checked={withAporte} onChange={(e) => setWithAporte(e.target.checked)} /> incluir ({sim ? brl(sim.invested) : '—'})</label></Field>
          <Field label="Reinvestimento"><label className="chk" style={{ padding: '7px 0' }}><input type="checkbox" checked={reinvest} onChange={(e) => setReinvest(e.target.checked)} /> reinvestir os proventos</label></Field>
          <Field label="Novos aportes mensais">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <label className="chk"><input type="checkbox" checked={useContrib} onChange={(e) => setUseContrib(e.target.checked)} /> considerar</label>
              {useContrib && <NumInput value={contrib} onChange={setContrib} />}
            </div>
          </Field>
        </div>
        <div className="note" style={{ marginTop: 10 }}>
          <b>Equivalência financeira, não recuperação de cotação.</b> O resultado diz em quanto tempo os proventos somam o valor perdido. A cotação e o patrimônio de mercado podem continuar abaixo do valor anterior durante e depois desse prazo.
          {(reinvest || useContrib) && ' Com reinvestimento ou aportes, a renda cresce mês a mês: as compras são feitas ao preço já em queda, com o mesmo provento por unidade; aportes não contam como compensação, só a renda que geram.'}
        </div>
        <h3 style={{ margin: '16px 0 6px', fontSize: 14 }}>A. Recuperação individual — {a?.ticker ?? '—'}</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Só a posição em {a?.ticker}{add ? ' mais o aporte simulado' : ''} e os proventos estimados desse ativo.</p>
        {table(indiv)}
        <h3 style={{ margin: '16px 0 6px', fontSize: 14 }}>B. Recuperação da carteira</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Patrimônio exposto: ações, FIIs, ETFs e cripto (sem Tesouro e sem reserva de emergência){add ? ', mais o aporte simulado' : ''}. Proventos: todos os ativos da carteira.</p>
        {table(port)}
      </Card>
    </>
  );
}
