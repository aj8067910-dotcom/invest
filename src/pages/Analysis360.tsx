// Aba "Análise 360°" da ficha do ativo (aprofunda a tela existente; não é tela nova).
import { useState, type ReactNode } from 'react';
import { useDerived } from '../store/derived';
import { useStore } from '../store/store';
import type { Asset, ManualMetric } from '../domain/types';
import type { Indicator, Status } from '../domain/calc/analysis360';
import { Card, Field, NumInput, Why } from '../components/ui';
import { brl, dateBR, num, pct } from '../domain/format';
import { todayISO } from '../domain/util';
import { toast } from '../components/toast';

const STATUS_TXT: Record<Status, string> = { verde: '● sem alerta', amarelo: '▲ atenção', vermelho: '■ alerta', na: '— não se aplica', sem_dado: '○ sem dado' };

function fmtVal(i: Indicator): ReactNode {
  const v = i.value;
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  switch (i.fmt) {
    case 'pct':
      return pct(v, 1);
    case 'x':
      return num(v, 2) + 'x';
    case 'brl':
      return Math.abs(v) >= 1e6 ? `R$ ${num(v / 1e6, 1)} mi` : brl(v);
    case 'score':
      return `${v}/9`;
    default:
      return num(v, Number.isInteger(v) ? 0 : 2);
  }
}

/** Campos manuais por tipo de ativo (sem fonte estruturada); fonte e data são obrigatórias. */
const MANUAL: { key: string; label: string; when: (a: Asset, ctx: { bank: boolean; insurer: boolean; utility: boolean; holding: boolean }) => boolean; suffix?: string }[] = [
  { key: 'debtDuration', label: 'Prazo médio da dívida (anos)', when: (a, c) => a.class === 'acao' && !c.bank && !c.insurer },
  { key: 'debtCost', label: 'Custo médio da dívida (% a.a.)', when: (a, c) => a.class === 'acao' && !c.bank && !c.insurer, suffix: '%' },
  { key: 'debtFx', label: 'Dívida em moeda estrangeira (%)', when: (a, c) => a.class === 'acao' && !c.bank && !c.insurer, suffix: '%' },
  { key: 'debtCdi', label: 'Dívida indexada ao CDI (%)', when: (a, c) => a.class === 'acao' && !c.bank && !c.insurer, suffix: '%' },
  { key: 'basel', label: 'Índice de Basileia (%)', when: (_a, c) => c.bank, suffix: '%' },
  { key: 'efficiency', label: 'Índice de eficiência (%)', when: (_a, c) => c.bank, suffix: '%' },
  { key: 'npl90', label: 'Inadimplência > 90 dias (%)', when: (_a, c) => c.bank, suffix: '%' },
  { key: 'provisionCoverage', label: 'Cobertura de provisões (%)', when: (_a, c) => c.bank, suffix: '%' },
  { key: 'combinedRatio', label: 'Índice combinado (%)', when: (_a, c) => c.insurer, suffix: '%' },
  { key: 'lossRatio', label: 'Sinistralidade (%)', when: (_a, c) => c.insurer, suffix: '%' },
  { key: 'financialResultShare', label: 'Resultado financeiro (% do lucro)', when: (_a, c) => c.insurer, suffix: '%' },
  { key: 'concessionYears', label: 'Prazo restante das concessões (anos)', when: (_a, c) => c.utility },
  { key: 'rap', label: 'RAP / receita regulada (R$ mi)', when: (_a, c) => c.utility },
  { key: 'tariffReview', label: 'Ano da próxima revisão tarifária', when: (_a, c) => c.utility },
  { key: 'holdingDiscount', label: 'Desconto sobre a soma das partes (%)', when: (_a, c) => c.holding, suffix: '%' },
  { key: 'tagAlong', label: 'Tag along (%)', when: (a) => a.class === 'acao', suffix: '%' },
  { key: 'freeFloat', label: 'Free float (%)', when: (a) => a.class === 'acao', suffix: '%' },
  { key: 'fiiPayoutCash', label: 'Distribuído ÷ resultado caixa (%)', when: (a) => a.class === 'fii', suffix: '%' },
  { key: 'fiiMonthsOverDistributed', label: 'Meses seguidos distribuindo acima do resultado', when: (a) => a.class === 'fii' },
  { key: 'fiiReservePerShare', label: 'Reserva acumulada (R$/cota)', when: (a) => a.class === 'fii' },
  { key: 'fiiAtypical', label: 'Contratos atípicos (% da receita)', when: (a) => a.class === 'fii' && a.fiiType !== 'papel', suffix: '%' },
  { key: 'fiiLtv', label: 'LTV médio (%)', when: (a) => a.class === 'fii' && (a.fiiType === 'papel' || a.fiiType === 'hibrido'), suffix: '%' },
  { key: 'fiiHighYield', label: 'Parcela high yield (%)', when: (a) => a.class === 'fii' && (a.fiiType === 'papel' || a.fiiType === 'hibrido'), suffix: '%' },
  { key: 'fiiDebtorConc', label: 'Concentração no maior devedor (%)', when: (a) => a.class === 'fii' && (a.fiiType === 'papel' || a.fiiType === 'hibrido'), suffix: '%' },
  { key: 'fiiCreditEvents', label: 'Eventos de crédito em 12 meses', when: (a) => a.class === 'fii' && (a.fiiType === 'papel' || a.fiiType === 'hibrido') },
  { key: 'fiiDilutiveIssues', label: 'Emissões abaixo do VP em 5 anos', when: (a) => a.class === 'fii' },
];

export function Analysis360Tab({ a, children }: { a: Asset; children?: ReactNode }) {
  const d = useDerived();
  const update = useStore((s) => s.updateAsset);
  const r = d.scoreById[a.id];
  const an = r.analysis;
  const ctx = { bank: an.kind === 'banco', insurer: an.kind === 'seguradora', utility: d.settings.limits360.utilitySectors.includes(a.sector), holding: /holding/i.test(a.sector) || /itaúsa|itausa/i.test(a.name) };
  const fields = MANUAL.filter((f) => f.when(a, ctx));
  const [draft, setDraft] = useState<Record<string, ManualMetric>>(() => ({ ...(a.manual || {}) }));
  const [controller, setController] = useState(a.manual?.controller?.source || '');

  const save = () => {
    for (const [k, m] of Object.entries(draft)) {
      if (m.value === null || m.value === undefined) continue;
      if (!m.source?.trim() || !m.date) return toast(`Informe a fonte e a data de "${MANUAL.find((f) => f.key === k)?.label || k}".`, true);
    }
    const next: Record<string, ManualMetric> = Object.fromEntries(Object.entries(draft).filter(([, m]) => m.value !== null && m.value !== undefined));
    if (controller) next.controller = { value: null, source: controller, date: todayISO() };
    update(a.id, { manual: next });
    toast('Indicadores manuais salvos.');
  };

  return (
    <div className="stack">
      <div className="note">
        <b>Classificação: {r.priority === 'oportunidade' ? 'Oportunidade' : r.priority === 'manutencao' ? 'Manutenção' : 'Aguardar'}</b> — {r.reasons[r.reasons.length - 1]}
        <br />
        <span className="muted" style={{ fontSize: 12 }}>
          {an.dataNote}. Indicadores em série anual (DFP) de até 5 anos. Modelos estimados majoritariamente com dados dos EUA (Piotroski, Altman, Novy-Marx, Fama-French, QMJ) servem como <b>triagem</b>, não como previsão.
        </span>
      </div>
      {an.blocks.map((b, bi) => (
        <Card key={b.key} title={<>{bi + 1}. {b.title} <span className={`st-${b.status}`} style={{ fontSize: 12, fontWeight: 500 }}>{STATUS_TXT[b.status]}</span></>}>
          <div className="tbl-wrap">
            <table className="tbl">
              <tbody>
                {b.items.map((i) => (
                  <tr key={i.key}>
                    <td style={{ width: '34%' }}>
                      {i.label} <Why text={i.why} />
                    </td>
                    <td className="num" style={{ width: 110 }}>{fmtVal(i)}</td>
                    <td className={`st-${i.status}`} style={{ width: 120, fontSize: 12 }}>{STATUS_TXT[i.status]}</td>
                    <td className="muted" style={{ fontSize: 11.5 }}>
                      {i.note && <div>{i.note}</div>}
                      {i.series && i.series.some((x) => x.value !== null) && <div className="mono">{i.series.map((x) => `${x.year}: ${x.value === null ? '—' : num(x.value, 1)}`).join(' · ')}</div>}
                      {(i.source || i.date) && <div className="dim">{i.source}{i.date ? ` · ${dateBR(String(i.date).slice(0, 10))}` : ''}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      {fields.length > 0 && (
        <Card title="Indicadores manuais" sub="Para dados sem fonte estruturada (notas explicativas, relatórios gerenciais, RI). Fonte e data são obrigatórias.">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Indicador</th><th style={{ width: 120 }}>Valor</th><th>Fonte</th><th style={{ width: 160 }}>Data</th></tr></thead>
              <tbody>
                {fields.map((f) => {
                  const m = draft[f.key] || { value: null, source: '', date: todayISO() };
                  const set = (p: Partial<ManualMetric>) => setDraft({ ...draft, [f.key]: { ...m, ...p } });
                  return (
                    <tr key={f.key}>
                      <td>{f.label}</td>
                      <td><NumInput className="sm" value={m.value} suffix={f.suffix} onChange={(v) => set({ value: v })} /></td>
                      <td><input value={m.source} onChange={(e) => set({ source: e.target.value })} placeholder="ex.: Release 3T26 (RI), nota 18" /></td>
                      <td><input type="date" value={m.date} onChange={(e) => set({ date: e.target.value })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {a.class === 'acao' && (
            <Field label="Tipo de controlador">
              <select value={controller} onChange={(e) => setController(e.target.value)} style={{ maxWidth: 260 }}>
                <option value="">—</option>
                <option value="estatal">Estatal</option>
                <option value="familiar">Familiar</option>
                <option value="disperso">Disperso (sem controlador)</option>
                <option value="estrangeiro">Grupo estrangeiro</option>
              </select>
            </Field>
          )}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn primary" onClick={save}>Salvar indicadores manuais</button>
          </div>
        </Card>
      )}
      {children}
    </div>
  );
}
