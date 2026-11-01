import { Fragment, useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../../store/store';
import { useDerived } from '../../store/derived';
import { Badge, Card, DataTag, Empty, Modal, Stat, Why } from '../../components/ui';
import { ChartTip } from '../../components/common';
import { TX_LABEL, INCOME_TX, type AuditEntry, type Transaction } from '../../domain/types';
import { brl, brlShort, dateBR, dateTimeBR, monthBR, pct, qtyFmt } from '../../domain/format';
import { investedSeries, monthlyCashflows, yearlyCashflows } from '../../domain/calc/history';
import { monthlyGains } from '../../domain/calc/gains';
import { BASKET_LABEL, type Basket } from '../../domain/calc/positions';
import { TAX_REFS } from '../../domain/tax';
import { txToValues } from '../../domain/opsheet';
import { EntryForm } from './EntryForm';
import { toast } from '../../components/toast';

// ───────────── histórico individual do ativo ─────────────
export function AssetLedger({ assetId, onSelect }: { assetId: string | null; onSelect: (id: string) => void }) {
  const d = useDerived();
  const [editing, setEditing] = useState<{ tx: Transaction; cat: any; values: Record<string, unknown> } | null>(null);
  const withOps = d.assets.filter((a) => d.positions[a.id].ledger.length).sort((a, b) => a.ticker.localeCompare(b.ticker));
  const a = d.assets.find((x) => x.id === assetId) || withOps[0];
  if (!a) return <Empty>Nenhuma operação registrada ainda.</Empty>;
  const p = d.positions[a.id];
  const incomeByYear = new Map<string, number>();
  for (const l of p.ledger) if (INCOME_TX.includes(l.tx.type)) incomeByYear.set(l.tx.date.slice(0, 4), (incomeByYear.get(l.tx.date.slice(0, 4)) || 0) + l.tx.amount);
  return (
    <div className="stack">
      <div className="row">
        <select value={a.id} onChange={(e) => onSelect(e.target.value)} style={{ width: 'auto' }} aria-label="Ativo">
          {withOps.map((x) => <option key={x.id} value={x.id}>{x.ticker} — {x.name}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 12.5 }}>{p.ledger.length} movimentações em ordem cronológica</span>
      </div>
      <div className="grid g6">
        <Stat label="Quantidade adquirida" value={qtyFmt(p.qtyBought)} sub={`custo total ${brl(p.totalBought)}`} />
        <Stat label="Quantidade vendida" value={qtyFmt(p.qtySold)} sub={`recebido ${brl(p.totalSold)}`} />
        <Stat label="Quantidade atual" value={p.valueOnly ? 'por valor' : qtyFmt(p.qty)} tone="info" />
        <Stat label="Preço médio" value={brl(p.avgPrice)} sub={`custo da posição ${brl(p.costBasis)}`} />
        <Stat label="Resultado realizado" value={brl(p.realized)} tone={p.realized >= 0 ? 'pos' : 'neg'} />
        <Stat label="Resultado não realizado" value={p.unrealized === null ? '—' : brl(p.unrealized)} tone={(p.unrealized ?? 0) >= 0 ? 'pos' : 'neg'} sub={p.hasQuote ? `cotação ${brl(p.price)}` : 'sem cotação'} />
      </div>
      {Object.keys(p.realizedByBasket).length > 0 && (
        <div className="note">Resultado realizado por cesta: {Object.entries(p.realizedByBasket).map(([b, v]) => `${BASKET_LABEL[b as Basket]} ${brl(v)}`).join(' · ')}</div>
      )}
      {(p.reviews.length > 0 || p.divergences.length > 0) && (
        <div className="note warn">
          {p.reviews.map((r, i) => <div key={'r' + i}>{dateBR(r.date)}: {r.message}</div>)}
          {p.divergences.map((v, i) => <div key={'d' + i}>{dateBR(v.date)}: quantidade total informada {qtyFmt(v.declared)} ≠ calculada {qtyFmt(v.computed)}.</div>)}
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Data</th><th>Movimentação</th><th className="num">Qtd</th><th className="num">Preço</th><th className="num">Valor</th><th className="num">Posição após</th><th className="num">PM após</th><th className="num">Custo após</th><th className="num">Realizado</th><th>Obs.</th><th></th></tr></thead>
          <tbody>
            {p.ledger.map((l) => (
              <tr key={l.tx.id}>
                <td className="nowrap">{dateBR(l.tx.date)}</td>
                <td>{TX_LABEL[l.tx.type]}{l.tx.reinvest ? ' · reinvest.' : ''}{l.tx.review && <> <Badge tone="warn" title={l.tx.review}>revisão</Badge></>}</td>
                <td className="num">{l.tx.qty ? qtyFmt(l.tx.qty) : '—'}</td>
                <td className="num">{l.tx.price ? brl(l.tx.price) : '—'}</td>
                <td className={`num ${INCOME_TX.includes(l.tx.type) ? 'pos' : ''}`}>{brl(l.tx.amount)}</td>
                <td className="num">{qtyFmt(l.qtyAfter)}</td>
                <td className="num">{l.qtyAfter ? brl(l.avgAfter) : '—'}</td>
                <td className="num">{brl(l.costAfter)}</td>
                <td className={`num ${l.realized > 0 ? 'pos' : l.realized < 0 ? 'neg' : 'dim'}`}>{l.realized ? brl(l.realized) : '—'}</td>
                <td className="dim" style={{ fontSize: 12 }}>{l.note || l.tx.notes || ''}{l.tx.broker ? ` · ${l.tx.broker}` : ''}</td>
                <td><button className="btn ghost sm" onClick={() => setEditing({ tx: l.tx, ...txToValues(l.tx, d.assets) })}>editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <GainsCard />
      {incomeByYear.size > 0 && (
        <Card title="Proventos recebidos por ano" sub={<>Valores creditados e rendimento sobre o custo atual <DataTag kind="real" /></>}>
          <table className="tbl">
            <thead><tr><th>Ano</th><th className="num">Recebido</th><th className="num">Yield on cost*</th></tr></thead>
            <tbody>{[...incomeByYear.entries()].sort().reverse().map(([y, v]) => <tr key={y}><td className="mono">{y}</td><td className="num pos">{brl(v)}</td><td className="num">{p.costBasis > 0 ? pct((v / p.costBasis) * 100, 2) : '—'}</td></tr>)}</tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>*Sobre o custo atual da posição; anos com posição diferente da atual são aproximados.</p>
        </Card>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar operação" wide>
        {editing && <EntryForm editing={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

// ───────────── ganho de capital por cesta ─────────────
function GainsCard() {
  const d = useDerived();
  const rows = useMemo(() => monthlyGains(d.positions, d.settings.tax), [d.positions, d.settings.tax]);
  if (!rows.length) return null;
  const tot = new Map<Basket, number>();
  for (const r of rows) tot.set(r.basket, (tot.get(r.basket) || 0) + r.result);
  return (
    <Card title="Resultado realizado por cesta de compensação (todos os ativos)" sub={<>Prejuízo só compensa dentro da mesma cesta. Estimativa: confirme com um contador. <Why text={TAX_REFS.gains} /></>}>
      <div className="row" style={{ marginBottom: 8 }}>
        {[...tot.entries()].map(([b, v]) => <Badge key={b} tone={v >= 0 ? 'good' : 'bad'}>{BASKET_LABEL[b]}: {v >= 0 ? '+' : ''}{brl(v)}</Badge>)}
      </div>
      <div className="tbl-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>Mês</th><th>Cesta</th><th className="num">Vendas</th><th className="num">Resultado</th><th>Isento</th><th className="num">Prejuízo usado</th><th className="num">Base</th><th className="num">IR estimado</th><th className="num">Prejuízo a compensar</th></tr></thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.month + r.basket}>
                <td>{monthBR(r.month)}</td>
                <td>{BASKET_LABEL[r.basket]}</td>
                <td className="num">{brl(r.sales)}</td>
                <td className={`num ${r.result >= 0 ? 'pos' : 'neg'}`}>{r.result >= 0 ? '+' : ''}{brl(r.result)}</td>
                <td>{r.exempt ? 'sim' : '—'}</td>
                <td className="num">{r.lossUsed ? brl(r.lossUsed) : '—'}</td>
                <td className="num">{brl(r.taxable)}</td>
                <td className="num">{r.ir ? brl(r.ir) : '—'}</td>
                <td className="num">{r.lossCarry ? brl(r.lossCarry) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ───────────── aportes ─────────────
export function ContributionsPanel() {
  const d = useDerived();
  const months = useMemo(() => monthlyCashflows(d.transactions), [d.transactions]);
  const years = useMemo(() => yearlyCashflows(months), [months]);
  const inv = useMemo(() => investedSeries(d.positions), [d.positions]);
  const ipca = d.market.series?.ipca;
  const chart = useMemo(() => {
    let acc = 0;
    let real = 0; // capital aportado corrigido pelo IPCA até o mês corrente
    const byM = new Map(inv.map((x) => [x.month, x.invested]));
    const ip = new Map(ipca || []);
    return months.map((m) => {
      acc += m.aportes - m.retiradas;
      real = real * (1 + (ip.get(m.month) ?? 0) / 100) + (m.aportes - m.retiradas);
      return { month: m.month, aportes: m.aportes, reinvestido: m.reinvestido, capital: acc, capitalIpca: ipca ? real : null, investido: byM.get(m.month) ?? null };
    });
  }, [months, inv, ipca]);
  const noAporte = months.filter((m) => m.aportes <= 0).length;
  const avgAporte = months.length ? months.reduce((s, m) => s + m.aportes, 0) / months.length : 0;
  if (!months.length) return <Empty>Nenhuma movimentação registrada.</Empty>;
  const t = d.totals;
  return (
    <div className="stack">
      <div className="grid g4">
        <Stat label="Capital novo aportado" value={brl(t.deposits)} tone="info" sub={`média mensal ${brl(avgAporte)} sobre ${months.length} meses · ${noAporte} sem aporte`} />
        <Stat label="Retiradas" value={brl(t.withdrawals)} />
        <Stat label="Proventos reinvestidos" value={brl(t.reinvestedIncome)} tone="pos" sub="não contam como aporte" />
        <Stat label="Custo investido hoje" value={brl(t.costBasis)} sub={!t.deposits ? '' : t.cash >= 0 ? `caixa estimado ${brl(t.cash)}` : 'aportes registrados não cobrem todas as compras'} />
      </div>
      <Card title="Aportes por mês e capital investido" sub="Barras: aportes externos e reinvestimentos · linhas: capital aportado acumulado e custo das posições (reconstruído pelo histórico)">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chart}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthBR} stroke="var(--dim)" fontSize={11} minTickGap={20} />
            <YAxis yAxisId="m" stroke="var(--dim)" fontSize={11} tickFormatter={brlShort} width={70} />
            <YAxis yAxisId="a" orientation="right" stroke="var(--dim)" fontSize={11} tickFormatter={brlShort} width={80} />
            <Tooltip content={<ChartTip labelFmt={monthBR} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="m" dataKey="aportes" name="Aportes" fill="#2f8cff" stackId="m" />
            <Bar yAxisId="m" dataKey="reinvestido" name="Reinvestido" fill="#2fd38a" stackId="m" radius={[3, 3, 0, 0]} />
            <Line yAxisId="a" dataKey="capital" name="Capital aportado (acum.)" stroke="#f5b83d" dot={false} strokeWidth={2} />
            {ipca && <Line yAxisId="a" dataKey="capitalIpca" name="Capital aportado corrigido pelo IPCA" stroke="#c49bff" dot={false} strokeDasharray="4 3" />}
            <Line yAxisId="a" dataKey="investido" name="Custo das posições" stroke="#38c6f4" dot={false} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Resumo anual">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Ano</th><th className="num">Aportes</th><th className="num">Retiradas</th><th className="num">Reinvestido</th><th className="num">Compras</th><th className="num">Vendas</th><th className="num">Proventos</th></tr></thead>
            <tbody>{[...years].reverse().map((y) => <tr key={y.year}><td className="mono">{y.year}</td><td className="num">{brl(y.aportes)}</td><td className="num">{brl(y.retiradas)}</td><td className="num pos">{brl(y.reinvestido)}</td><td className="num">{brl(y.compras)}</td><td className="num">{brl(y.vendas)}</td><td className="num pos">{brl(y.proventos)}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
      <Card title="Mês a mês">
        <div className="tbl-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Mês</th><th className="num">Aportes</th><th className="num">Retiradas</th><th className="num">Reinvestido</th><th className="num">Compras</th><th className="num">Proventos</th></tr></thead>
            <tbody>{[...months].reverse().filter((m) => m.aportes || m.retiradas || m.reinvestido || m.compras || m.proventos).map((m) => <tr key={m.month}><td>{monthBR(m.month)}</td><td className="num">{brl(m.aportes)}</td><td className="num">{brl(m.retiradas)}</td><td className="num">{brl(m.reinvestido)}</td><td className="num">{brl(m.compras)}</td><td className="num pos">{brl(m.proventos)}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ───────────── revisão manual ─────────────
export function ReviewPanel({ onOpenAsset }: { onOpenAsset: (id: string) => void }) {
  const d = useDerived();
  const items = d.assets.flatMap((a) => {
    const p = d.positions[a.id];
    return [
      ...p.reviews.map((r) => ({ a, date: r.date, kind: 'Revisão', msg: r.message })),
      ...p.divergences.map((v) => ({ a, date: v.date, kind: 'Divergência', msg: `Quantidade total informada ${qtyFmt(v.declared)} ≠ posição calculada ${qtyFmt(v.computed)}.` })),
    ];
  });
  const noAsset = d.transactions.filter((t) => t.review && !t.assetId);
  // eventos corporativos divulgados pela B3 sem lançamento correspondente no livro
  const evMap: Record<string, string> = { BONIFICACAO: 'bonificacao', DESDOBRAMENTO: 'desdobramento', GRUPAMENTO: 'grupamento' };
  for (const a of d.assets) {
    const p = d.positions[a.id];
    if (!p.firstBuy) continue;
    for (const ev of d.market.stockEvents?.[a.ticker] || []) {
      const type = evMap[(ev.label || '').toUpperCase()];
      if (!type || !ev.dataCom || ev.dataCom < p.firstBuy) continue;
      const has = d.transactions.some((t) => t.assetId === a.id && t.type === type && Math.abs(new Date(t.date).getTime() - new Date(ev.dataCom!).getTime()) <= 10 * 86400000);
      if (!has) items.push({ a, date: ev.dataCom, kind: 'Evento B3', msg: `${ev.label.toLowerCase()} (fator ${ev.factor.toLocaleString('pt-BR')}${type === 'bonificacao' ? '%' : ''}) com data-com ${ev.dataCom.split('-').reverse().join('/')} não está no livro. Lance o evento na Central (com o custo atribuído, se bonificação). Fonte: B3.` });
    }
  }
  if (!items.length && !noAsset.length) return <Empty>Nenhuma operação pendente de revisão. Todas puderam ser calculadas com segurança.</Empty>;
  return (
    <Card title={`${items.length + noAsset.length} item(ns) para revisão manual`} sub="Operações que o sistema não conseguiu calcular com segurança ou que divergem da quantidade informada. Corrija pela edição ou lance o que falta (ex.: saldo inicial).">
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Ativo</th><th>Data</th><th>Tipo</th><th>Motivo</th><th></th></tr></thead>
          <tbody>
            {items.sort((x, y) => x.date.localeCompare(y.date)).map((it, i) => (
              <tr key={i}><td className="mono">{it.a.ticker}</td><td className="nowrap">{dateBR(it.date)}</td><td><Badge tone={it.kind === 'Revisão' ? 'warn' : it.kind === 'Evento B3' ? 'bad' : 'info'}>{it.kind}</Badge></td><td style={{ fontSize: 12.5 }}>{it.msg}</td><td><button className="btn ghost sm" onClick={() => onOpenAsset(it.a.id)}>abrir histórico</button></td></tr>
            ))}
            {noAsset.map((t) => <tr key={t.id}><td>—</td><td>{dateBR(t.date)}</td><td><Badge tone="warn">Revisão</Badge></td><td>{t.review}</td><td></td></tr>)}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ───────────── importações ─────────────
export function ImportsPanel() {
  const { imports, revertImport, transactions } = useStore();
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!imports.length) return <Empty>Nenhuma importação realizada.</Empty>;
  const c = imports.find((b) => b.id === confirm);
  return (
    <Card title="Controle de importações" sub="Cada importação é um lote identificado. Reverter remove exatamente as operações daquele lote (e ativos criados por ele sem outras operações).">
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Data</th><th>Arquivo</th><th>Situação</th><th className="num">Linhas</th><th className="num">Gravadas</th><th className="num">Duplicadas</th><th className="num">Pendências</th><th className="num">Ainda no banco</th><th className="num">Volume</th><th></th></tr></thead>
          <tbody>
            {imports.map((b) => {
              const live = transactions.filter((t) => t.importId === b.id).length;
              return (
                <tr key={b.id}>
                  <td className="nowrap">{dateTimeBR(b.at)}</td>
                  <td style={{ fontSize: 12.5 }}>{b.fileName}<span className="tk-sub mono">{b.fileHash.slice(0, 12)}</span></td>
                  <td><Badge tone={b.status === 'concluida' ? 'good' : b.status === 'revertida' ? 'muted' : 'warn'}>{{ concluida: 'concluída', revertida: 'revertida', interrompida: 'interrompida', em_andamento: 'em andamento' }[b.status]}</Badge></td>
                  <td className="num">{b.totalRows}</td>
                  <td className="num">{b.imported}</td>
                  <td className="num">{b.skippedDuplicates}</td>
                  <td className="num">{b.pending}</td>
                  <td className="num">{live}</td>
                  <td className="num">{brl(b.volume)}</td>
                  <td>{b.status !== 'revertida' && live > 0 && <button className="btn ghost sm" onClick={() => setConfirm(b.id)}>reverter</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Importação interrompida: envie o mesmo arquivo em “Importar” e marque “retomar”. O que já foi gravado é reconhecido e não se repete.</p>
      <Modal open={!!c} onClose={() => setConfirm(null)} title="Reverter importação?">
        {c && (
          <div className="stack">
            <p style={{ margin: 0 }}>Serão removidas {transactions.filter((t) => t.importId === c.id).length} operações importadas de <b>{c.fileName}</b> em {dateTimeBR(c.at)}. Operações lançadas por você no site não são afetadas. Toda a carteira será recalculada e a reversão fica na auditoria.</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setConfirm(null)}>Cancelar</button>
              <button className="btn danger" onClick={() => { const n = revertImport(c.id); setConfirm(null); toast(`Importação revertida: ${n} operações removidas.`); }}>Reverter</button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

// ───────────── auditoria ─────────────
const ACTION_TONE: Record<AuditEntry['action'], string> = { criar: 'good', editar: 'info', excluir: 'bad', estornar: 'bad', corrigir: 'info', importar: 'info', reverter: 'warn', restaurar: 'warn', provento_auto: 'good', conciliar: 'info', migrar: 'muted' };

export function AuditPanel() {
  const { audit, addTransaction } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = audit.filter((e) => !q || e.summary.toLowerCase().includes(q.toLowerCase()) || e.action.includes(q.toLowerCase())).slice(0, 500);
  if (!audit.length) return <Empty>Nenhuma alteração registrada ainda.</Empty>;
  return (
    <Card title="Histórico de alterações" sub={`${audit.length} registro(s). Livro só de inclusão: correções e estornos guardam quem, quando, motivo e o valor anterior; um estorno pode ser relançado.`}>
      <input placeholder="Filtrar (ex.: ITUB4, excluir, importar)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} aria-label="Filtrar auditoria" />
      <div className="tbl-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>Quando</th><th>Ação</th><th>Descrição</th><th></th></tr></thead>
          <tbody>
            {list.map((e) => (
              <Fragment key={e.id}>
                <tr>
                  <td className="nowrap" style={{ fontSize: 12 }}>{dateTimeBR(e.at)}</td>
                  <td><Badge tone={ACTION_TONE[e.action]}>{e.action}</Badge></td>
                  <td style={{ fontSize: 12.5 }}>{e.summary}</td>
                  <td className="nowrap">
                    {(e.before || e.after) && <button className="btn ghost sm" onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? 'fechar' : 'detalhes'}</button>}
                    {(e.action === 'excluir' || e.action === 'estornar') && e.before && (
                      <button className="btn ghost sm" onClick={() => { const { id: _i, fingerprint: _f, ...t } = e.before as Transaction; const r = addTransaction({ ...(t as Transaction), notes: `${t.notes || ''} (relançado a partir do estorno)`.trim() }, { allowDuplicate: true }); toast(r.ok ? 'Operação relançada como novo lançamento.' : 'Não foi possível relançar.', !r.ok); }}>relançar</button>
                    )}
                  </td>
                </tr>
                {open === e.id && (
                  <tr>
                    <td colSpan={4} style={{ background: 'var(--bg2)' }}>
                      <div className="grid g2" style={{ fontSize: 12 }}>
                        {e.before && <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}><b>Antes</b>{'\n'}{JSON.stringify(e.before, null, 1)}</pre>}
                        {e.after && <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}><b>Depois</b>{'\n'}{JSON.stringify(e.after, null, 1)}</pre>}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
