import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDerived } from '../store/derived';
import { useStore } from '../store/store';
import { Badge, Card, Disclaimer, Field, NumInput, Stat } from '../components/ui';
import { CLASS_COLOR, ChartTip } from '../components/common';
import { computeAllocation, economicExposure, reserveTotal } from '../domain/calc/allocation';
import { CLASS_LABEL, EXPOSURE_LABEL } from '../domain/types';
import { brl, pct, signedPct } from '../domain/format';
import { ReturnsBreakdown } from '../components/ReturnsBreakdown';

export default function Allocation() {
  const d = useDerived();
  const updateSettings = useStore((s) => s.updateSettings);
  const [contrib, setContrib] = useState<number | null>(d.settings.profile.monthlyContribution);
  const alloc = computeAllocation(d.assets, d.positions, d.settings, contrib ?? 0);
  const chart = alloc.rows.map((r) => ({ name: CLASS_LABEL[r.cls], Atual: Number(r.current.toFixed(2)), Alvo: r.target }));
  const best = d.ranking.find((r) => r.priority === 'oportunidade' && d.assets.find((a) => a.id === r.assetId)?.class === alloc.priorityClass);

  return (
    <div className="stack">
      <div className="page-h">
        <div>
          <div className="kicker">Estratégia</div>
          <h1>Alocação estratégica</h1>
          <p>A alocação orienta os aportes, mas não obriga a comprar um ativo caro só para equilibrar percentuais: a central de aportes combina o desvio da classe com a qualidade e o preço de cada ativo.</p>
        </div>
      </div>
      <div className="grid g4">
        <Stat label="Patrimônio considerado" value={brl(alloc.total)} />
        <Stat label="Soma dos alvos" value={pct(alloc.targetSum, 0)} tone={Math.abs(alloc.targetSum - 100) < 0.01 ? 'pos' : 'neg'} sub={Math.abs(alloc.targetSum - 100) < 0.01 ? 'OK' : 'ajuste para 100%'} />
        <Stat label="Classe prioritária" value={alloc.priorityClass ? CLASS_LABEL[alloc.priorityClass] : '—'} tone="info" sub={best ? `melhor ativo elegível: ${d.assets.find((a) => a.id === best.assetId)?.ticker}` : 'sem ativo elegível na classe'} />
        <Stat label="Simular próximo aporte" value={<NumInput value={contrib} onChange={setContrib} />} />
      </div>
      <Card title="Atual × desejada" sub="Edite a alocação-alvo diretamente na tabela">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Classe</th><th className="num">Valor</th><th className="num">Atual</th><th className="num" style={{ width: 110 }}>Alvo</th><th className="num">Diferença</th><th>Situação</th><th className="num">Falta p/ alvo*</th><th className="num">Se o aporte for todo aqui</th></tr>
            </thead>
            <tbody>
              {alloc.rows.map((r) => (
                <tr key={r.cls}>
                  <td><span style={{ color: CLASS_COLOR[r.cls] }}>■</span> {CLASS_LABEL[r.cls]}</td>
                  <td className="num">{brl(r.value)}</td>
                  <td className="num">{pct(r.current)}</td>
                  <td className="num">
                    <NumInput className="sm" value={r.target} suffix="%" onChange={(v) => updateSettings((s) => ({ ...s, targetAllocation: { ...s.targetAllocation, [r.cls]: Math.max(0, v ?? 0) } }))} />
                  </td>
                  <td className={`num ${r.status === 'sub' ? 'warn-t' : r.status === 'sobre' ? 'neg' : 'pos'}`}>{signedPct(r.diff)}</td>
                  <td>{r.status === 'sub' ? <Badge tone="warn">▼ Subalocada</Badge> : r.status === 'sobre' ? <Badge tone="bad">▲ Sobrealocada</Badge> : <Badge tone="good">● Na banda (±{d.settings.allocationBand} p.p.)</Badge>}</td>
                  <td className="num">{r.gapValue > 0 ? brl(r.gapValue) : <span className="dim">excesso {brl(-r.gapValue)}</span>}</td>
                  <td className="num">{pct(r.afterContribution)} <span className="dim" style={{ fontSize: 11 }}>({signedPct(r.afterContribution - r.current)})</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>*Valor necessário para a classe atingir o alvo considerando o patrimônio + o próximo aporte de {brl(contrib)}.</p>
      </Card>
      <div className="grid g2">
        <Card title="Comparativo">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chart}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--dim)" fontSize={11} />
              <YAxis stroke="var(--dim)" fontSize={11} tickFormatter={(v) => v + '%'} width={40} />
              <Tooltip content={<ChartTip fmt={(v: number) => pct(v)} />} cursor={{ fill: 'rgba(47,140,255,.06)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Atual" fill="#2f8cff" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Alvo" fill="#2a3b5a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Leitura">
          <ul className="reasons">
            {alloc.rows.filter((r) => r.status === 'sub').map((r) => <li key={r.cls}>{CLASS_LABEL[r.cls]} está {pct(-r.diff)} abaixo do alvo — candidata a receber aportes, se houver ativo com preço adequado.</li>)}
            {alloc.rows.filter((r) => r.status === 'sobre').map((r) => <li key={r.cls}>{CLASS_LABEL[r.cls]} está {pct(r.diff)} acima do alvo — novos aportes nesta classe recebem peso menor. Não é necessário vender: o rebalanceamento acontece pelos aportes.</li>)}
            {alloc.total === 0 && <li>Sem posições registradas. Lance compras na Central de Operações.</li>}
          </ul>
          <Field label="Banda de tolerância" hint="Classes dentro da banda são consideradas alinhadas; fora dela, os aportes vão para o maior déficit (nunca se sugere venda). Editável em Parâmetros.">
            <span className="mono">±{d.settings.allocationBand} p.p.</span>
          </Field>
        </Card>
      </div>
      <div className="grid g2">
        <Card title="Exposição econômica" sub="O veículo pode diferir da exposição: BOVX11 é ETF, mas a exposição é a ações Brasil; ACWI11 e IVVB11 são exposição internacional.">
          <table className="tbl">
            <thead><tr><th>Exposição</th><th className="num">Valor</th><th className="num">Peso</th></tr></thead>
            <tbody>{economicExposure(d.assets, d.positions).map((e) => <tr key={e.key}><td>{EXPOSURE_LABEL[e.key]}</td><td className="num">{brl(e.value)}</td><td className="num">{pct(e.pct)}</td></tr>)}</tbody>
          </table>
        </Card>
        <Card title="Reserva de emergência" sub="Ativos marcados como reserva (no cadastro do ativo) ficam fora do cálculo de alocação.">
          <Stat label="Reserva" value={brl(reserveTotal(d.assets, d.positions))} sub={d.assets.filter((a) => a.isReserve).map((a) => a.ticker).join(', ') || 'nenhum ativo marcado'} />
        </Card>
      </div>
      <ReturnsBreakdown />
      <Disclaimer />
    </div>
  );
}
