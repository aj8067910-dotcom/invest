import { Fragment, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/store';
import type { AssetClass, ImportBatch, OpCategory } from '../../domain/types';
import { OP_CATEGORIES, OP_CATEGORY_LABEL, TX_LABEL } from '../../domain/types';
import { SHEETS, autoMap, buildRecords, detectKind, DATE_KEYS, type ImportRecord, type RawSheet, type SheetKind, type SheetPlan } from '../../domain/opsheet';
import { parseTransactions } from '../../services/io';
import { downloadTemplate, readWorkbook, runImport } from '../../services/opsio';
import { Badge, Card, Empty, Stat } from '../../components/ui';
import { brl, dateBR, dateTimeBR, qtyFmt } from '../../domain/format';
import { toast } from '../../components/toast';

const STEPS = ['Selecionar arquivo', 'Reconhecer os dados', 'Validar informações', 'Conferência', 'Processamento'];
const KIND_LABEL = (k: SheetKind) => (k === 'b3' ? 'Extrato da B3 (Área do Investidor)' : k === 'ignorar' ? 'Ignorar esta aba' : OP_CATEGORY_LABEL[k]);
const CLASS_OPTS: [AssetClass, string][] = [['acao', 'Ação'], ['fii', 'FII'], ['etf', 'ETF'], ['cripto', 'Cripto'], ['tesouro', 'Renda fixa']];

export function ImportWizard() {
  const { assets, transactions, imports } = useStore();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<{ name: string; hash: string } | null>(null);
  const [sheets, setSheets] = useState<RawSheet[]>([]);
  const [plans, setPlans] = useState<SheetPlan[]>([]);
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const [includes, setIncludes] = useState<Record<string, boolean>>({});
  const [classOverride, setClassOverride] = useState<Record<string, AssetClass>>({});
  const [filter, setFilter] = useState<'erro' | 'aviso' | 'duplicada' | 'todos'>('erro');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<ImportBatch | null>(null);
  const [resumeId, setResumeId] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  const previous = file ? imports.filter((b) => b.fileHash === file.hash && b.status !== 'revertida') : [];
  const interrupted = previous.find((b) => b.status === 'interrompida' || b.status === 'em_andamento');

  // validação ao vivo nas etapas 3 e 4; no processamento usa o último resultado conferido
  const live = useMemo(
    () => ((step === 2 || step === 3) && sheets.length ? buildRecords({ sheets, plans, assets, existing: transactions, edits, includes, classOverride, b3Parse: parseTransactions }) : null),
    [step, sheets, plans, edits, includes, classOverride, transactions, assets],
  );
  const lastResult = useRef(live);
  if (live) lastResult.current = live;
  const result = live ?? lastResult.current;

  const pick = async (f: File) => {
    setBusy(true);
    try {
      const wb = await readWorkbook(f);
      setFile({ name: f.name, hash: wb.hash });
      setSheets(wb.sheets);
      setPlans(wb.sheets.map((s) => {
        const kind = detectKind(s);
        return { name: s.name, kind, mapping: kind === 'b3' || kind === 'ignorar' ? {} : autoMap(kind, s.headers) };
      }));
      setEdits({});
      setIncludes({});
      setClassOverride({});
      setReport(null);
      setProgress(null);
      setResumeId(undefined);
      setStep(1);
    } catch (e: any) {
      toast('Não foi possível ler o arquivo: ' + (e?.message || e), true);
    } finally {
      setBusy(false);
    }
  };

  const setPlan = (i: number, p: Partial<SheetPlan>) =>
    setPlans((ps) => ps.map((x, j) => {
      if (j !== i) return x;
      const n = { ...x, ...p };
      if (p.kind && p.kind !== x.kind) n.mapping = p.kind === 'b3' || p.kind === 'ignorar' ? {} : autoMap(p.kind, sheets[i].headers);
      return n;
    }));

  const process = async () => {
    if (!result || !file) return;
    setBusy(true);
    setStep(4);
    try {
      const b = await runImport(result, file.name, file.hash, setProgress, resumeId);
      setReport(b);
      toast(`Importação concluída: ${b.imported} operações gravadas.`);
    } catch (e: any) {
      toast('A importação foi interrompida: ' + (e?.message || e) + '. Envie o mesmo arquivo para retomar.', true);
      setReport(useStore.getState().imports.find((x) => x.fileHash === file.hash) || null);
    } finally {
      setBusy(false);
    }
  };

  const downloadPending = async () => {
    if (!result) return;
    const XLSX = await import('xlsx');
    const rows = result.records.filter((r) => r.status === 'erro').map((r) => ({ Aba: r.sheet, Linha: r.row, Problemas: r.issues.filter((i) => i.level === 'erro').map((i) => i.msg).join(' | '), ...Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : v])) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Pendências');
    XLSX.writeFile(wb, `pendencias-${file?.name.replace(/\.[^.]+$/, '')}.xlsx`);
  };

  const shown = result ? result.records.filter((r) => filter === 'todos' || r.status === filter) : [];

  return (
    <div className="stack">
      <ol className="wizard">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <span className="mono">{i + 1}</span> {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card title="Etapa 1 — Selecionar arquivo" sub="XLSX (todas as abas) ou CSV. Nada é gravado antes da sua confirmação na etapa 4.">
          <div className="stack">
            <div className="row">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />
              <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Lendo arquivo…' : 'Selecionar arquivo'}</button>
              <button className="btn" onClick={() => downloadTemplate()}>Baixar modelo oficial (XLSX)</button>
            </div>
            <ul className="reasons">
              <li>Modelo oficial: 8 abas (Ações, FIIs, ETFs, Renda Fixa, Proventos, Aportes, Eventos Corporativos, Transferências) com os nomes de coluna exatos e uma aba de instruções.</li>
              <li>Sua própria planilha também serve: as colunas são reconhecidas por nome e você pode ajustar o mapeamento na etapa 2.</li>
              <li>Extratos de Movimentação e Negociação da Área do Investidor da B3 são reconhecidos automaticamente.</li>
              <li>Reimportar um arquivo (ou um arquivo com operações que já existem) não duplica nada.</li>
            </ul>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card title="Etapa 2 — Reconhecer os dados" sub={`${file?.name} · ${sheets.length} aba(s). Confira a categoria de cada aba e de onde vem cada campo.`}>
          {previous.length > 0 && (
            <div className={`note ${interrupted ? 'warn' : ''}`} style={{ marginBottom: 12 }}>
              {interrupted ? (
                <>
                  Este arquivo tem uma importação <b>interrompida</b> em {dateTimeBR(interrupted.at)} ({interrupted.imported} de {interrupted.toImport} gravadas).{' '}
                  <label className="chk"><input type="checkbox" checked={resumeId === interrupted.id} onChange={(e) => setResumeId(e.target.checked ? interrupted.id : undefined)} /> retomar essa importação (o que já foi gravado é reconhecido e não se repete)</label>
                </>
              ) : (
                <>Este mesmo arquivo já foi importado em {dateTimeBR(previous[0].at)}. As operações já gravadas serão reconhecidas como duplicadas e não serão importadas de novo.</>
              )}
            </div>
          )}
          <div className="stack">
            {sheets.map((s, i) => {
              const plan = plans[i];
              const cat = plan.kind !== 'b3' && plan.kind !== 'ignorar' ? (plan.kind as OpCategory) : null;
              const missing = cat ? SHEETS[cat].fields.filter((f) => f.required && !plan.mapping[f.key]) : [];
              return (
                <div key={s.name} className="card" style={{ background: 'var(--bg2)' }}>
                  <div className="row between">
                    <b>{s.name} <span className="dim mono" style={{ fontWeight: 400 }}>{s.rows.length} linhas</span></b>
                    <select value={plan.kind} onChange={(e) => setPlan(i, { kind: e.target.value as SheetKind })} style={{ width: 'auto' }} aria-label={`Categoria da aba ${s.name}`}>
                      {OP_CATEGORIES.map((c) => <option key={c} value={c}>{OP_CATEGORY_LABEL[c]}</option>)}
                      <option value="b3">{KIND_LABEL('b3')}</option>
                      <option value="ignorar">{KIND_LABEL('ignorar')}</option>
                    </select>
                  </div>
                  {cat && (
                    <div className="tbl-wrap" style={{ marginTop: 8 }}>
                      <table className="tbl">
                        <thead><tr><th>Campo da plataforma</th><th>Coluna do arquivo</th><th>Exemplo (1ª linha)</th></tr></thead>
                        <tbody>
                          {SHEETS[cat].fields.map((f) => {
                            const col = plan.mapping[f.key];
                            const ex = col ? s.rows.find((r) => String(r[col] ?? '').trim() !== '')?.[col] : undefined;
                            return (
                              <tr key={f.key}>
                                <td>{f.header}{f.required && <span className={col ? 'dim' : 'neg'}> *</span>}</td>
                                <td>
                                  <select value={col || ''} onChange={(e) => setPlan(i, { mapping: { ...plan.mapping, [f.key]: e.target.value || null } })} aria-label={`Coluna para ${f.header}`}>
                                    <option value="">— não mapeado —</option>
                                    {s.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                  </select>
                                </td>
                                <td className="dim mono" style={{ fontSize: 12 }}>{ex instanceof Date ? dateBR(ex.toISOString()) : String(ex ?? '')}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {missing.length > 0 && cat !== 'renda_fixa' && <p className="warn-t" style={{ fontSize: 12.5, margin: '8px 0 0' }}>Obrigatórios sem coluna: {missing.map((f) => f.header).join(', ')}. As linhas ficarão com pendência (dá para corrigir na etapa 3).</p>}
                  {plan.kind === 'b3' && <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>Compras, vendas, proventos e Tesouro do extrato da B3 serão convertidos automaticamente.</p>}
                </div>
              );
            })}
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <button className="btn ghost" onClick={() => setStep(0)}>Voltar</button>
            <button className="btn primary" disabled={!plans.some((p) => p.kind !== 'ignorar')} onClick={() => { setStep(2); setFilter('erro'); }}>Validar</button>
          </div>
        </Card>
      )}

      {(step === 2 || step === 3) && result && (
        <>
          <div className="grid g6">
            <Stat label="Registros lidos" value={String(result.stats.total)} />
            <Stat label="Válidos" value={String(result.stats.valid)} tone="pos" />
            <Stat label="Com avisos" value={String(result.stats.withIssues)} tone="warn" sub="importáveis" />
            <Stat label="Pendências" value={String(result.stats.errors)} tone={result.stats.errors ? 'neg' : undefined} sub="não serão importados sem correção" />
            <Stat label="Duplicidades" value={String(result.stats.duplicates)} sub="ignoradas por padrão" />
            <Stat label="Serão importados" value={String(result.stats.toImport)} tone="info" sub={brl(result.stats.volume)} />
          </div>
        </>
      )}

      {step === 2 && result && (
        <Card title="Etapa 3 — Validar informações" sub="Nenhum registro é descartado em silêncio: corrija, inclua ou exclua cada um. As correções valem só para esta importação (o arquivo original não é alterado).">
          {result.newAssets.length > 0 && (
            <div className="note" style={{ marginBottom: 12 }}>
              <b>Ativos não cadastrados</b> — serão criados na importação. Confira a classe:
              <div className="row" style={{ marginTop: 6 }}>
                {result.newAssets.map((n) => (
                  <label key={n.ticker} className="chk">
                    <span className="mono">{n.ticker}</span>
                    <select value={n.cls} onChange={(e) => setClassOverride({ ...classOverride, [n.ticker]: e.target.value as AssetClass })} style={{ width: 'auto' }}>
                      {CLASS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="row" style={{ marginBottom: 10 }}>
            {(['erro', 'aviso', 'duplicada', 'todos'] as const).map((f) => (
              <button key={f} className={`btn sm ${filter === f ? 'primary' : ''}`} onClick={() => setFilter(f)}>
                {{ erro: 'Pendências', aviso: 'Avisos', duplicada: 'Duplicidades', todos: 'Todos' }[f]}{' '}
                <span className="mono">{f === 'todos' ? result.records.length : result.records.filter((r) => r.status === f).length}</span>
              </button>
            ))}
            {result.stats.errors > 0 && <button className="btn sm ghost" onClick={downloadPending}>Baixar pendências (XLSX)</button>}
          </div>
          {shown.length ? (
            <div className="tbl-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
              <table className="tbl">
                <thead><tr><th>Incluir</th><th>Aba / linha</th><th>Operação</th><th>Situação</th><th>Detalhes</th><th></th></tr></thead>
                <tbody>
                  {shown.slice(0, 500).map((r) => (
                    <Fragment key={r.key}>
                      <tr>
                        <td><input type="checkbox" aria-label="Incluir registro" checked={r.include} disabled={r.status === 'erro'} onChange={(e) => setIncludes({ ...includes, [r.key]: e.target.checked })} /></td>
                        <td className="nowrap dim" style={{ fontSize: 12 }}>{r.sheet} · {r.row}</td>
                        <td style={{ fontSize: 12.5 }}>{summary(r)}</td>
                        <td><StatusBadge r={r} /></td>
                        <td style={{ fontSize: 12 }}>{r.issues.map((i, k) => <div key={k} className={i.level === 'erro' ? 'neg' : 'muted'}>{i.msg}</div>)}</td>
                        <td>{r.kind !== 'b3' && <button className="btn ghost sm" onClick={() => setOpen(open === r.key ? null : r.key)}>{open === r.key ? 'fechar' : 'corrigir'}</button>}</td>
                      </tr>
                      {open === r.key && r.kind !== 'b3' && r.kind !== 'ignorar' && (
                        <tr>
                          <td colSpan={6} style={{ background: 'var(--bg2)' }}>
                            <RowEditor cat={r.kind as OpCategory} record={r} onChange={(k, v) => setEdits({ ...edits, [r.key]: { ...(edits[r.key] || {}), [k]: v } })} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {shown.length > 500 && <p className="muted" style={{ fontSize: 12 }}>Mostrando 500 de {shown.length}. Use os filtros acima.</p>}
            </div>
          ) : (
            <Empty>{filter === 'erro' ? 'Nenhuma pendência.' : 'Nada nesta lista.'}</Empty>
          )}
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <button className="btn ghost" onClick={() => setStep(1)}>Voltar</button>
            <button className="btn primary" onClick={() => setStep(3)}>Ir para a conferência</button>
          </div>
        </Card>
      )}

      {step === 3 && result && (
        <Card title="Etapa 4 — Conferência" sub="Revise o resumo. Ao confirmar, as operações são gravadas em lotes e todos os módulos são recalculados.">
          <div className="grid g2">
            <table className="tbl">
              <thead><tr><th>Categoria</th><th className="num">Operações</th></tr></thead>
              <tbody>
                {OP_CATEGORIES.filter((c) => result.stats.byCategory[c]).map((c) => <tr key={c}><td>{OP_CATEGORY_LABEL[c]}</td><td className="num">{result.stats.byCategory[c]}</td></tr>)}
              </tbody>
              <tfoot><tr><td>Total a importar</td><td className="num">{result.stats.toImport}</td></tr></tfoot>
            </table>
            <div className="stack" style={{ gap: 8 }}>
              <div className="note">Volume financeiro identificado: <b className="mono">{brl(result.stats.volume)}</b></div>
              <div className="note">Ativos novos: <b>{result.newAssets.map((n) => n.ticker).join(', ') || 'nenhum'}</b></div>
              {result.stats.errors > 0 && <div className="note warn">{result.stats.errors} registro(s) com pendência <b>não</b> serão importados. Volte à etapa 3 para corrigir ou baixe a lista de pendências.</div>}
              {result.stats.duplicates > 0 && <div className="note">{result.stats.duplicates} duplicidade(s) ignorada(s) (já existem na plataforma).</div>}
              <div className="note">A importação fica registrada como um lote: você pode revertê-la inteira depois, em “Importações”.</div>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <button className="btn ghost" onClick={() => setStep(2)}>Voltar</button>
            <button className="btn primary" disabled={busy || result.stats.toImport === 0} onClick={process}>Autorizar e importar {result.stats.toImport} operações</button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card title="Etapa 5 — Processamento">
          {progress && (
            <div style={{ marginBottom: 12 }}>
              <div className="bar-h" style={{ height: 12 }}><span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%`, background: 'var(--pos)' }} /></div>
              <p className="muted mono" style={{ fontSize: 12 }}>{progress.done} / {progress.total}</p>
            </div>
          )}
          {report ? (
            <div className="stack">
              <div className="grid g4">
                <Stat label="Situação" value={report.status === 'concluida' ? 'Concluída' : 'Interrompida'} tone={report.status === 'concluida' ? 'pos' : 'neg'} />
                <Stat label="Operações gravadas" value={String(report.imported)} tone="pos" />
                <Stat label="Duplicadas ignoradas" value={String(report.skippedDuplicates)} />
                <Stat label="Pendências não importadas" value={String(report.pending)} tone={report.pending ? 'warn' : undefined} />
              </div>
              <ul className="reasons">
                <li>Ativos criados: {report.newAssets.join(', ') || 'nenhum'}.</li>
                <li>Excluídos por você: {report.excluded}.</li>
                <li>Carteira, preço médio, proventos, aportes, alocação, concentração, ranking e projeção já foram recalculados.</li>
                <li>Operações que não puderam ser calculadas com segurança aparecem na aba “Revisão”.</li>
              </ul>
              <div className="row">
                {result && result.stats.errors > 0 && <button className="btn" onClick={downloadPending}>Baixar pendências (XLSX)</button>}
                <button className="btn primary" onClick={() => { setStep(0); setFile(null); setSheets([]); setReport(null); setProgress(null); }}>Nova importação</button>
              </div>
            </div>
          ) : (
            <p className="muted">Gravando…</p>
          )}
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ r }: { r: ImportRecord }) {
  if (r.status === 'erro') return <Badge tone="bad">pendência</Badge>;
  if (r.status === 'duplicada') return <Badge tone="muted">duplicada</Badge>;
  if (r.status === 'aviso') return <Badge tone="warn">aviso</Badge>;
  return <Badge tone="good">ok</Badge>;
}

function summary(r: ImportRecord) {
  const t = r.tx;
  if (t) return `${TX_LABEL[t.type]} ${t.ticker || ''} ${t.qty ? qtyFmt(t.qty) + ' ' : ''}· ${dateBR(t.date)} · ${brl(t.amount)}`;
  const v = r.values;
  return [v.ativo, v.tipoOrdem || v.tipoProvento || v.tipoMovimentacao || v.tipoEvento, v.quantidade, v.data || v.dataPagamento || v.dataAplicacao].filter((x) => x !== undefined && x !== '').map((x) => (x instanceof Date ? dateBR(x.toISOString()) : String(x))).join(' · ') || '(linha incompleta)';
}

function RowEditor({ cat, record, onChange }: { cat: OpCategory; record: ImportRecord; onChange: (k: string, v: unknown) => void }) {
  return (
    <div className="form-grid">
      {SHEETS[cat].fields.map((f) => {
        const raw = record.values[f.key];
        const val = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw ?? '');
        return (
          <label key={f.key} className="field">
            <span className="field-l">{f.header}{f.required ? ' *' : ''}</span>
            <input defaultValue={val} type={DATE_KEYS.has(f.key) && /^\d{4}-\d{2}-\d{2}$/.test(val) ? 'date' : 'text'} onBlur={(e) => e.target.value !== val && onChange(f.key, e.target.value)} />
          </label>
        );
      })}
      <p className="muted" style={{ gridColumn: '1 / -1', margin: 0, fontSize: 12 }}>Edite e saia do campo para revalidar. Datas: dd/mm/aaaa.</p>
    </div>
  );
}
