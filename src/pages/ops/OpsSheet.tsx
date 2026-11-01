import { useMemo, useState } from 'react';
import { useStore, describe } from '../../store/store';
import type { OpCategory, Transaction, TxType } from '../../domain/types';
import { OP_CATEGORIES, OP_CATEGORY_LABEL, TX_LABEL } from '../../domain/types';
import { SHEETS, exportRows, txToValues } from '../../domain/opsheet';
import { categoryOf, txOrder } from '../../domain/ledger';
import { Badge, Empty, Modal } from '../../components/ui';
import { brl } from '../../domain/format';
import { exportOperationsCsv, exportOperationsXlsx } from '../../services/opsio';
import { EntryForm } from './EntryForm';
import { toast } from '../../components/toast';

const PAGE = 100;
// colunas em reais (as demais são quantidades, fatores ou taxas %)
const MONEY = /^(precoUnitario|total|taxas|valorLiquido|valorAplicado|valorResgatado|valorUnitario|valorTotal|valor|custoUnitario)$/;

export function OpsSheet({ onOpenAsset }: { onOpenAsset: (assetId: string) => void }) {
  const { transactions, assets, removeTransactions } = useStore();
  const [cat, setCat] = useState<OpCategory>('acoes');
  const [q, setQ] = useState('');
  const [type, setType] = useState<TxType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [onlyReview, setOnlyReview] = useState(false);
  const [showReversed, setShowReversed] = useState(false);
  const [reason, setReason] = useState('');
  const reversedIds = useMemo(() => new Set(transactions.filter((t) => t.type === 'estorno').map((t) => t.reversalOf)), [transactions]);
  const [desc, setDesc] = useState(true);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ tx: Transaction; cat: OpCategory; values: Record<string, unknown> } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string[] | null>(null);
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const catOf = (t: Transaction) => t.category || categoryOf(t, t.assetId ? byId.get(t.assetId)?.class : null);

  const counts = useMemo(() => {
    const c = Object.fromEntries(OP_CATEGORIES.map((k) => [k, 0])) as Record<OpCategory, number>;
    for (const t of transactions) if (t.type !== 'estorno' && !reversedIds.has(t.id)) c[catOf(t)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, byId]);

  const list = useMemo(() => {
    const term = q.trim().toUpperCase();
    const out = transactions
      .filter((t) => showReversed || (t.type !== 'estorno' && !reversedIds.has(t.id)))
      .filter((t) => catOf(t) === cat)
      .filter((t) => !term || (t.ticker || '').toUpperCase().includes(term) || (t.assetId && byId.get(t.assetId)?.name.toUpperCase().includes(term)) || (t.notes || '').toUpperCase().includes(term) || (t.broker || '').toUpperCase().includes(term))
      .filter((t) => !type || t.type === type)
      .filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
      .filter((t) => !onlyReview || !!t.review)
      .sort(txOrder);
    return desc ? out.reverse() : out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, cat, q, type, from, to, onlyReview, desc, byId, showReversed, reversedIds]);

  const pageList = list.slice(page * PAGE, page * PAGE + PAGE);
  // linhas no formato exato da planilha (mesma função da exportação)
  const rows = useMemo(() => {
    const asc = [...pageList].sort(txOrder);
    const r = exportRows(asc, assets)[cat];
    const map = new Map(asc.map((t, i) => [t.id, r[i]]));
    return pageList.map((t) => ({ t, row: map.get(t.id) || {} }));
  }, [pageList, assets, cat]);
  const typesHere = [...new Set(transactions.filter((t) => catOf(t) === cat).map((t) => t.type))];
  const total = list.reduce((s, t) => s + (t.amount || 0), 0);
  const fields = SHEETS[cat].fields.filter((f) => f.key !== 'idOperacao');
  const pages = Math.max(1, Math.ceil(list.length / PAGE));

  return (
    <div className="stack">
      <div className="tabs" role="tablist">
        {OP_CATEGORIES.map((c, i) => (
          <button key={c} className={cat === c ? 'on' : ''} onClick={() => { setCat(c); setPage(0); setType(''); setSel(new Set()); }}>
            {String(i + 1).padStart(2, '0')} {OP_CATEGORY_LABEL[c]} <span className="dim mono">{counts[c]}</span>
          </button>
        ))}
      </div>
      <div className="filters">
        <input placeholder="Pesquisar ativo, corretora, observação…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Pesquisar" />
        <select value={type} onChange={(e) => { setType(e.target.value as TxType | ''); setPage(0); }} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {typesHere.map((t) => <option key={t} value={t}>{TX_LABEL[t]}</option>)}
        </select>
        <label className="chk">de <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} style={{ width: 150 }} /></label>
        <label className="chk">até <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} style={{ width: 150 }} /></label>
        <label className="chk"><input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} /> só com revisão</label>
        <label className="chk"><input type="checkbox" checked={showReversed} onChange={(e) => setShowReversed(e.target.checked)} /> mostrar estornos</label>
        <button className="btn sm ghost" onClick={() => setDesc((x) => !x)}>{desc ? 'Mais recentes primeiro' : 'Mais antigas primeiro'}</button>
        <span style={{ marginLeft: 'auto' }} className="row">
          <button className="btn sm" onClick={() => exportOperationsCsv(transactions, assets, cat)}>CSV desta aba</button>
          <button className="btn sm" onClick={() => exportOperationsXlsx(transactions, assets)}>Excel (8 abas)</button>
        </span>
      </div>
      {list.length ? (
        <>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th><input type="checkbox" aria-label="Selecionar página" checked={pageList.length > 0 && pageList.every((t) => sel.has(t.id))} onChange={(e) => { const n = new Set(sel); pageList.forEach((t) => (e.target.checked ? n.add(t.id) : n.delete(t.id))); setSel(n); }} /></th>
                  {fields.map((f) => <th key={f.key} className={/quantidade|preco|total|valor|taxa|fator|qtd|custo/i.test(f.key) ? 'num' : ''}>{f.header}</th>)}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ t, row }) => (
                  <tr key={t.id}>
                    <td><input type="checkbox" aria-label="Selecionar" checked={sel.has(t.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(t.id) : n.delete(t.id); setSel(n); }} /></td>
                    {fields.map((f) => {
                      const v = row[f.header];
                      const isNum = typeof v === 'number';
                      if (f.key === 'ativo' && t.assetId)
                        return <td key={f.key}><button className="btn ghost sm tk" style={{ padding: 0 }} onClick={() => onOpenAsset(t.assetId!)} title="Histórico do ativo">{String(v)}</button></td>;
                      return <td key={f.key} className={isNum ? 'num' : f.key === 'observacoes' ? 'dim' : ''} style={f.key === 'observacoes' ? { fontSize: 12, maxWidth: 220 } : undefined}>{isNum ? (MONEY.test(f.key) ? brl(v as number) : (v as number).toLocaleString('pt-BR', { maximumFractionDigits: 8 })) : String(v ?? '')}</td>;
                    })}
                    <td className="nowrap">
                      {t.review && <Badge tone="warn" title={t.review}>revisão</Badge>}
                      {t.importId && <Badge tone="muted" title="Veio de uma importação">imp.</Badge>}
                      {t.auto && <Badge tone="info" title={t.notes || ''}>automático</Badge>}
                      {t.type === 'estorno' && <Badge tone="bad" title={t.reason || ''}>estorno</Badge>}
                      {reversedIds.has(t.id) && <Badge tone="muted">estornado</Badge>}
                      {t.type !== 'estorno' && !reversedIds.has(t.id) && (
                        <>
                          <button className="btn ghost sm" onClick={() => setEditing({ tx: t, ...txToValues(t, assets) })}>corrigir</button>
                          <button className="btn ghost sm" onClick={() => setConfirmDel([t.id])} aria-label="Estornar">estornar</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row between" style={{ fontSize: 12.5 }}>
            <span className="muted">
              {list.length} operações · valor somado {brl(total)}
              {sel.size > 0 && (
                <>
                  {' '}· {sel.size} selecionada(s) <button className="btn sm danger" onClick={() => setConfirmDel([...sel])}>Estornar selecionadas</button>
                </>
              )}
            </span>
            {pages > 1 && (
              <span className="row">
                <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
                <span className="mono">{page + 1}/{pages}</span>
                <button className="btn sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
              </span>
            )}
          </div>
        </>
      ) : (
        <Empty>Nenhuma operação nesta aba{q || type || from || to ? ' com estes filtros' : ''}. Lance em “Novo lançamento” ou importe sua planilha.</Empty>
      )}
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>{SHEETS[cat].hint}</p>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Corrigir operação (estorno + novo lançamento)" wide>
        {editing && (
          <>
            <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>Livro só de inclusão: o lançamento original continua no histórico, anulado por um estorno, e a versão corrigida entra como novo lançamento. A carteira é recalculada ao salvar.</p>
            <EntryForm editing={editing} onDone={() => setEditing(null)} />
          </>
        )}
      </Modal>
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title={`Estornar ${confirmDel?.length ?? 0} operação(ões)?`}>
        {confirmDel && (
          <div className="stack">
            <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 220, overflowY: 'auto', fontSize: 13 }}>
              {confirmDel.slice(0, 30).map((id) => {
                const t = transactions.find((x) => x.id === id);
                return t ? <li key={id}>{describe(t, assets)}</li> : null;
              })}
              {confirmDel.length > 30 && <li>… e mais {confirmDel.length - 30}</li>}
            </ul>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>O lançamento não é apagado: recebe um estorno com o motivo, e posição, preço médio, proventos e demais módulos são recalculados.</p>
            <label className="field"><span className="field-l">Motivo do estorno *</span><input id="estorno-motivo" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex.: lançamento em duplicidade" /></label>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn danger" disabled={reason.trim().length < 3} onClick={() => { const n = removeTransactions(confirmDel, reason.trim()); setSel(new Set()); setConfirmDel(null); setReason(''); toast(`${n} operação(ões) estornada(s).`); }}>Estornar</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
