import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bar, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDerived } from '../store/derived';
import { useStore } from '../store/store';
import type { Asset, CorporateEvent, Distribution, Fundamentals, ValuationInputs } from '../domain/types';
import { CLASS_LABEL, FII_TYPE_LABEL, INCOME_TX, TX_LABEL, isBazinClass } from '../domain/types';
import { AlertList, Badge, Card, DataTag, Disclaimer, Empty, Field, Meter, Modal, NumInput, ScoreRing, Stat, Tabs } from '../components/ui';
import { BandBadge, ChartTip, ClassBadge, PriorityBadge } from '../components/common';
import { Ladder } from '../components/Ladder';
import { AssetForm } from '../components/AssetForm';
import { brl, dateBR, dateTimeBR, num, pct, qtyFmt, signedPct } from '../domain/format';
import { BAND_INFO } from '../domain/calc/bazin';
import { annualHistory, avgDy, consecutiveYears, dividendCagr, paymentFrequency, suspectExtraordinary, ttmPerUnit } from '../domain/calc/dividends';
import { fairValueSummary, valuations } from '../domain/calc/valuation';
import { daysBetween, isNum, todayISO, uid } from '../domain/util';
import { toast } from '../components/toast';
import { syncQuotes } from '../services/sync';
import { parseDistributions, readSheet } from '../services/io';

type Tab = 'resumo' | 'teto' | 'dividendos' | 'fundamentos' | 'valuation' | 'eventos' | 'cadastro';

export default function AssetDetail() {
  const { id } = useParams();
  const d = useDerived();
  const a = d.assets.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>('resumo');
  if (!a) return <Empty>Ativo não encontrado. <Link to="/carteira">Voltar</Link></Empty>;
  const bz = isBazinClass(a.class);
  const tabs: { key: Tab; label: string }[] = [
    { key: 'resumo', label: 'Resumo & ranking' },
    { key: 'teto', label: bz ? 'Preço-teto & régua' : 'Métricas da classe' },
    ...(bz ? [{ key: 'dividendos' as Tab, label: 'Dividendos' }] : []),
    ...(a.class !== 'cripto' ? [{ key: 'fundamentos' as Tab, label: a.class === 'acao' ? 'Fundamentos' : a.class === 'fii' ? 'Ficha do FII' : a.class === 'etf' ? 'Ficha do ETF' : 'Ficha do título' }] : []),
    ...(bz ? [{ key: 'valuation' as Tab, label: 'Valuation' }] : []),
    { key: 'eventos', label: 'Eventos & fontes' },
    { key: 'cadastro', label: 'Cadastro' },
  ];
  return (
    <div className="stack">
      <Header a={a} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'resumo' && <Summary a={a} />}
      {tab === 'teto' && (bz ? <CeilingTab a={a} /> : <ClassMetrics a={a} />)}
      {tab === 'dividendos' && <DividendsTab a={a} />}
      {tab === 'fundamentos' && (a.class === 'etf' ? <EtfTab a={a} /> : a.class === 'tesouro' ? <ClassMetrics a={a} /> : <FundamentalsTab a={a} />)}
      {tab === 'valuation' && <ValuationTab a={a} />}
      {tab === 'eventos' && <EventsTab a={a} />}
      {tab === 'cadastro' && <RegistryTab a={a} />}
      <Disclaimer />
    </div>
  );
}

function Header({ a }: { a: Asset }) {
  const d = useDerived();
  const setQuote = useStore((s) => s.setQuote);
  const p = d.positions[a.id];
  const r = d.scoreById[a.id];
  const [manual, setManual] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="card hl">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 14 }}>
          <ScoreRing score={r.score} size={56} />
          <div>
            <div className="row" style={{ gap: 8 }}>
              <h1 className="mono" style={{ fontSize: 24 }}>{a.ticker}</h1>
              <ClassBadge c={a.class} />
              <Badge tone={a.status === 'carteira' ? 'info' : 'muted'}>{a.status === 'carteira' ? 'Carteira' : 'Watchlist'}</Badge>
              <PriorityBadge p={r.priority} />
              {r.bazin.applicable && <BandBadge b={r.bazin.band} />}
            </div>
            <div className="muted">
              {a.name} · {a.sector}
              {a.fiiType ? ` · ${FII_TYPE_LABEL[a.fiiType]}` : ''} · emissor: {a.issuer}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 22 }}>{brl(a.quote.price)}</div>
          <div>{a.quote.price === null ? <DataTag kind="ausente" /> : <DataTag kind={a.quote.kind === 'manual' ? 'manual' : 'real'} date={a.quote.date} source={a.quote.source} />}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>{a.quote.source || 'sem fonte'}</div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        {a.class !== 'tesouro' && (
          <button
            className="btn sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const rep = await syncQuotes({ ids: [a.id] });
              setBusy(false);
              toast(rep.failed.length ? `Falha: ${rep.failed[0].error}` : `Atualizado. ${rep.dividendsAdded} proventos novos.`, rep.failed.length > 0);
            }}
          >
            {busy ? 'Buscando…' : 'Buscar cotação e proventos'}
          </button>
        )}
        <span className="row" style={{ gap: 6 }}>
          <NumInput value={manual} onChange={setManual} placeholder={a.class === 'tesouro' ? 'PU manual' : 'Cotação manual'} className="sm" />
          <button
            className="btn sm"
            disabled={!manual}
            onClick={() => {
              setQuote(a.id, manual!, new Date().toISOString(), 'Manual');
              setManual(null);
              toast('Cotação manual registrada.');
            }}
          >
            Salvar manual
          </button>
        </span>
        <span className="muted" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
          {p.qty > 0 ? `${qtyFmt(p.qty)} un. · PM ${brl(p.avgPrice)} · ${brl(p.marketValue)}` : 'Sem posição'}
        </span>
      </div>
    </div>
  );
}

function Summary({ a }: { a: Asset }) {
  const d = useDerived();
  const p = d.positions[a.id];
  const r = d.scoreById[a.id];
  const txs = d.transactions.filter((t) => t.assetId === a.id).sort((x, y) => y.date.localeCompare(x.date));
  return (
    <div className="stack">
      <div className="grid g6">
        <Stat label="Quantidade" value={qtyFmt(p.qty)} sub={p.firstBuy ? `desde ${dateBR(p.firstBuy)}` : '—'} />
        <Stat label="Preço médio" value={brl(p.avgPrice)} sub={`custo ${brl(p.costBasis)}`} />
        <Stat label="Valor atual" value={brl(p.qty ? p.marketValue : 0)} sub={p.hasQuote ? 'a mercado' : 'a custo (sem cotação)'} />
        <Stat label="Valorização" value={p.unrealized === null ? '—' : brl(p.unrealized)} tone={(p.unrealized ?? 0) >= 0 ? 'pos' : 'neg'} sub={p.costBasis && p.unrealized !== null ? signedPct((p.unrealized / p.costBasis) * 100) : ''} />
        <Stat label="Proventos recebidos" value={brl(p.income)} tone="pos" tag={<DataTag kind="real" />} sub={p.reinvested ? `reinvestido ${brl(p.reinvested)}` : ''} />
        <Stat label="Retorno total" value={brl(p.totalReturn)} sub={p.totalReturnPct === null ? '' : signedPct(p.totalReturnPct)} tone={p.totalReturn >= 0 ? 'pos' : 'neg'} />
      </div>
      <div className="grid g2">
        <Card title="Composição da pontuação" sub={`Cobertura de dados ${pct(r.coverage, 0)} · pesos configuráveis em Parâmetros`}>
          <table className="tbl">
            <tbody>
              {r.criteria.map((c) => (
                <tr key={c.key}>
                  <td style={{ width: '38%' }}>
                    {c.label} <span className="dim mono" style={{ fontSize: 11 }}>×{c.weight}</span>
                  </td>
                  <td style={{ width: '30%' }}>{c.na ? <span className="dim">não se aplica</span> : c.score === null ? <DataTag kind="ausente" /> : <Meter value={c.score} tone={c.score >= 70 ? 'pos' : c.score >= 45 ? undefined : c.score >= 30 ? 'warn' : 'neg'} />}</td>
                  <td className="num" style={{ width: 40 }}>{c.score ?? '—'}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="stack">
          <Card title="Justificativa da classificação">
            <div className="row" style={{ marginBottom: 8 }}>
              <PriorityBadge p={r.priority} /> <span className="mono">{r.score}/100</span>
            </div>
            <ul className="reasons">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </Card>
          <Card title="Alertas da tese">{r.alerts.length ? <AlertList alerts={r.alerts} /> : <Empty>Sem alertas.</Empty>}</Card>
          {a.thesis && (
            <Card title="Tese">
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{a.thesis}</p>
            </Card>
          )}
        </div>
      </div>
      <Card title="Operações deste ativo" right={<Link className="btn sm" to={`/historico?ativo=${a.id}`}>Registrar operação</Link>}>
        {txs.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Data</th><th>Tipo</th><th className="num">Qtd</th><th className="num">Preço</th><th className="num">Valor</th></tr>
              </thead>
              <tbody>
                {txs.slice(0, 20).map((t) => (
                  <tr key={t.id}>
                    <td>{dateBR(t.date)}</td>
                    <td>{TX_LABEL[t.type]}{t.reinvest ? ' (reinvest.)' : ''}</td>
                    <td className="num">{t.qty ? qtyFmt(t.qty) : '—'}</td>
                    <td className="num">{brl(t.price)}</td>
                    <td className={`num ${INCOME_TX.includes(t.type) ? 'pos' : ''}`}>{brl(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nenhuma operação registrada.</Empty>
        )}
      </Card>
    </div>
  );
}

function CeilingTab({ a }: { a: Asset }) {
  const d = useDerived();
  const update = useStore((s) => s.updateAsset);
  const r = d.scoreById[a.id].bazin;
  const ttm = ttmPerUnit(a, d.asOf);
  const defaultDy = a.class === 'fii' ? d.settings.defaultDy.fii : d.settings.defaultDy.acao;
  return (
    <div className="stack">
      <div className="grid g2">
        <Card title="Parâmetros do preço-teto (Bazin)" sub="Preço-teto = provento anual recorrente por unidade ÷ DY-alvo">
          <div className="form-grid">
            <Field label="DY-alvo deste ativo" hint={`Vazio = padrão da classe (${defaultDy}%)`}>
              <NumInput value={a.dyTarget} suffix="%" onChange={(v) => update(a.id, { dyTarget: v })} />
            </Field>
            <Field label="Proventos recorrentes 12m" hint="Calculado do histórico (sem extraordinários)">
              <div className="mono" style={{ padding: '7px 0' }}>{brl(ttm.recurring)} <DataTag kind={ttm.recurring ? 'real' : 'ausente'} /></div>
            </Field>
            <Field label="Extraordinários 12m" hint="Excluídos do cálculo">
              <div className="mono warn-t" style={{ padding: '7px 0' }}>{brl(ttm.extraordinary)}</div>
            </Field>
            <Field label="Estimativa recorrente próximos 12m" hint="Por unidade; sua projeção">
              <NumInput value={a.next12mEstimate} onChange={(v) => update(a.id, { next12mEstimate: v })} />
            </Field>
            <Field label="Base do cálculo">
              <label className="chk" style={{ padding: '7px 0' }}>
                <input type="checkbox" checked={a.useEstimate} onChange={(e) => update(a.id, { useEstimate: e.target.checked })} /> usar estimativa
              </label>
            </Field>
            <Field label="Prioridade de compra (1–5)">
              <NumInput value={a.priority} onChange={(v) => update(a.id, { priority: Math.max(1, Math.min(5, Math.round(v ?? 3))) })} />
            </Field>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            Base usada: <b>{r.base.value ? brl(r.base.value) : '—'}</b> — {r.base.label} <DataTag kind={r.base.kind === 'real' ? 'real' : r.base.kind === 'estimativa' ? 'estimativa' : 'ausente'} />
          </p>
        </Card>
        <Card title="Resultado">
          <div className="grid g3">
            <Stat label="Preço-teto" value={brl(r.ceiling)} sub={`DY-alvo ${r.dyTarget}%`} tone="info" />
            <Stat label="Cotação" value={brl(r.price)} sub={r.ratio !== null ? `${pct(r.ratio, 1)} do teto` : ''} />
            <Stat label="DY atual (recorrente)" value={pct(r.dyCurrent, 2)} sub={r.dyTotal !== null && r.dyTotal !== r.dyCurrent ? `com extraord.: ${pct(r.dyTotal, 2)}` : ''} />
            <Stat label={r.discount !== null && r.discount < 0 ? 'Prêmio sobre o teto' : 'Desconto vs teto'} value={r.discount === null ? '—' : pct(Math.abs(r.discount), 1)} tone={r.discount === null ? undefined : r.discount >= 0 ? 'pos' : 'neg'} />
            <Stat label="Margem de segurança" value={pct(r.safetyMargin, 1)} tone={(r.safetyMargin ?? 0) >= 25 ? 'pos' : (r.safetyMargin ?? 0) > 0 ? 'warn' : 'neg'} />
            <Stat label="Preço ideal de entrada" value={brl(r.idealEntry)} sub={`≤ ${d.settings.bands.maintenance}% do teto (início da faixa de oportunidade)`} />
          </div>
        </Card>
      </div>
      <Card title="Régua inteligente de compra" sub="O marcador avança pelos degraus conforme a cotação se aproxima das zonas mais atrativas. Limites editáveis em Parâmetros.">
        <Ladder r={r} bands={d.settings.bands} />
        {r.band && (r.band === 'oportunidade' || r.band === 'extrema') && d.scoreById[a.id].alerts.some((x) => x.level !== 'info') && (
          <div className="note warn" style={{ marginTop: 10 }}>
            Queda de preço com alertas de fundamentos ativos: isto <b>não</b> é tratado como oportunidade automática. Revise a tese.
          </div>
        )}
      </Card>
      <div className="grid g2">
        <Card title="Distância até cada faixa">
          <table className="tbl">
            <thead><tr><th>Faixa</th><th className="num">Preço máximo</th><th className="num">Falta (R$)</th><th className="num">Falta (%)</th></tr></thead>
            <tbody>
              {r.levels.slice(1).map((l) => (
                <tr key={l.key}>
                  <td>{BAND_INFO[l.key].label}</td>
                  <td className="num">{brl(l.upperPrice)}</td>
                  <td className="num">{l.reached ? <span className="pos">atingida</span> : brl(l.distanceAbs)}</td>
                  <td className="num">{l.reached ? '—' : num(l.distancePct, 1) + '%'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Cenários de DY-alvo">
          <table className="tbl">
            <thead><tr><th>DY-alvo</th><th className="num">Preço-teto</th><th className="num">Preço/teto</th><th>Faixa</th></tr></thead>
            <tbody>
              {r.scenarios.map((s) => (
                <tr key={s.dy} style={s.dy === r.dyTarget ? { background: 'rgba(47,140,255,.08)' } : undefined}>
                  <td className="mono">{s.dy}%</td>
                  <td className="num">{brl(s.ceiling)}</td>
                  <td className="num">{pct(s.ratio, 0)}</td>
                  <td><BandBadge b={s.band} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function DividendsTab({ a }: { a: Asset }) {
  const d = useDerived();
  const { setDistributions, updateAsset } = useStore();
  const rows = annualHistory(a, d.asOf);
  const ttm = ttmPerUnit(a, d.asOf);
  const freq = paymentFrequency(a, d.asOf);
  const cagr = dividendCagr(rows);
  const sus = suspectExtraordinary(a);
  const r = d.scoreById[a.id];
  const sustain = r.criteria.find((c) => c.key === 'sustentabilidade');
  const [draft, setDraft] = useState<Partial<Distribution>>({ type: a.class === 'fii' ? 'rendimento' : 'dividendo', recurring: true });
  const [priceYear, setPriceYear] = useState<{ y: string; p: number | null }>({ y: String(new Date().getFullYear() - 1), p: null });
  const fileRef = useRef<HTMLInputElement>(null);
  const merge = useStore((s) => s.mergeDistributions);
  const received = d.transactions.filter((t) => t.assetId === a.id && INCOME_TX.includes(t.type));
  const sorted = [...a.distributions].sort((x, y) => y.exDate.localeCompare(x.exDate));
  const lastPay = sorted.find((x) => x.type !== 'amortizacao');

  return (
    <div className="stack">
      <div className="grid g6">
        <Stat label="DY atual (recorrente)" value={pct(r.bazin.dyCurrent, 2)} tag={<DataTag kind={r.bazin.dyCurrent ? 'real' : 'ausente'} />} />
        <Stat label="DY médio 5 anos" value={pct(avgDy(rows, 5), 2)} sub={avgDy(rows, 5) === null ? 'requer preço médio anual de 5 anos' : ''} />
        <Stat label="DY médio 10 anos" value={pct(avgDy(rows, 10), 2)} sub={avgDy(rows, 10) === null ? 'histórico insuficiente' : ''} />
        <Stat label="Proventos 12m / unidade" value={brl(ttm.total)} sub={`recorrente ${brl(ttm.recurring)} · extra ${brl(ttm.extraordinary)}`} />
        <Stat label="Crescimento (CAGR)" value={cagr === null ? '—' : signedPct(cagr)} sub={`${consecutiveYears(rows)} ano(s) seguidos pagando`} tone={cagr !== null && cagr > 0 ? 'pos' : undefined} />
        <Stat label="Frequência" value={freq.label} sub={`${num(freq.perYear, 1)} meses c/ pagamento/ano`} />
      </div>
      <div className="grid g3">
        <Stat label={a.class === 'fii' ? 'Último rendimento por cota' : 'Último provento'} value={brl(lastPay?.value)} sub={lastPay ? `data-com ${dateBR(lastPay.exDate)}` : ''} />
        <Stat label="Payout" value={a.class === 'fii' ? '≥95% (lei)' : pct(a.fundamentals.payout, 0)} sub={a.class === 'acao' && !isNum(a.fundamentals.payout) ? 'preencha em Fundamentos' : ''} />
        <Stat label="Sustentabilidade" value={sustain?.score ?? '—'} sub={sustain?.note} tone={(sustain?.score ?? 0) >= 65 ? 'pos' : (sustain?.score ?? 100) < 40 ? 'neg' : 'warn'} />
      </div>
      <Card title="Histórico anual de proventos por unidade" sub="Barras: recorrente × extraordinário · linha: DY sobre preço médio do ano">
        {rows.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={rows}>
              <CartesianGrid stroke="#1c2b46" vertical={false} />
              <XAxis dataKey="year" stroke="#56698a" fontSize={11} />
              <YAxis yAxisId="v" stroke="#56698a" fontSize={11} tickFormatter={(v) => 'R$' + num(v, 2)} width={60} />
              <YAxis yAxisId="dy" orientation="right" stroke="#56698a" fontSize={11} tickFormatter={(v) => v + '%'} width={40} />
              <Tooltip content={<ChartTip fmt={(v: number) => num(v, 4)} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="v" dataKey="recurring" stackId="a" name="Recorrente" fill="#2fd38a" />
              <Bar yAxisId="v" dataKey="extraordinary" stackId="a" name="Extraordinário" fill="#f5b83d" radius={[4, 4, 0, 0]} />
              <Line yAxisId="dy" dataKey="dy" name="DY %" stroke="#38c6f4" dot />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <Empty>Sem proventos cadastrados. Use “Buscar cotação e proventos” (brapi.dev), importe um CSV ou lance manualmente abaixo.</Empty>
        )}
      </Card>
      <div className="grid g2">
        <Card
          title="Proventos anunciados (por unidade)"
          sub="Marque como extraordinário o que não for renda recorrente. Pagamentos atípicos são sinalizados."
          right={
            <>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const { ds, errors } = parseDistributions(await readSheet(f));
                const n = merge(a.id, ds);
                toast(`${n} proventos importados.${errors.length ? ' ' + errors.slice(0, 3).join(' ') : ''}`, errors.length > 0 && n === 0);
                e.target.value = '';
              }} />
              <button className="btn sm" onClick={() => fileRef.current?.click()} title="Colunas: DataCom; Pagamento; Valor; Tipo; Recorrente (sim/nao)">Importar CSV/Excel</button>
            </>
          }
        >
          <div className="row" style={{ marginBottom: 10, gap: 6 }}>
            <input type="date" value={draft.exDate || ''} onChange={(e) => setDraft({ ...draft, exDate: e.target.value })} style={{ width: 150 }} title="Data-com" />
            <NumInput value={draft.value ?? null} onChange={(v) => setDraft({ ...draft, value: v ?? undefined })} placeholder="R$/unid." className="sm" />
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as any })} style={{ width: 130 }}>
              <option value="dividendo">Dividendo</option>
              <option value="jcp">JCP</option>
              <option value="rendimento">Rendimento</option>
              <option value="amortizacao">Amortização</option>
              <option value="outro">Outro</option>
            </select>
            <label className="chk"><input type="checkbox" checked={!draft.recurring} onChange={(e) => setDraft({ ...draft, recurring: !e.target.checked })} /> extraordinário</label>
            <button
              className="btn sm primary"
              disabled={!draft.exDate || !draft.value}
              onClick={() => {
                setDistributions(a.id, [...a.distributions, { id: uid(), exDate: draft.exDate!, payDate: null, value: draft.value!, type: draft.type as any, recurring: draft.recurring !== false, source: 'Manual' }].sort((x, y) => x.exDate.localeCompare(y.exDate)));
                setDraft({ ...draft, value: undefined });
              }}
            >
              Adicionar
            </button>
          </div>
          <div className="tbl-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Data-com</th><th>Pagamento</th><th>Tipo</th><th className="num">R$/unid.</th><th>Natureza</th><th>Fonte</th><th></th></tr></thead>
              <tbody>
                {sorted.map((x) => (
                  <tr key={x.id}>
                    <td>{dateBR(x.exDate)}</td>
                    <td>{dateBR(x.payDate)}</td>
                    <td>{x.type}</td>
                    <td className="num">{num(x.value, 6)}</td>
                    <td>
                      <button className="btn ghost sm" onClick={() => setDistributions(a.id, a.distributions.map((y) => (y.id === x.id ? { ...y, recurring: !y.recurring } : y)))} title="Alternar recorrente/extraordinário">
                        {x.recurring ? <Badge tone="good">recorrente</Badge> : <Badge tone="warn">extraordinário</Badge>}
                      </button>
                      {sus.has(x.id) && <Badge tone="warn" title="Valor > 2,5× a mediana dos pagamentos próximos">atípico</Badge>}
                    </td>
                    <td className="dim" style={{ fontSize: 12 }}>{x.source}</td>
                    <td><button className="btn ghost sm" onClick={() => setDistributions(a.id, a.distributions.filter((y) => y.id !== x.id))}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="stack">
          <Card title="Preço médio anual (para DY histórico)" sub="Informe o preço médio de cada ano para calcular DY médio de 5 e 10 anos">
            <div className="row" style={{ gap: 6, marginBottom: 8 }}>
              <input value={priceYear.y} onChange={(e) => setPriceYear({ ...priceYear, y: e.target.value })} style={{ width: 80 }} placeholder="Ano" />
              <NumInput value={priceYear.p} onChange={(v) => setPriceYear({ ...priceYear, p: v })} placeholder="Preço médio" className="sm" />
              <button className="btn sm" disabled={!priceYear.p || !/^\d{4}$/.test(priceYear.y)} onClick={() => { updateAsset(a.id, { annualPrices: { ...a.annualPrices, [priceYear.y]: priceYear.p! } }); setPriceYear({ y: String(Number(priceYear.y) - 1), p: null }); }}>Salvar</button>
            </div>
            <table className="tbl">
              <thead><tr><th>Ano</th><th className="num">Recorrente</th><th className="num">Extra</th><th className="num">Preço médio</th><th className="num">DY</th><th></th></tr></thead>
              <tbody>
                {[...rows].reverse().map((y) => (
                  <tr key={y.year}>
                    <td className="mono">{y.year}{!y.complete && <span className="dim"> (parcial)</span>}</td>
                    <td className="num">{num(y.recurring, 4)}</td>
                    <td className="num">{y.extraordinary ? num(y.extraordinary, 4) : '—'}</td>
                    <td className="num">{brl(y.avgPrice)}</td>
                    <td className="num">{pct(y.dy, 2)}</td>
                    <td>{a.annualPrices[String(y.year)] !== undefined && <button className="btn ghost sm" onClick={() => { const n = { ...a.annualPrices }; delete n[String(y.year)]; updateAsset(a.id, { annualPrices: n }); }}>✕</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Recebido por você" sub={<>Proventos efetivamente creditados <DataTag kind="real" /></>}>
            {received.length ? (
              <table className="tbl">
                <tbody>
                  {received.sort((x, y) => y.date.localeCompare(x.date)).slice(0, 12).map((t) => (
                    <tr key={t.id}><td>{dateBR(t.date)}</td><td>{TX_LABEL[t.type]}</td><td className="num pos">{brl(t.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>Nenhum provento recebido registrado.</Empty>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

const STOCK_FIELDS: [keyof Fundamentals, string, string?][] = [
  ['roe', 'ROE', '%'], ['roic', 'ROIC', '%'], ['netMargin', 'Margem líquida', '%'], ['ebitdaMargin', 'Margem EBITDA', '%'],
  ['pl', 'P/L', 'x'], ['pvp', 'P/VP', 'x'], ['evEbitda', 'EV/EBITDA', 'x'], ['netDebtEbitda', 'Dív. líq./EBITDA', 'x'],
  ['payout', 'Payout', '%'], ['fcf', 'FCF 12m (R$ mi)'], ['fcfYield', 'FCF yield', '%'], ['revenueGrowth', 'Cresc. receita (CAGR 5a)', '%'],
  ['earningsGrowth', 'Cresc. lucro (CAGR 5a)', '%'], ['lpa', 'LPA (R$)'], ['vpa', 'VPA (R$)'],
  ['governance', 'Governança (1–5)'], ['moat', 'Vantagem competitiva (1–5)'], ['sectorRisk', 'Risco setorial (1 baixo–5 alto)'],
];
const FII_FIELDS: [keyof Fundamentals, string, string?][] = [
  ['pvp', 'P/VP', 'x'], ['vacFisica', 'Vacância física', '%'], ['vacFinanceira', 'Vacância financeira', '%'], ['inadimplencia', 'Inadimplência', '%'],
  ['propertyQuality', 'Qualidade dos imóveis/carteira (1–5)'], ['tenantDiversification', 'Diversificação de inquilinos/devedores (1–5)'],
  ['concentration', 'Concentração no maior ativo', '%'], ['walt', 'Prazo médio contratos (anos)'], ['management', 'Gestão (1–5)'],
  ['leverage', 'Alavancagem (% PL)', '%'], ['distributionQuality', 'Qualidade/recorrência distribuições (1–5)'],
];

function FundamentalsTab({ a }: { a: Asset }) {
  const save = useStore((s) => s.saveFundamentals);
  const d = useDerived();
  const [f, setF] = useState<Fundamentals>({ ...a.fundamentals, updatedAt: todayISO(), source: a.fundamentals.source || '' });
  const fields = a.class === 'acao' ? STOCK_FIELDS : FII_FIELDS;
  const hist = [...(a.fundHistory || [])].reverse();
  const r = d.scoreById[a.id];
  return (
    <div className="stack">
      <Card
        title={a.class === 'acao' ? 'Ficha fundamentalista (padrão CNPI)' : `Ficha do FII — ${a.fiiType ? FII_TYPE_LABEL[a.fiiType] : 'tipo não definido'}`}
        sub={<>Preenchimento manual a partir de fontes primárias (RI, CVM, relatório gerencial). Última revisão: {a.fundamentals.updatedAt ? dateBR(a.fundamentals.updatedAt) : 'nunca'} {a.fundamentals.updatedAt ? <DataTag kind="manual" date={a.fundamentals.updatedAt} source={a.fundamentals.source} /> : <DataTag kind="ausente" />}</>}
      >
        <div className="form-grid">
          {fields.map(([k, label, suf]) => (
            <Field key={k} label={label}>
              <NumInput value={f[k] as number | null | undefined} suffix={suf} onChange={(v) => setF({ ...f, [k]: v })} />
            </Field>
          ))}
          <Field label="Data de referência"><input type="date" value={f.updatedAt || ''} onChange={(e) => setF({ ...f, updatedAt: e.target.value })} /></Field>
          <Field label="Fonte" hint="ex.: Release 3T26 (RI), Informe mensal CVM"><input value={f.source || ''} onChange={(e) => setF({ ...f, source: e.target.value })} /></Field>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn primary" onClick={() => { save(a.id, f); toast('Fundamentos salvos. Revisão adicionada ao histórico.'); }}>Salvar revisão</button>
        </div>
        {a.class === 'acao' && <p className="muted" style={{ fontSize: 12 }}>Para bancos e seguradoras, ROIC, margem EBITDA, Dív. líq./EBITDA e FCF não entram na pontuação.</p>}
      </Card>
      <div className="grid g2">
        <Card title="Alertas de deterioração" sub="Comparação com a revisão anterior e limites em Parâmetros">{r.alerts.length ? <AlertList alerts={r.alerts} /> : <Empty>Sem alertas.</Empty>}</Card>
        <Card title="Histórico de revisões">
          {hist.length ? (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Data</th>{fields.slice(0, 5).map(([k, l]) => <th key={k} className="num">{l.split(' (')[0]}</th>)}<th>Fonte</th></tr></thead>
                <tbody>
                  {hist.map((h) => (
                    <tr key={h.date}><td>{dateBR(h.date)}</td>{fields.slice(0, 5).map(([k]) => <td key={k} className="num">{num(h.data[k] as number, 1)}</td>)}<td className="dim" style={{ fontSize: 12 }}>{h.data.source}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Nenhuma revisão salva.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}

function EtfTab({ a }: { a: Asset }) {
  const d = useDerived();
  const e = a.etf;
  const held = d.assets.filter((x) => x.class === 'acao' && (d.positions[x.id]?.qty ?? 0) > 0 && e?.overlapTickers.includes(x.ticker));
  const otherEtfs = d.assets.filter((x) => x.class === 'etf' && x.id !== a.id && x.etf?.exposureTags.some((t) => e?.exposureTags.includes(t)));
  return (
    <div className="grid g2">
      <Card title="Ficha do ETF" sub="Edite em Cadastro">
        <dl className="kv">
          <dt>Índice de referência</dt><dd>{e?.index || '—'}</dd>
          <dt>Exposição geográfica</dt><dd>{e?.geography || '—'}</dd>
          <dt>Exposição setorial</dt><dd>{e?.sectorFocus || '—'}</dd>
          <dt>Taxa de administração</dt><dd>{isNum(e?.fee) ? pct(e!.fee, 2) + ' a.a.' : <DataTag kind="ausente" />}</dd>
          <dt>Liquidez média</dt><dd>{isNum(e?.liquidity) ? `R$ ${num(e!.liquidity, 0)} mil/dia` : <DataTag kind="ausente" />}</dd>
          <dt>Distribui rendimentos</dt><dd>{e?.distributes ? 'Sim' : 'Não (reinveste)'}</dd>
          <dt>Moeda</dt><dd>{a.currency === 'USD' ? 'Dólar / global' : 'Real'}</dd>
        </dl>
        <div className="note" style={{ marginTop: 12 }}>ETFs não são avaliados pelo método Bazin. A decisão de aporte considera a alocação da classe, custo e sobreposição.</div>
      </Card>
      <Card title="Sobreposição">
        <p className="muted" style={{ marginTop: 0 }}>Ações da carteira contidas no índice:</p>
        <p>{held.length ? held.map((x) => x.ticker).join(', ') : 'Nenhuma (ou lista não preenchida).'}</p>
        <p className="muted">ETFs com exposição semelhante:</p>
        <p>{otherEtfs.length ? otherEtfs.map((x) => `${x.ticker} (${x.etf?.exposureTags.filter((t) => e?.exposureTags.includes(t)).join(', ')})`).join(' · ') : 'Nenhum.'}</p>
        <p className="dim" style={{ fontSize: 12 }}>{a.notes}</p>
      </Card>
    </div>
  );
}

function ClassMetrics({ a }: { a: Asset }) {
  const d = useDerived();
  const update = useStore((s) => s.updateAsset);
  const p = d.positions[a.id];
  const cls = d.alloc.rows.find((r) => r.cls === a.class)!;
  const r = d.scoreById[a.id];
  if (a.class === 'etf') return <EtfTab a={a} />;
  if (a.class === 'tesouro') {
    const fx = a.fixed!;
    const years = fx.maturity ? daysBetween(d.asOf, fx.maturity) / 365 : null;
    return (
      <div className="stack">
        <div className="grid g4">
          <Stat label="Indexador" value={fx.indexer} sub={fx.coupons ? 'com cupons semestrais' : 'sem cupons (principal)'} />
          <Stat label="Vencimento" value={dateBR(fx.maturity)} sub={years !== null ? `${num(years, 1)} anos restantes` : ''} />
          <Stat label="Taxa contratada" value={isNum(fx.contractedRate) ? `${fx.indexer} ${num(fx.contractedRate, 2)}%` : '—'} tag={<DataTag kind={isNum(fx.contractedRate) ? 'manual' : 'ausente'} />} />
          <Stat label="Taxa atual de compra" value={isNum(fx.marketRate) ? `${fx.indexer} ${num(fx.marketRate, 2)}%` : '—'} tag={<DataTag kind={isNum(fx.marketRate) ? 'manual' : 'ausente'} date={fx.marketRateDate} />} sub={`referência de atratividade ${d.settings.scoring.goodRealRate}%`} />
        </div>
        <div className="grid g2">
          <Card title="Taxa atual" sub="Atualizada automaticamente pelo robô com o arquivo oficial do Tesouro. Você pode corrigir manualmente.">
            <div className="form-grid">
              <Field label="Taxa atual (% a.a.)"><NumInput value={fx.marketRate} suffix="%" onChange={(v) => update(a.id, { fixed: { ...fx, marketRate: v, marketRateDate: todayISO() } })} /></Field>
              <Field label="PU atual">
                <div className="mono" style={{ padding: '7px 0' }}>{brl(a.quote.price)} <span className="dim">(use “Salvar manual” no topo)</span></div>
              </Field>
            </div>
            <p style={{ marginBottom: 0 }}><a href="https://www.tesourodireto.com.br/titulos/precos-e-taxas.htm" target="_blank" rel="noreferrer">Preços e taxas — Tesouro Direto ↗</a></p>
          </Card>
          <Card title="Posição e marcação a mercado">
            <dl className="kv">
              <dt>Quantidade de títulos</dt><dd>{qtyFmt(p.qty)}</dd>
              <dt>Custo</dt><dd>{brl(p.costBasis)}</dd>
              <dt>Valor a mercado</dt><dd>{brl(p.marketValue)}</dd>
              <dt>Marcação a mercado</dt><dd className={(p.unrealized ?? 0) >= 0 ? 'pos' : 'neg'}>{p.unrealized === null ? '—' : brl(p.unrealized)}</dd>
              <dt>Juros/cupons recebidos</dt><dd>{brl(p.income)}</dd>
              <dt>IR (regressivo)</dt><dd>{p.firstBuy ? (() => { const dd = daysBetween(p.firstBuy, d.asOf); return dd <= 180 ? '22,5%' : dd <= 360 ? '20%' : dd <= 720 ? '17,5%' : '15%'; })() : '—'}</dd>
            </dl>
            <p className="note" style={{ marginTop: 10 }}>{r.reasons[0]}</p>
          </Card>
        </div>
      </div>
    );
  }
  // cripto
  return (
    <div className="grid g2">
      <Card title="Métricas do criptoativo" sub="Sem preço-teto: alocação e limite de risco">
        <dl className="kv">
          <dt>Papel na carteira</dt><dd>{a.crypto?.role || '—'}</dd>
          <dt>Preço (BRL)</dt><dd>{brl(a.quote.price)}</dd>
          <dt>Quantidade</dt><dd>{qtyFmt(p.qty)}</dd>
          <dt>Preço médio</dt><dd>{brl(p.avgPrice)}</dd>
          <dt>Variação vs PM</dt><dd>{p.unrealized !== null && p.costBasis ? signedPct((p.unrealized / p.costBasis) * 100) : '—'}</dd>
          <dt>Classe cripto na carteira</dt><dd>{pct(cls.current)} (alvo {pct(cls.target, 0)})</dd>
          <dt>Custódia</dt><dd>{a.crypto?.custody || '—'}</dd>
        </dl>
      </Card>
      <Card title="Leitura">
        <ul className="reasons">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <p className="note" style={{ marginTop: 10 }}>Cripto não gera proventos e não entra na renda passiva. Volatilidade elevada: o sistema limita a classificação a “Prioridade alta” e só quando a classe está abaixo do alvo.</p>
      </Card>
    </div>
  );
}

function ValuationTab({ a }: { a: Asset }) {
  const d = useDerived();
  const update = useStore((s) => s.updateAsset);
  const v = a.valuation || {};
  const set = (k: keyof ValuationInputs, val: number | null) => update(a.id, { valuation: { ...v, [k]: val } });
  const lines = useMemo(() => valuations(a, d.settings), [a, d.settings]);
  const sum = fairValueSummary(lines);
  const price = a.quote.price;
  return (
    <div className="stack">
      <div className="grid g2">
        <Card title="Premissas" sub="LPA e VPA vêm da aba Fundamentos">
          <h4 className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>GORDON</h4>
          <div className="form-grid">
            <Field label="Custo de capital (k)"><NumInput value={v.gordonK} suffix="%" onChange={(x) => set('gordonK', x)} /></Field>
            <Field label="Crescimento perpétuo (g)"><NumInput value={v.gordonG} suffix="%" onChange={(x) => set('gordonG', x)} /></Field>
          </div>
          <h4 className="muted" style={{ fontSize: 12, margin: '14px 0 8px' }}>FLUXO DE CAIXA DESCONTADO</h4>
          <div className="form-grid">
            <Field label="FCF por ação (R$)"><NumInput value={v.dcfFcfPerShare} onChange={(x) => set('dcfFcfPerShare', x)} /></Field>
            <Field label="Crescimento anos 1–5"><NumInput value={v.dcfGrowth} suffix="%" onChange={(x) => set('dcfGrowth', x)} /></Field>
            <Field label="Crescimento perpetuidade"><NumInput value={v.dcfTerminalGrowth} suffix="%" onChange={(x) => set('dcfTerminalGrowth', x)} /></Field>
            <Field label="Taxa de desconto"><NumInput value={v.dcfDiscount} suffix="%" onChange={(x) => set('dcfDiscount', x)} /></Field>
            <Field label="Dívida líquida por ação" hint="0 se FCF já for do acionista"><NumInput value={v.dcfNetDebtPerShare} onChange={(x) => set('dcfNetDebtPerShare', x)} /></Field>
          </div>
          <h4 className="muted" style={{ fontSize: 12, margin: '14px 0 8px' }}>MÚLTIPLOS</h4>
          <div className="form-grid">
            <Field label="P/L médio histórico"><NumInput value={v.plHist} suffix="x" onChange={(x) => set('plHist', x)} /></Field>
            <Field label="P/L médio do setor"><NumInput value={v.plSector} suffix="x" onChange={(x) => set('plSector', x)} /></Field>
            <Field label="P/VP médio histórico"><NumInput value={v.pvpHist} suffix="x" onChange={(x) => set('pvpHist', x)} /></Field>
          </div>
        </Card>
        <Card title="Resultados" sub={sum ? `Mediana de ${sum.count} métodos: ${brl(sum.median)} (faixa ${brl(sum.min)} – ${brl(sum.max)})` : 'Preencha premissas para calcular'}>
          <table className="tbl">
            <thead><tr><th>Método</th><th className="num">Valor/unid.</th><th className="num">vs cotação</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.method}>
                  <td>{l.method}<span className="tk-sub" style={{ maxWidth: 'none', whiteSpace: 'normal' }}>{l.note}</span></td>
                  <td className="num">{brl(l.value)}</td>
                  <td className={`num ${(l.upside ?? 0) >= 0 ? 'pos' : 'neg'}`}>{signedPct(l.upside)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sum && price && (
            <div className="note" style={{ marginTop: 10 }}>
              Cotação {brl(price)} vs valor justo mediano {brl(sum.median)}: margem de {signedPct((sum.median / price - 1) * 100)}. Valuation é estimativa; use junto com a qualidade e a sustentabilidade dos dividendos.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function EventsTab({ a }: { a: Asset }) {
  const update = useStore((s) => s.updateAsset);
  const [ev, setEv] = useState<Partial<CorporateEvent>>({ date: todayISO(), type: 'fato_relevante', impact: 'neutro' });
  const q = encodeURIComponent(`${a.ticker} ${a.name} relações com investidores`);
  const links: [string, string][] =
    a.class === 'fii'
      ? [
          ['FNET B3 — documentos do fundo', 'https://fnet.bmfbovespa.com.br/fnet/publico/abrirGerenciadorDocumentosCVM'],
          ['CVM — consulta de fundos', 'https://web.cvm.gov.br/app/fundosweb/#/consultaPublica'],
          ['Site do gestor (busca)', `https://www.google.com/search?q=${encodeURIComponent(a.ticker + ' relatório gerencial')}`],
        ]
      : a.class === 'tesouro'
        ? [['Tesouro Direto — preços e taxas', 'https://www.tesourodireto.com.br/titulos/precos-e-taxas.htm']]
        : [
            ['CVM — RAD (fatos relevantes, ITR, DFP)', 'https://www.rad.cvm.gov.br/ENET/frmConsultaExternaCVM.aspx'],
            ['B3 — empresas listadas', 'https://www.b3.com.br/pt_br/produtos-e-servicos/negociacao/renda-variavel/empresas-listadas.htm'],
            ['Relações com investidores (busca)', `https://www.google.com/search?q=${q}`],
          ];
  const events = [...(a.events || [])].sort((x, y) => y.date.localeCompare(x.date));
  return (
    <div className="grid g2">
      <Card title="Comunicados, fatos relevantes e resultados" sub="Registro manual. Eventos negativos dos últimos 90 dias geram alerta de revisão da tese.">
        <div className="form-grid" style={{ marginBottom: 10 }}>
          <Field label="Data"><input type="date" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} /></Field>
          <Field label="Tipo">
            <select value={ev.type} onChange={(e) => setEv({ ...ev, type: e.target.value as any })}>
              <option value="fato_relevante">Fato relevante</option>
              <option value="comunicado">Comunicado</option>
              <option value="resultado">Resultado trimestral</option>
              <option value="provento">Anúncio de provento</option>
              <option value="outro">Outro</option>
            </select>
          </Field>
          <Field label="Impacto na tese">
            <select value={ev.impact} onChange={(e) => setEv({ ...ev, impact: e.target.value as any })}>
              <option value="positivo">Positivo</option>
              <option value="neutro">Neutro</option>
              <option value="negativo">Negativo</option>
            </select>
          </Field>
          <Field label="Título / resumo" wide><input value={ev.title || ''} onChange={(e) => setEv({ ...ev, title: e.target.value })} /></Field>
          <Field label="Link (fonte primária)" wide><input value={ev.url || ''} onChange={(e) => setEv({ ...ev, url: e.target.value })} placeholder="https://" /></Field>
        </div>
        <button className="btn primary sm" disabled={!ev.title} onClick={() => { update(a.id, { events: [...(a.events || []), { id: uid(), date: ev.date!, type: ev.type as any, title: ev.title!, url: ev.url, impact: ev.impact as any }] }); setEv({ ...ev, title: '', url: '' }); }}>
          Registrar evento
        </button>
        <div style={{ marginTop: 14 }}>
          {events.length ? (
            <table className="tbl">
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{dateBR(e.date)}</td>
                    <td><Badge tone={e.impact === 'positivo' ? 'good' : e.impact === 'negativo' ? 'bad' : 'muted'}>{e.type.replace('_', ' ')}</Badge></td>
                    <td>{e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.title} ↗</a> : e.title}</td>
                    <td><button className="btn ghost sm" onClick={() => update(a.id, { events: a.events.filter((x) => x.id !== e.id) })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Nenhum evento registrado.</Empty>
          )}
        </div>
      </Card>
      <Card title="Fontes primárias" sub="Consulta direta (abre em nova aba)">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {links.map(([l, u]) => (
            <li key={u} style={{ margin: '6px 0' }}><a href={u} target="_blank" rel="noreferrer">{l} ↗</a></li>
          ))}
        </ul>
        <div className="note" style={{ marginTop: 14 }}>
          Cotação: {a.quote.source || 'sem fonte'} · {dateTimeBR(a.quote.date)}
          <br />
          Proventos: {a.distributions.length} registros ({[...new Set(a.distributions.map((x) => x.source))].join(', ') || '—'})
          <br />
          Fundamentos: {a.fundamentals.source || '—'} · {dateBR(a.fundamentals.updatedAt)}
        </div>
      </Card>
    </div>
  );
}

function RegistryTab({ a }: { a: Asset }) {
  const update = useStore((s) => s.updateAsset);
  const remove = useStore((s) => s.removeAsset);
  const nav = useNavigate();
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <Card title="Cadastro do ativo" sub={`Criado em ${dateBR(a.createdAt)} · atualizado em ${dateTimeBR(a.updatedAt)} · ${CLASS_LABEL[a.class]}`}>
      <AssetForm initial={a} onSave={(x) => { update(a.id, x); toast('Cadastro salvo.'); }} />
      <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '18px 0' }} />
      <button className="btn danger sm" onClick={() => setConfirmDel(true)}>Excluir ativo</button>
      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title={`Excluir ${a.ticker}?`}>
        <p>O ativo e todas as suas operações no histórico serão removidos. Considere mover para a watchlist em vez de excluir.</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => setConfirmDel(false)}>Cancelar</button>
          <button className="btn danger" onClick={() => { remove(a.id); nav('/carteira'); }}>Excluir definitivamente</button>
        </div>
      </Modal>
    </Card>
  );
}
