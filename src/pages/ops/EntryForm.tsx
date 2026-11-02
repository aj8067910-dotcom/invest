import { useEffect, useMemo, useState } from 'react';
import { useStore, describe } from '../../store/store';
import type { Asset, OpCategory, Transaction } from '../../domain/types';
import { OP_CATEGORY_LABEL, OP_CATEGORIES } from '../../domain/types';
import { SHEETS, convertForForm, optionsFor, DATE_KEYS, NUM_KEYS, planToAsset } from '../../domain/opsheet';
import { computePosition } from '../../domain/calc/positions';
import { txOrder } from '../../domain/ledger';
import { Field, NumInput } from '../../components/ui';
import { brl, priceFmt, qtyFmt } from '../../domain/format';
import { todayISO } from '../../domain/util';
import { toast } from '../../components/toast';

/** Rótulos dos formulários (mesmas categorias da planilha). */
export const FORM_TABS: { cat: OpCategory; label: string }[] = [
  { cat: 'acoes', label: 'Compra / venda' },
  { cat: 'aportes', label: 'Aporte' },
  { cat: 'proventos', label: 'Proventos' },
  { cat: 'renda_fixa', label: 'Renda fixa' },
  { cat: 'eventos', label: 'Evento corporativo' },
  { cat: 'transferencias', label: 'Transferência / ajuste' },
];

const defaults = (cat: OpCategory, presetAsset?: Asset | null): Record<string, unknown> => {
  const today = todayISO();
  const base: Record<string, unknown> = {};
  if (cat === 'acoes' || cat === 'fiis' || cat === 'etfs') Object.assign(base, { tipoOrdem: 'Compra', tipoInvestimento: presetAsset ? { acao: 'Ação', fii: 'FII', etf: 'ETF', cripto: 'Cripto', tesouro: 'Ação' }[presetAsset.class] : 'Ação', data: today, taxas: 0 });
  if (cat === 'aportes') Object.assign(base, { tipoMovimentacao: 'Aporte', data: today });
  if (cat === 'proventos') Object.assign(base, { tipoProvento: presetAsset?.class === 'fii' ? 'Rendimentos' : 'Dividendos', dataPagamento: today, tipoInvestimento: presetAsset?.class === 'fii' ? 'FII' : 'Ação' });
  if (cat === 'renda_fixa') Object.assign(base, { tipoMovimentacao: 'Aplicação', tipoInvestimento: 'Tesouro Direto', dataAplicacao: today });
  if (cat === 'eventos') Object.assign(base, { tipoEvento: 'Desdobramento', data: today });
  if (cat === 'transferencias') Object.assign(base, { tipoMovimentacao: 'Transferência de custódia', data: today });
  if (presetAsset) base.ativo = cat === 'renda_fixa' ? presetAsset.name : presetAsset.ticker;
  return base;
};

/** Campos ocultos por contexto para deixar o formulário enxuto. */
function visible(cat: OpCategory, key: string, v: Record<string, unknown>): boolean {
  if (cat === 'renda_fixa') {
    const app = String(v.tipoMovimentacao || '').startsWith('Aplica');
    if (app && (key === 'dataResgate' || key === 'valorResgatado')) return false;
    if (!app && (key === 'valorAplicado' || key === 'dataAplicacao' || key === 'taxa' || key === 'indexador')) return false;
  }
  if (cat === 'eventos') {
    const t = String(v.tipoEvento || '');
    if (key === 'custoUnitario') return /Bonific|Subscri|Amortiz/.test(t);
    if (key === 'fator') return /Desdobr|Grupam|Bonific/.test(t);
  }
  if (cat === 'eventos') {
    const t = String(v.tipoEvento || '');
    if (key === 'ativoDestino') return /Troca|Incorpora|Cis/.test(t);
    if (key === 'percentualCusto') return /Cis/.test(t);
    if (key === 'valorRecebido') return /Leil/.test(t);
  }
  return true;
}

export function EntryForm({ initialCat = 'acoes', preset, editing, onDone }: { initialCat?: OpCategory; preset?: Asset | null; editing?: { tx: Transaction; cat: OpCategory; values: Record<string, unknown> } | null; onDone?: () => void }) {
  const { assets, transactions, addTransaction, updateTransaction, addAsset } = useStore();
  const [cat, setCat] = useState<OpCategory>(editing?.cat || initialCat);
  const [values, setValues] = useState<Record<string, unknown>>(editing?.values || defaults(initialCat, preset));
  const [dupOf, setDupOf] = useState<Transaction | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!editing) setValues(defaults(cat, preset));
    setDupOf(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);
  const set = (k: string, v: unknown) => {
    setDupOf(null);
    setValues((x) => ({ ...x, [k]: v }));
  };

  // Compra/venda: o tipo de investimento define a aba (Ações, FIIs, ETFs)
  const tradeCat: OpCategory = cat === 'acoes' || cat === 'fiis' || cat === 'etfs' ? (values.tipoInvestimento === 'FII' ? 'fiis' : values.tipoInvestimento === 'ETF' ? 'etfs' : 'acoes') : cat;
  const result = useMemo(() => convertForForm(tradeCat, values, assets), [tradeCat, values, assets]);
  const errors = result.issues.filter((i) => i.level === 'erro');

  // prévia da posição após o lançamento (mesmo motor da carteira)
  const preview = useMemo(() => {
    const tx = result.tx;
    if (!tx || !tx.assetId) return null;
    const a = assets.find((x) => x.id === tx.assetId);
    if (!a) return null;
    const others = transactions.filter((t) => t.assetId === a.id && t.id !== editing?.tx.id);
    const before = computePosition(a, others, true);
    const after = computePosition(a, [...others, { ...tx, id: '__novo__' }].sort(txOrder), true);
    return { a, before, after, reviews: after.reviews.filter((r) => r.txId === '__novo__') };
  }, [result.tx, assets, transactions, editing]);

  const fields = SHEETS[tradeCat].fields.filter((f) => visible(cat, f.key, values));
  const tickerList = useMemo(() => (cat === 'renda_fixa' ? assets.filter((a) => a.class === 'tesouro').map((a) => a.name) : assets.filter((a) => a.class !== 'tesouro').map((a) => a.ticker)).sort(), [assets, cat]);

  const submit = (allowDuplicate = false) => {
    const tx = result.tx;
    if (!tx || errors.length) return;
    let assetId = tx.assetId;
    if (result.newAsset && !assetId) {
      const na = planToAsset(result.newAsset);
      addAsset(na);
      assetId = na.id;
    }
    let targetAssetId = tx.targetAssetId ?? null;
    if (result.newTarget && !targetAssetId) {
      const nt = planToAsset(result.newTarget);
      addAsset(nt);
      targetAssetId = nt.id;
    }
    const final: Transaction = { ...tx, assetId, targetAssetId, source: tx.source && tx.source !== 'importacao' ? tx.source : 'manual' };
    if (editing) {
      if (reason.trim().length < 3) return toast('Informe o motivo da correção.', true);
      const { id: _drop, createdAt: _c, fingerprint: _f, ...patch } = final;
      updateTransaction(editing.tx.id, { ...patch, importId: editing.tx.importId ?? null }, reason.trim());
      toast('Correção registrada (estorno + novo lançamento). Carteira e módulos recalculados.');
      onDone?.();
      return;
    }
    const r = addTransaction(final, { allowDuplicate });
    if (!r.ok) {
      setDupOf(r.duplicateOf);
      return;
    }
    toast(`Registrado: ${describe(final, useStore.getState().assets)}.`);
    setValues({ ...defaults(cat, preset), data: values.data, dataPagamento: values.dataPagamento, tipoOrdem: values.tipoOrdem, tipoInvestimento: values.tipoInvestimento, corretora: values.corretora });
    onDone?.();
  };

  return (
    <div className="stack">
      {!editing && (
        <div className="seg" role="tablist" style={{ flexWrap: 'wrap' }}>
          {FORM_TABS.map((t) => (
            <button key={t.cat} className={(t.cat === 'acoes' ? ['acoes', 'fiis', 'etfs'].includes(cat) : cat === t.cat) ? 'on' : ''} onClick={() => setCat(t.cat)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
        {OP_CATEGORY_LABEL[tradeCat]} — {SHEETS[tradeCat].hint}
      </p>
      <div className="form-grid">
        {fields.map((f) => {
          const opts = optionsFor(tradeCat, f.key);
          const id = `op-${f.key}`;
          const label = (
            <>
              {f.header}
              {f.required && cat !== 'renda_fixa' ? ' *' : ''}
            </>
          );
          if (f.key === 'ativo')
            return (
              <Field key={f.key} label={label} hint={f.help}>
                <input id={id} list="op-assets" value={String(values.ativo ?? '')} onChange={(e) => set('ativo', e.target.value)} placeholder={cat === 'renda_fixa' ? 'Tesouro IPCA+ 2029' : 'ITUB4'} autoComplete="off" />
              </Field>
            );
          if (opts)
            return (
              <Field key={f.key} label={label}>
                <select id={id} value={String(values[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)}>
                  <option value="">—</option>
                  {opts.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
            );
          if (DATE_KEYS.has(f.key))
            return (
              <Field key={f.key} label={label}>
                <input id={id} type="date" value={String(values[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} />
              </Field>
            );
          if (NUM_KEYS.has(f.key)) {
            const auto = f.key === 'total' && values.total === undefined && result.tx?.gross ? result.tx.gross : undefined;
            return (
              <Field key={f.key} label={label} hint={f.key === 'total' ? 'Vazio = Quantidade × Preço' : f.key === 'valorLiquido' ? 'Vazio = Total ± taxas' : f.key === 'qtdDelta' && cat === 'transferencias' ? undefined : f.help}>
                <NumInput value={(values[f.key] as number | null | undefined) ?? auto ?? null} onChange={(v) => set(f.key, v === null ? undefined : v)} placeholder={auto !== undefined ? String(auto) : '—'} />
              </Field>
            );
          }
          return (
            <Field key={f.key} label={label} wide={f.key === 'observacoes'} hint={f.help}>
              <input id={id} value={String(values[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} />
            </Field>
          );
        })}
      </div>
      <datalist id="op-assets">{tickerList.map((t) => <option key={t} value={t} />)}</datalist>

      {result.issues.length > 0 && (
        <ul className="alerts">
          {result.issues.map((i, k) => (
            <li key={k} className={i.level === 'erro' ? 'al-danger' : 'al-warn'}>
              <span className="al-dot" />
              {i.msg}
            </li>
          ))}
        </ul>
      )}
      {preview && (
        <div className="note">
          <b>{preview.a.ticker}</b>: posição {qtyFmt(preview.before.qty, preview.a.class)} → <b>{qtyFmt(preview.after.qty, preview.a.class)}</b> · preço médio {priceFmt(preview.before.avgPrice, preview.a.class)} → <b>{priceFmt(preview.after.avgPrice, preview.a.class)}</b>
          {preview.after.realized !== preview.before.realized && <> · resultado realizado nesta venda <b className={preview.after.realized - preview.before.realized >= 0 ? 'pos' : 'neg'}>{brl(preview.after.realized - preview.before.realized)}</b></>}
          {preview.reviews.map((r, k) => <div key={k} className="warn-t">Revisão: {r.message}</div>)}
        </div>
      )}
      {result.tx && !errors.length && <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Valor que afeta a carteira: <b className="mono">{brl(result.tx.amount)}</b></p>}
      {dupOf && (
        <div className="note warn">
          Já existe uma operação igual: {describe(dupOf, assets)}. Uma operação não pode ser contabilizada duas vezes.
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => setDupOf(null)}>Corrigir</button>
            <button className="btn sm danger" onClick={() => submit(true)}>São operações diferentes: registrar</button>
          </div>
        </div>
      )}
      {editing && (
        <label className="field">
          <span className="field-l">Motivo da correção *</span>
          <input id="op-motivo" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex.: preço digitado errado" />
        </label>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {onDone && editing && <button className="btn ghost" onClick={onDone}>Cancelar</button>}
        <button className="btn primary" disabled={!result.tx || errors.length > 0} onClick={() => submit(false)}>
          {editing ? 'Registrar correção' : 'Confirmar lançamento'}
        </button>
      </div>
    </div>
  );
}

export const ALL_CATS = OP_CATEGORIES;
