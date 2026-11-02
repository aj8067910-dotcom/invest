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
import { isHeld } from '../domain/calc/positions';
import { investedSeries } from '../domain/calc/history';

export default function Dashboard() {
  const d = useDerived();
  const snapshotsRaw = useStore((s) => s.snapshots);
  // evolução: custo investido reconstruído pelo histórico (mensal) + valor de mercado registrado diariamente
  const snapshots = useMemo(() => {
    const months = investedSeries(d.positions, d.asOf).map((m) => ({ date: m.month + '-28', invested: Number(m.invested.toFixed(2)), value: null as number | null }));
    const first = snapshotsRaw[0]?.date;
    return [...months.filter((m) => !first || m.date < first), ...snapshotsRaw].sort((a, b) => a.date.localeCompare(b.date));
  }, [d.positions, d.asOf, snapshotsRaw]);
  const s = d.settings;
  const byId = useMemo(() => new Map(d.assets.map((a) => [a.id, a])), [d.assets]);
  const amount = s.profile.monthlyContribution;
  const plan = useMemo(
    () => planContribution({ amount, date: d.asOf, reserve: s.allocator.reserve, maxPerAsset: s.allocator.maxPerAsset, priorityClasses: s.allocator.priorityClasses, eligibleIds: null, includeMaintenance: s.allocator.includeMaintenance, mode: s.allocator.mode, maxAssets: s.allocator.maxAssets }, d.ranking, d.ctx),
    [d, amount, s.allocator],
  );
  const months = monthlyReceived(d.transactions, d.historyStart, d.asOf);
  const bazinRanked = d.ranking.filter((r) => r.bazin.applicable && r.bazin.margin !== null);
  const cheap = bazinRanked.filter((r) => r.bazin.band === 'oportunidade').sort((a, b) => b.bazin.margin! - a.bazin.margin!);
  const expensive = bazinRanked.filter((r) => r.bazin.margin! < 0).sort((a, b) => a.bazin.margin! - b.bazin.margin!);
  const top = d.ranking.filter((r) => r.priority === 'oportunidade').slice(0, 5);
  const robotAt = d.market.generatedAt;
  const ledgerAt = d.allTransactions.reduce((m, t) => ((t.updatedAt || '') > m ? t.updatedAt || '' : m), '') || null;
  const R = d.returns;
  const sectors = exposure(d.assets.filter((a) => a.class === 'acao' || a.class === 'fii'), d.positions, 'setor');
  const held = d.assets.filter((a) => isHeld(d.positions[a.id]));
  const firstGoal = s.goals.find((g) => g > d.forward.monthly) ?? s.goals[s.goals.length - 1];
  const progress = firstGoal ? Math.min(100, (d.forward.monthly / firstGoal) * 100) : 0;
  const thesisAlerts = d.ranking.flatMap((r) => r.alerts.filter((x) => x.level !== 'info').map((x) => ({ ...x, message: `${byId.get(r.assetId)?.ticker}: ${x.message}` })));
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
              Em <Link to="/dados">Dados & integrações</Link>, ative o <b>banco de dados na nuvem</b> para usar os mesmos dados em qualquer aparelho. Se já ativou em outro aparelho, informe o mesmo token e senha: tudo aparece aqui.
            </li>
            <li>
              Cotações, proventos, Tesouro Direto e indicadores do Banco Central chegam sozinhos (robô diário). Não é preciso token.
            </li>
            <li>
              Importe o extrato de movimentação da <b>Área do Investidor da B3</b> em <Link to="/operacoes">Central de Operações</Link> (compras, vendas e proventos de uma vez) ou registre manualmente. Preço médio e quantidade são calculados automaticamente.
            </li>
            <li>
              Preencha fundamentos na ficha de cada ativo (ROE, payout, vacância…). Sem eles o ranking limita a classificação a “Monitoramento”.
            </li>
          </ol>
        </Card>
      )}

      {d.upcoming.length > 0 && (
        <div className="note warn">
          <b>Data-com nos próximos 7 dias:</b>{' '}
          {d.upcoming.map((u) => `${u.ticker} (${u.type === 'jcp' ? 'JCP' : u.type === 'rendimento' ? 'rendimento' : u.type}, R$ ${u.perUnit.toLocaleString('pt-BR', { maximumFractionDigits: 6 })}/un., data-com ${dateBR(u.dataCom)})`).join(' · ')}.
          Quem tiver o ativo no fechamento do pregão da data-com recebe.
        </div>
      )}
      <div className="grid g4">
        <Stat label="Patrimônio" value={brlShort(d.totals.marketValue)} sub={d.totals.missingQuotes.length ? `${d.totals.missingQuotes.length} ativo(s) a preço de custo` : 'a valor de mercado (sem reserva de emergência)'} tone="info" seal={{ source: 'Livro + cotações B3', at: robotAt }} />
        <Stat label="Capital aportado" value={brlShort(d.totals.netContributed)} sub={`aportes externos − retiradas · reinvestido ${brlShort(d.totals.reinvestedIncome)} não conta`} seal={{ source: 'Livro de lançamentos', at: ledgerAt }} />
        <Stat label="Resultado acumulado" value={brl(d.totals.accumulatedResult)} sub="patrimônio + retiradas − aportes externos" tone={d.totals.accumulatedResult >= 0 ? 'pos' : 'neg'} seal={{ source: 'Livro + cotações B3', at: robotAt }} />
        <Stat
          label="Rentabilidade"
          value={R.twr === null ? '—' : `${R.twr >= 0 ? '+' : ''}${pct(R.twr * 100, 2)}`}
          sub={<>TWR (cotização) desde {dateBR(R.from)}{R.xirr !== null ? <> · TIR {R.xirr >= 0 ? '+' : ''}{pct(R.xirr * 100, 2)} a.a.</> : ''}{R.cdi !== null ? <> · CDI no período +{pct(R.cdi * 100, 2)}</> : ''}{R.approximated.length ? ` · ${R.approximated.length} ativo(s) a custo` : ''}</>}
          tone={R.twr !== null && R.twr < 0 ? 'neg' : 'pos'}
          seal={{ source: 'Livro + fechamentos mensais (B3/Yahoo) + CDI (BCB)', at: robotAt }}
        />
        <Stat label="DY da carteira (12m)" value={pct(d.dyPortfolio, 2)} sub={<>recebidos ÷ patrimônio · <Link to="/dividendos">Yield on Cost {pct(d.yieldOnCost, 2)}</Link> (projetado ÷ custo)</>} tone="pos" seal={{ source: 'Livro de lançamentos', at: ledgerAt }} />
        <Stat label="Média mensal de proventos" value={brl(d.income.avgMonthly12m)} sub={`últimos 12 meses ÷ 12 · provisionado ${brl(d.income.provisioned)}`} tone="pos" seal={{ source: 'Livro (data de pagamento)', at: ledgerAt }} />
        <Stat label="Crescimento da renda" value={d.income.growthPct === null ? '—' : signedPct(d.income.growthPct)} sub={d.income.growthLabel} tone={d.income.growthPct !== null && d.income.growthPct > 0 ? 'pos' : d.income.growthPct !== null ? 'neg' : undefined} seal={{ source: 'Livro (data de pagamento)', at: ledgerAt }} />
        <Stat label="Renda estimada (12m à frente)" value={brl(d.forward.monthly)} sub={`por mês · qtd atual × DPA de referência líquido`} tone="warn" tag={<DataTag kind="estimativa" />} seal={{ source: 'Proventos B3/CVM + livro', at: robotAt }} />
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
                        {qtyFmt(l.qty, l.asset.class)} × {brl(l.price)} = <b>{brl(l.cost)}</b>
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
              <div className="q">Quais ativos estão baratos (margem ≥ {pct(s.bands.margin, 0)})?</div>
              <div className="a">{cheap.length ? cheap.slice(0, 6).map((r) => `${byId.get(r.assetId)?.ticker} (margem +${pct(r.bazin.margin, 0)})`).join(' · ') : 'Nenhum com a margem exigida.'}</div>
            </div>
          </div>
          <div className="answer">
            <div style={{ flex: 1 }}>
              <div className="q">Quais estão caros (acima do preço-teto)?</div>
              <div className="a">{expensive.length ? expensive.slice(0, 6).map((r) => `${byId.get(r.assetId)?.ticker} (${pct(r.bazin.margin, 0)})`).join(' · ') : 'Nenhum acima do teto (ou faltam dados).'}</div>
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
        <Card title="Evolução patrimonial" sub="Custo investido reconstruído pelo histórico de operações e valor de mercado registrado diariamente">
          {snapshots.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={snapshots}>
                <defs>
                  <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#2f8cff" stopOpacity={0.35} />
                    <stop offset="1" stopColor="#2f8cff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dateBR} stroke="var(--dim)" fontSize={11} />
                <YAxis stroke="var(--dim)" fontSize={11} tickFormatter={(v) => brlShort(v)} width={80} />
                <Tooltip content={<ChartTip labelFmt={dateBR} />} />
                <Area type="monotone" dataKey="value" name="Patrimônio" stroke="#2f8cff" fill="url(#gv)" strokeWidth={2} connectNulls />
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
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthBR} stroke="var(--dim)" fontSize={11} />
                <YAxis stroke="var(--dim)" fontSize={11} tickFormatter={(v) => brlShort(v)} width={70} />
                <Tooltip content={<ChartTip labelFmt={monthBR} />} cursor={{ fill: 'rgba(47,140,255,.06)' }} />
                <Bar dataKey="received" name="Recebido" fill="#2fd38a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty>Registre proventos recebidos na Central de Operações para acompanhar a renda real.</Empty>
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
