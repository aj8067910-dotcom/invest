import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDerived } from '../store/derived';
import { useStore } from '../store/store';
import { AlertList, Card, DataTag, Disclaimer, Empty, ScoreRing, Stat } from '../components/ui';
import { AssetLink, BandBadge, CLASS_COLOR, ChartTip, PriorityBadge } from '../components/common';
import { brl, brlShort, dateBR, monthBR, pct, qtyFmt, signedPct } from '../domain/format';
import { planContribution } from '../domain/calc/allocator';
import { monthlyReceived } from '../domain/calc/dividends';
import { exposure } from '../domain/calc/concentration';
import { CLASS_LABEL } from '../domain/types';
import { useMemo } from 'react';

export default function Dashboard() {
  const d = useDerived();
  const snapshots = useStore((s) => s.snapshots);
  const s = d.settings;
  const byId = useMemo(() => new Map(d.assets.map((a) => [a.id, a])), [d.assets]);
  const amount = s.profile.monthlyContribution;
  const plan = useMemo(
    () => planContribution({ amount, date: d.asOf, reserve: s.allocator.reserve, maxPerAsset: s.allocator.maxPerAsset, priorityClasses: s.allocator.priorityClasses, eligibleIds: null, includeMaintenance: s.allocator.includeMaintenance, mode: s.allocator.mode, maxAssets: s.allocator.maxAssets }, d.ranking, d.ctx),
    [d, amount, s.allocator],
  );
  const months = monthlyReceived(d.transactions, s.profile.startDate, d.asOf);
  const bazinRanked = d.ranking.filter((r) => r.bazin.applicable && r.bazin.ratio !== null);
  const cheap = bazinRanked.filter((r) => r.bazin.band === 'oportunidade' || r.bazin.band === 'extrema').sort((a, b) => a.bazin.ratio! - b.bazin.ratio!);
  const expensive = bazinRanked.filter((r) => r.bazin.ratio! > 100).sort((a, b) => b.bazin.ratio! - a.bazin.ratio!);
  const top = d.ranking.filter((r) => r.priority === 'maxima' || r.priority === 'alta').slice(0, 5);
  const sectors = exposure(d.assets.filter((a) => a.class === 'acao' || a.class === 'fii'), d.positions, 'setor');
  const held = d.assets.filter((a) => (d.positions[a.id]?.qty ?? 0) > 0);
  const firstGoal = s.goals.find((g) => g > d.forward.monthly) ?? s.goals[s.goals.length - 1];
  const progress = firstGoal ? Math.min(100, (d.forward.monthly / firstGoal) * 100) : 0;
  const thesisAlerts = d.ranking.flatMap((r) => r.alerts.filter((x) => x.level !== 'info').map((x) => ({ ...x, message: `${byId.get(r.assetId)?.ticker}: ${x.message}` })));
  const totalRet = d.totals.unrealized + d.totals.realized + d.totals.income;
  const monthsSince = Math.max(1, d.income.monthsOfHistory);

  return (
    <div className="stack">
      <div className="page-h">
        <div>
          <div className="kicker">Terminal pessoal · {dateBR(d.asOf)}</div>
          <h1>Painel de renda passiva</h1>
          <p>Comprar bons ativos com margem de segurança, receber dividendos sustentáveis, reinvestir e construir patrimônio. Mês {monthsSince} da jornada (início {dateBR(s.profile.startDate)}).</p>
        </div>
      </div>

      {!d.transactions.length && (
        <Card title="Primeiros passos" className="hl">
          <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)' }}>
            <li>
              Em <Link to="/dados">Dados & integrações</Link>, cadastre seu token gratuito da brapi.dev e clique em <b>Atualizar dados</b> (cotações e proventos da B3).
            </li>
            <li>
              Registre suas compras e proventos recebidos em <Link to="/historico">Histórico</Link> — ou importe CSV/Excel da Rico. Preço médio e quantidade são calculados automaticamente.
            </li>
            <li>
              Preencha fundamentos na ficha de cada ativo (ROE, payout, vacância…). Sem eles o ranking limita a classificação a “Monitoramento”.
            </li>
            <li>Tesouro IPCA+: informe PU e taxa atual manualmente (o Tesouro não oferece API aberta para navegador).</li>
          </ol>
        </Card>
      )}

      <div className="grid g6">
        <Stat label="Patrimônio" value={brlShort(d.totals.marketValue)} sub={d.totals.missingQuotes.length ? `${d.totals.missingQuotes.length} ativo(s) a preço de custo` : 'a valor de mercado'} tone="info" tag={<DataTag kind={d.totals.missingQuotes.length ? 'estimativa' : 'real'} />} />
        <Stat label="Investido (custo)" value={brlShort(d.totals.costBasis)} sub={`${held.length} ativos em carteira`} />
        <Stat label="Renda mensal (média 12m)" value={brl(d.income.avgMonthly12m)} sub={`último mês fechado: ${brl(d.income.lastMonth)}`} tone="pos" tag={<DataTag kind="real" />} />
        <Stat label="Renda mensal estimada" value={brl(d.forward.monthly)} sub={`${brl(d.forward.annual)}/ano com a carteira atual`} tone="warn" tag={<DataTag kind="estimativa" />} />
        <Stat label="Crescimento da renda" value={d.income.growthPct === null ? '—' : signedPct(d.income.growthPct)} sub={d.income.growthLabel || 'histórico insuficiente'} tone={d.income.growthPct && d.income.growthPct > 0 ? 'pos' : undefined} />
        <Stat label="Retorno total" value={brl(totalRet)} sub={`proventos ${brl(d.totals.income)} · valorização ${brl(d.totals.unrealized)}`} tone={totalRet >= 0 ? 'pos' : 'neg'} />
      </div>

      <div className="hero">
        <Card
          title={`Onde investir os próximos ${brl(amount)}?`}
          sub="Sugestão da central de aportes com os parâmetros atuais (qualidade → sustentabilidade → preço → alocação)."
          right={<Link className="btn sm" to="/aportes">Abrir central</Link>}
          className="hl"
        >
          {plan.lines.length ? (
            <div>
              {plan.lines.map((l) => (
                <div className="pick" key={l.asset.id}>
                  <ScoreRing score={l.result.score} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row between">
                      <AssetLink a={l.asset} sub={false} />
                      <span className="mono">
                        {qtyFmt(l.qty)} × {brl(l.price)} = <b>{brl(l.cost)}</b>
                      </span>
                    </div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{l.why.slice(0, 2).join(' ')}</div>
                  </div>
                </div>
              ))}
              <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
                Total {brl(plan.invested)} · sobra {brl(plan.leftover)}. {plan.summary.join(' ')}
              </p>
            </div>
          ) : (
            <div className="note warn">
              <b>Aguardar.</b> {plan.summary[plan.summary.length - 1]}
              {plan.excluded.length > 0 && <div style={{ marginTop: 6 }}>Mais próximos: {plan.excluded.slice(0, 4).map((e) => `${e.asset.ticker} (${e.reason})`).join(' · ')}</div>}
            </div>
          )}
        </Card>

        <Card title="Respostas rápidas">
          <div className="answer">
            <div style={{ flex: 1 }}>
              <div className="q">Quais ativos estão baratos?</div>
              <div className="a">{cheap.length ? cheap.slice(0, 6).map((r) => `${byId.get(r.assetId)?.ticker} (${pct(r.bazin.ratio, 0)} do teto)`).join(' · ') : 'Nenhum em faixa de oportunidade.'}</div>
            </div>
          </div>
          <div className="answer">
            <div style={{ flex: 1 }}>
              <div className="q">Quais estão caros (acima do preço-teto)?</div>
              <div className="a">{expensive.length ? expensive.slice(0, 6).map((r) => `${byId.get(r.assetId)?.ticker} (${pct(r.bazin.ratio, 0)})`).join(' · ') : 'Nenhum acima do teto (ou faltam dados).'}</div>
            </div>
          </div>
          <div className="answer">
            <div style={{ flex: 1 }}>
              <div className="q">Carteira diversificada? Concentração setorial?</div>
              <div className="a">
                {d.concAlerts.length ? `${d.concAlerts.length} alerta(s): ${d.concAlerts[0].message}` : held.length ? 'Dentro dos limites configurados.' : 'Sem posições registradas.'}
                {sectors[0] && <span className="muted"> Maior setor (ações+FIIs): {sectors[0].key} {pct(sectors[0].pct)}.</span>}
              </div>
            </div>
          </div>
          <div className="answer">
            <div style={{ flex: 1 }}>
              <div className="q">Estou evoluindo para a independência financeira?</div>
              <div className="a">
                Renda estimada {brl(d.forward.monthly)}/mês = {pct(progress, 0)} da meta de {brl(firstGoal)}.{' '}
                <Link to="/projecao">Ver projeção</Link>
              </div>
              <div className="bar-h" style={{ marginTop: 6 }}>
                <span style={{ width: `${progress}%`, background: 'var(--pos)' }} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid g2">
        <Card title="Prioridades do ranking" sub="Maior pontuação com travas de qualidade e risco" right={<Link className="btn sm" to="/ranking">Ranking completo</Link>}>
          {top.length ? (
            <table className="tbl">
              <tbody>
                {top.map((r) => {
                  const a = byId.get(r.assetId)!;
                  return (
                    <tr key={r.assetId}>
                      <td><AssetLink a={a} /></td>
                      <td><PriorityBadge p={r.priority} /></td>
                      <td>{r.bazin.applicable ? <BandBadge b={r.bazin.band} /> : <span className="muted">alocação</span>}</td>
                      <td className="num">{r.score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Empty>Nenhum ativo com prioridade alta ou máxima. Atualize cotações e preencha fundamentos.</Empty>
          )}
        </Card>
        <Card title="Alocação atual × alvo" right={<Link className="btn sm" to="/alocacao">Detalhar</Link>}>
          <div className="stack" style={{ gap: 10 }}>
            {d.alloc.rows.map((r) => (
              <div key={r.cls}>
                <div className="row between" style={{ fontSize: 12.5 }}>
                  <span><i style={{ display: 'inline-block', width: 8, height: 8, background: CLASS_COLOR[r.cls], borderRadius: 2, marginRight: 6 }} />{CLASS_LABEL[r.cls]}</span>
                  <span className="mono">
                    {pct(r.current)} <span className="dim">/ {pct(r.target, 0)}</span>{' '}
                    <span className={r.status === 'sub' ? 'warn-t' : r.status === 'sobre' ? 'neg' : 'pos'}>{signedPct(r.diff)}</span>
                  </span>
                </div>
                <div className="bar-h" style={{ position: 'relative', marginTop: 4 }}>
                  <span style={{ width: `${Math.min(100, r.current)}%`, background: CLASS_COLOR[r.cls] }} />
                  <i style={{ position: 'absolute', left: `${r.target}%`, top: -2, bottom: -2, width: 2, background: 'var(--text)' }} title="alvo" />
                </div>
              </div>
            ))}
            {d.alloc.priorityClass && <div className="note">Classe prioritária para novos aportes: <b>{CLASS_LABEL[d.alloc.priorityClass]}</b>.</div>}
          </div>
        </Card>
      </div>

      <div className="grid g2">
        <Card title="Evolução patrimonial" sub="Registro diário automático desde o primeiro uso">
          {snapshots.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={snapshots}>
                <defs>
                  <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#2f8cff" stopOpacity={0.35} />
                    <stop offset="1" stopColor="#2f8cff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1c2b46" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dateBR} stroke="#56698a" fontSize={11} />
                <YAxis stroke="#56698a" fontSize={11} tickFormatter={(v) => brlShort(v)} width={80} />
                <Tooltip content={<ChartTip labelFmt={dateBR} />} />
                <Area type="monotone" dataKey="value" name="Patrimônio" stroke="#2f8cff" fill="url(#gv)" strokeWidth={2} />
                <Area type="monotone" dataKey="invested" name="Investido" stroke="#7f93b3" fill="none" strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Empty>A curva aparece a partir do segundo dia com posições registradas.</Empty>
          )}
        </Card>
        <Card title="Proventos recebidos por mês" sub={<>Valores efetivamente recebidos <DataTag kind="real" /></>}>
          {months.some((m) => m.received > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={months}>
                <CartesianGrid stroke="#1c2b46" vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthBR} stroke="#56698a" fontSize={11} />
                <YAxis stroke="#56698a" fontSize={11} tickFormatter={(v) => brlShort(v)} width={70} />
                <Tooltip content={<ChartTip labelFmt={monthBR} />} cursor={{ fill: 'rgba(47,140,255,.06)' }} />
                <Bar dataKey="received" name="Recebido" fill="#2fd38a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty>Registre proventos recebidos no Histórico para acompanhar a renda real.</Empty>
          )}
        </Card>
      </div>

      <Card title="Alertas" sub="Revisão de tese e concentração">
        {thesisAlerts.length || d.concAlerts.length ? <AlertList alerts={[...thesisAlerts.filter((a) => a.level === 'danger'), ...d.concAlerts, ...thesisAlerts.filter((a) => a.level === 'warn')].slice(0, 14)} /> : <Empty>Nenhum alerta ativo.</Empty>}
      </Card>
      <Disclaimer />
    </div>
  );
}
