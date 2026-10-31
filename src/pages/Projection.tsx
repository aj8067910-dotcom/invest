import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDerived } from '../store/derived';
import { useStore } from '../store/store';
import { Card, DataTag, Disclaimer, Field, NumInput, Stat, Tabs } from '../components/ui';
import { ChartTip } from '../components/common';
import { atYearEnd, goalReach, project } from '../domain/calc/projection';
import type { ScenarioKey, ScenarioParams } from '../domain/types';
import { brl, brlShort, num, pct } from '../domain/format';
import { todayISO } from '../domain/util';

const KEYS: ScenarioKey[] = ['conservador', 'moderado', 'otimista'];
const COLORS: Record<ScenarioKey, string> = { conservador: '#f5b83d', moderado: '#2f8cff', otimista: '#2fd38a' };
const YEARS = [2027, 2030, 2035, 2040, 2045];
const PARAMS: [keyof ScenarioParams, string][] = [
  ['dy', 'DY médio da carteira'],
  ['appreciation', 'Valorização nominal dos ativos'],
  ['inflation', 'Inflação (IPCA)'],
  ['contribGrowth', 'Crescimento anual do aporte'],
  ['reinvest', 'Proventos reinvestidos'],
  ['taxRate', 'Impostos sobre proventos'],
  ['fee', 'Custos (taxas/custódia)'],
];

export default function Projection() {
  const d = useDerived();
  const updateSettings = useStore((s) => s.updateSettings);
  const s = d.settings;
  const [initial, setInitial] = useState<number | null>(Math.round(d.totals.marketValue * 100) / 100);
  const [monthly, setMonthly] = useState<number | null>(s.profile.monthlyContribution);
  const [real, setReal] = useState<'real' | 'nominal'>('real');
  const currentDy = d.totals.marketValue > 0 ? (d.forward.annual / d.totals.marketValue) * 100 : null;

  const series = useMemo(() => Object.fromEntries(KEYS.map((k) => [k, project({ start: todayISO(), initial: initial ?? 0, monthly: monthly ?? 0, endYear: 2045, p: s.scenarios[k] })])) as Record<ScenarioKey, ReturnType<typeof project>>, [initial, monthly, s.scenarios]);
  const chart = useMemo(() => {
    const n = series.moderado.length;
    const out: any[] = [];
    for (let i = 0; i < n; i += 3) {
      const row: any = { date: series.moderado[i].date };
      for (const k of KEYS) row[k] = real === 'real' ? series[k][i].incomeMonthlyReal : series[k][i].incomeMonthly;
      out.push(row);
    }
    return out;
  }, [series, real]);
  const setP = (k: ScenarioKey, p: keyof ScenarioParams, v: number | null) => updateSettings((x) => ({ ...x, scenarios: { ...x.scenarios, [k]: { ...x.scenarios[k], [p]: v ?? 0 } } }));
  const val = (pt: ReturnType<typeof atYearEnd>, f: 'patrimony' | 'income') => (!pt ? null : f === 'patrimony' ? (real === 'real' ? pt.patrimonyReal : pt.patrimony) : real === 'real' ? pt.incomeMonthlyReal : pt.incomeMonthly);

  return (
    <div className="stack">
      <div className="page-h">
        <div>
          <div className="kicker">Independência financeira</div>
          <h1>Projeção de renda passiva e patrimônio</h1>
          <p>Simulação mensal até 2045 com três cenários. Projeções são hipóteses baseadas nas premissas abaixo — <b>não são garantia de retorno</b>. Valores “reais” estão em reais de hoje (descontada a inflação).</p>
        </div>
        <Tabs tabs={[{ key: 'real', label: 'R$ de hoje (real)' }, { key: 'nominal', label: 'Nominal' }]} value={real} onChange={setReal} />
      </div>
      <div className="grid g4">
        <Stat label="Patrimônio inicial" value={<NumInput value={initial} onChange={setInitial} />} sub={`carteira hoje: ${brl(d.totals.marketValue)}`} />
        <Stat label="Aporte mensal" value={<NumInput value={monthly} onChange={setMonthly} />} />
        <Stat label="DY estimado atual da carteira" value={pct(currentDy, 2)} tag={<DataTag kind="estimativa" />} sub="renda estimada ÷ patrimônio" />
        <Stat label="Renda estimada hoje" value={brl(d.forward.monthly)} sub="por mês" />
      </div>
      <Card title="Premissas por cenário" sub="Editáveis; ficam salvas">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Premissa (% a.a.)</th>{KEYS.map((k) => <th key={k} className="num" style={{ color: COLORS[k] }}>{k[0].toUpperCase() + k.slice(1)}</th>)}</tr></thead>
            <tbody>
              {PARAMS.map(([p, l]) => (
                <tr key={p}>
                  <td>{l}</td>
                  {KEYS.map((k) => <td key={k} className="num" style={{ width: 130 }}><NumInput className="sm" value={s.scenarios[k][p]} suffix="%" onChange={(v) => setP(k, p, v)} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Impostos: dividendos de ações e rendimentos de FIIs para pessoa física são isentos na maioria dos casos; JCP tem 15% retido na fonte. Use uma alíquota média efetiva. Regras tributárias podem mudar.</p>
      </Card>
      <Card title={`Renda passiva mensal projetada (${real === 'real' ? 'R$ de hoje' : 'nominal'})`} sub={<DataTag kind="projecao" />}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chart}>
            <CartesianGrid stroke="#1c2b46" vertical={false} />
            <XAxis dataKey="date" stroke="#56698a" fontSize={11} tickFormatter={(v) => v.slice(0, 4)} minTickGap={30} />
            <YAxis stroke="#56698a" fontSize={11} tickFormatter={brlShort} width={80} />
            <Tooltip content={<ChartTip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {s.goals.slice(0, 4).map((g) => <ReferenceLine key={g} y={g} stroke="#263a5c" strokeDasharray="3 3" label={{ value: brlShort(g), fill: '#56698a', fontSize: 10, position: 'insideTopLeft' }} />)}
            {KEYS.map((k) => <Line key={k} type="monotone" dataKey={k} name={k} stroke={COLORS[k]} dot={false} strokeWidth={2} />)}
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Marcos" sub={<>Fim de cada ano <DataTag kind="projecao" /></>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Ano</th>{KEYS.map((k) => <th key={k} colSpan={3} className="center" style={{ color: COLORS[k] }}>{k}</th>)}</tr>
              <tr><th></th>{KEYS.map((k) => ['Patrimônio', 'Renda/mês', 'Renda/ano'].map((h) => <th key={k + h} className="num">{h}</th>))}</tr>
            </thead>
            <tbody>
              {YEARS.map((y) => (
                <tr key={y}>
                  <td className="mono">{y}</td>
                  {KEYS.map((k) => {
                    const pt = atYearEnd(series[k], y);
                    const inc = val(pt, 'income');
                    return [
                      <td key={k + 'p'} className="num">{brlShort(val(pt, 'patrimony'))}</td>,
                      <td key={k + 'm'} className="num">{brl(inc)}</td>,
                      <td key={k + 'a'} className="num dim">{brlShort(inc !== null ? inc * 12 : null)}</td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Metas de renda passiva mensal" sub="Quando cada meta seria atingida (renda líquida, em R$ de hoje). Edite os valores das metas.">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th style={{ width: 140 }}>Meta</th><th className="num">Hoje</th>{KEYS.map((k) => <th key={k} className="num" style={{ color: COLORS[k] }}>{k}</th>)}<th></th></tr></thead>
            <tbody>
              {s.goals.map((g, i) => (
                <tr key={i}>
                  <td><NumInput className="sm" value={g} onChange={(v) => updateSettings((x) => ({ ...x, goals: x.goals.map((y, j) => (j === i ? v ?? 0 : y)) }))} /></td>
                  <td className="num">{pct(Math.min(100, (d.forward.monthly / g) * 100), 0)}</td>
                  {KEYS.map((k) => {
                    const r = goalReach(series[k], g, true);
                    return <td key={k} className="num">{r ? `${num(r.years, 1)} anos (${r.date.slice(5)}/${r.date.slice(0, 4)})` : <span className="dim">após 2045</span>}</td>;
                  })}
                  <td><button className="btn ghost sm" onClick={() => updateSettings((x) => ({ ...x, goals: x.goals.filter((_, j) => j !== i) }))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn sm" style={{ marginTop: 10 }} onClick={() => updateSettings((x) => ({ ...x, goals: [...x.goals, (x.goals[x.goals.length - 1] || 1000) * 2] }))}>+ Meta</button>
        <Field label=" " hint="“Hoje” compara a renda mensal estimada atual com a meta.">
          <span />
        </Field>
      </Card>
      <Disclaimer />
    </div>
  );
}
