import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDerived } from '../store/derived';
import { useStore } from '../store/store';
import { Card, Disclaimer, Empty, Field, Modal, NumInput, Stat } from '../components/ui';
import { AssetLink } from '../components/common';
import type { Transaction, TxType } from '../domain/types';
import { INCOME_TX, TX_LABEL } from '../domain/types';
import { brl, dateBR, qtyFmt, signedPct } from '../domain/format';
import { todayISO } from '../domain/util';
import { exportCsv, exportXlsx, parseTransactions, readSheet, txRows, assetRows } from '../services/io';
import { toast } from '../components/toast';

const NEEDS_QTY: TxType[] = ['compra', 'venda'];
const NO_ASSET: TxType[] = ['aporte', 'retirada'];

type Draft = Omit<Transaction, 'id'> & { id?: string };
const blank = (assetId?: string | null): Draft => ({ date: todayISO(), type: 'compra', assetId: assetId || null, qty: null, price: null, fees: 0, amount: 0, reinvest: false, notes: '' });

export default function History() {
  const d = useDerived();
  const { addTransaction, updateTransaction, removeTransaction, importTransactions, addAsset } = useStore();
  const [params] = useSearchParams();
  const [draft, setDraft] = useState<Draft>(blank(params.get('ativo')));
  const [fType, setFType] = useState<TxType | 'todos'>('todos');
  const [fAsset, setFAsset] = useState<string>(params.get('ativo') || '');
  const [preview, setPreview] = useState<ReturnType<typeof parseTransactions> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map(d.assets.map((a) => [a.id, a])), [d.assets]);

  const autoAmount = NEEDS_QTY.includes(draft.type) && draft.qty && draft.price ? draft.qty * draft.price + (draft.type === 'venda' ? -(draft.fees ?? 0) : draft.fees ?? 0) : null;
  const amount = autoAmount ?? draft.amount;
  const valid = draft.date && amount > 0 && (NO_ASSET.includes(draft.type) || draft.assetId) && (!NEEDS_QTY.includes(draft.type) || (draft.qty && draft.qty > 0));
  const pos = draft.assetId ? d.positions[draft.assetId] : null;

  const save = () => {
    if (!valid) return;
    if (draft.type === 'venda' && pos && (draft.qty ?? 0) > pos.qty + 1e-9) return toast(`Quantidade de venda maior que a posição (${qtyFmt(pos.qty)}).`, true);
    const t = { ...draft, amount, ticker: draft.assetId ? byId.get(draft.assetId)?.ticker : null, assetId: NO_ASSET.includes(draft.type) ? null : draft.assetId };
    if (draft.id) updateTransaction(draft.id, t);
    else addTransaction(t);
    toast(draft.id ? 'Operação atualizada.' : 'Operação registrada.');
    setDraft({ ...blank(draft.assetId), type: draft.type, date: draft.date });
  };

  const list = d.transactions
    .filter((t) => (fType === 'todos' || t.type === fType) && (!fAsset || t.assetId === fAsset))
    .sort((a, b) => b.date.localeCompare(a.date));
  const held = d.assets.filter((a) => d.positions[a.id].totalBought > 0 || d.positions[a.id].income > 0);
  const sum = (types: TxType[]) => d.transactions.filter((t) => types.includes(t.type)).reduce((s, t) => s + t.amount, 0);

  return (
    <div className="stack">
      <div className="page-h">
        <div>
          <div className="kicker">Registro</div>
          <h1>Histórico de investimentos</h1>
          <p>Compras, vendas, dividendos, JCP, rendimentos de FIIs, juros, aportes e reinvestimentos. Preço médio, quantidade, rentabilidade e renda por ativo são recalculados a partir daqui.</p>
        </div>
        <div className="row">
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              setPreview(parseTransactions(await readSheet(f), d.assets));
            } catch (err: any) {
              toast('Não foi possível ler o arquivo: ' + err.message, true);
            }
            e.target.value = '';
          }} />
          <button className="btn" onClick={() => fileRef.current?.click()}>Importar CSV/Excel</button>
          <button className="btn" onClick={() => exportCsv(txRows(d.transactions, d.assets), 'transacoes')}>Exportar CSV</button>
          <button className="btn" onClick={() => exportXlsx(d.assets, d.transactions, d.positions)}>Exportar Excel</button>
        </div>
      </div>
      <div className="grid g6">
        <Stat label="Aportes" value={brl(sum(['aporte']))} />
        <Stat label="Compras" value={brl(sum(['compra']))} sub={`reinvestido ${brl(d.transactions.filter((t) => t.type === 'compra' && t.reinvest).reduce((s, t) => s + t.amount, 0))}`} />
        <Stat label="Vendas" value={brl(sum(['venda']))} sub={`resultado ${brl(d.totals.realized)}`} />
        <Stat label="Proventos recebidos" value={brl(sum(INCOME_TX))} tone="pos" />
        <Stat label="Saldo em caixa estimado" value={d.totals.deposits ? brl(d.totals.cash) : '—'} sub={d.totals.deposits ? 'aportes + proventos + vendas − compras' : 'lance aportes para calcular'} />
        <Stat label="Operações" value={String(d.transactions.length)} />
      </div>

      <Card title={draft.id ? 'Editar operação' : 'Nova operação'} className="hl">
        <div className="form-grid">
          <Field label="Data"><input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
          <Field label="Tipo">
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as TxType })}>
              {(Object.keys(TX_LABEL) as TxType[]).map((t) => <option key={t} value={t}>{TX_LABEL[t]}</option>)}
            </select>
          </Field>
          {!NO_ASSET.includes(draft.type) && (
            <Field label="Ativo" hint={pos && pos.qty > 0 ? `posição: ${qtyFmt(pos.qty)} · PM ${brl(pos.avgPrice)}` : undefined}>
              <select value={draft.assetId || ''} onChange={(e) => setDraft({ ...draft, assetId: e.target.value })}>
                <option value="">Selecione…</option>
                {[...d.assets].sort((a, b) => a.ticker.localeCompare(b.ticker)).map((a) => <option key={a.id} value={a.id}>{a.ticker} — {a.name}</option>)}
              </select>
            </Field>
          )}
          {NEEDS_QTY.includes(draft.type) && (
            <>
              <Field label="Quantidade"><NumInput value={draft.qty} onChange={(v) => setDraft({ ...draft, qty: v })} /></Field>
              <Field label="Preço unitário"><NumInput value={draft.price} onChange={(v) => setDraft({ ...draft, price: v })} /></Field>
              <Field label="Taxas/custos"><NumInput value={draft.fees} onChange={(v) => setDraft({ ...draft, fees: v })} /></Field>
            </>
          )}
          <Field label={INCOME_TX.includes(draft.type) ? 'Valor líquido recebido' : 'Valor total'} hint={autoAmount !== null ? 'calculado: qtd × preço ± taxas' : undefined}>
            <NumInput value={autoAmount ?? draft.amount} disabled={autoAmount !== null} onChange={(v) => setDraft({ ...draft, amount: v ?? 0 })} />
          </Field>
          {draft.type === 'compra' && (
            <Field label="Origem">
              <label className="chk" style={{ padding: '7px 0' }}><input type="checkbox" checked={!!draft.reinvest} onChange={(e) => setDraft({ ...draft, reinvest: e.target.checked })} /> reinvestimento de proventos</label>
            </Field>
          )}
          <Field label="Observação" wide><input value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          {draft.id && <button className="btn ghost" onClick={() => setDraft(blank())}>Cancelar edição</button>}
          <button className="btn primary" disabled={!valid} onClick={save}>{draft.id ? 'Salvar alterações' : 'Registrar'}</button>
        </div>
      </Card>

      <Card title="Resultado por ativo" right={<button className="btn sm" onClick={() => exportCsv(assetRows(d.assets, d.positions), 'posicoes')}>Exportar posições</button>}>
        {held.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Ativo</th><th className="num">Qtd</th><th className="num">Preço médio</th><th className="num">Custo atual</th><th className="num">Total comprado</th><th className="num">Valor atual</th><th className="num">Valorização</th><th className="num">Realizado</th><th className="num">Renda gerada</th><th className="num">Retorno total</th></tr></thead>
              <tbody>
                {held.map((a) => {
                  const p = d.positions[a.id];
                  return (
                    <tr key={a.id}>
                      <td><AssetLink a={a} sub={false} /></td>
                      <td className="num">{qtyFmt(p.qty)}</td>
                      <td className="num">{brl(p.avgPrice)}</td>
                      <td className="num">{brl(p.costBasis)}</td>
                      <td className="num">{brl(p.totalBought)}</td>
                      <td className="num">{p.qty ? brl(p.marketValue) : '—'}{p.qty > 0 && !p.hasQuote && <span className="warn-t" title="sem cotação: valor a custo"> *</span>}</td>
                      <td className={`num ${(p.unrealized ?? 0) >= 0 ? 'pos' : 'neg'}`}>{p.unrealized === null ? '—' : brl(p.unrealized)}</td>
                      <td className="num">{p.realized ? brl(p.realized) : '—'}</td>
                      <td className="num pos">{brl(p.income)}</td>
                      <td className={`num ${p.totalReturn >= 0 ? 'pos' : 'neg'}`}>{brl(p.totalReturn)} <span className="dim">{signedPct(p.totalReturnPct)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nenhuma operação registrada ainda.</Empty>
        )}
      </Card>

      <Card
        title="Operações"
        right={
          <div className="row">
            <select value={fType} onChange={(e) => setFType(e.target.value as any)} style={{ width: 'auto' }}>
              <option value="todos">Todos os tipos</option>
              {(Object.keys(TX_LABEL) as TxType[]).map((t) => <option key={t} value={t}>{TX_LABEL[t]}</option>)}
            </select>
            <select value={fAsset} onChange={(e) => setFAsset(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Todos os ativos</option>
              {[...d.assets].sort((a, b) => a.ticker.localeCompare(b.ticker)).map((a) => <option key={a.id} value={a.id}>{a.ticker}</option>)}
            </select>
          </div>
        }
      >
        {list.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Data</th><th>Tipo</th><th>Ativo</th><th className="num">Qtd</th><th className="num">Preço</th><th className="num">Taxas</th><th className="num">Valor</th><th>Obs.</th><th></th></tr></thead>
              <tbody>
                {list.map((t) => {
                  const a = t.assetId ? byId.get(t.assetId) : null;
                  return (
                    <tr key={t.id}>
                      <td className="nowrap">{dateBR(t.date)}</td>
                      <td>{TX_LABEL[t.type]}{t.reinvest ? ' · reinvest.' : ''}</td>
                      <td>{a ? <AssetLink a={a} sub={false} /> : <span className="dim">{t.ticker || '—'}</span>}</td>
                      <td className="num">{t.qty ? qtyFmt(t.qty) : '—'}</td>
                      <td className="num">{brl(t.price)}</td>
                      <td className="num">{t.fees ? brl(t.fees) : '—'}</td>
                      <td className={`num ${INCOME_TX.includes(t.type) ? 'pos' : t.type === 'venda' || t.type === 'retirada' ? 'warn-t' : ''}`}>{brl(t.amount)}</td>
                      <td className="dim" style={{ fontSize: 12 }}>{t.notes}</td>
                      <td className="nowrap">
                        <button className="btn ghost sm" onClick={() => { setDraft({ ...t }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>editar</button>
                        <button className="btn ghost sm" onClick={() => confirm('Excluir esta operação?') && removeTransaction(t.id)}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nenhuma operação com estes filtros.</Empty>
        )}
        <p className="muted" style={{ fontSize: 12 }}>
          Aceita o <b>extrato de Movimentação</b> ou de <b>Negociação</b> da Área do Investidor da B3 (investidor.b3.com.br → Extratos → Movimentação → baixar Excel), detectados automaticamente. Formato próprio: colunas <span className="mono">Data; Tipo; Ticker; Quantidade; Preco; Taxas; Valor; Reinvestimento; Observacao</span>. Tipos aceitos: compra, venda, dividendo, jcp, rendimento, juros, amortizacao, aporte, retirada. Datas em dd/mm/aaaa ou aaaa-mm-dd. Duplicatas são ignoradas.
        </p>
      </Card>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="Pré-visualização da importação" wide>
        {preview && (
          <div className="stack">
            {preview.format && <div className="note">Formato reconhecido: <b>{preview.format}</b>.</div>}
            <p>{preview.txs.length} operações válidas · {preview.newAssets.length} ativos novos ({preview.newAssets.map((a) => a.ticker).join(', ') || 'nenhum'}) · {preview.errors.length} erros.</p>
            {!!preview.ignored?.length && <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Ignorados por não afetarem preço médio nem renda: {preview.ignored.join(', ')}.</p>}
            {preview.errors.length > 0 && <div className="note warn" style={{ maxHeight: 140, overflowY: 'auto' }}>{preview.errors.slice(0, 30).map((e, i) => <div key={i}>{e}</div>)}</div>}
            <div className="tbl-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
              <table className="tbl">
                <thead><tr><th>Data</th><th>Tipo</th><th>Ticker</th><th className="num">Qtd</th><th className="num">Valor</th></tr></thead>
                <tbody>{preview.txs.slice(0, 100).map((t, i) => <tr key={i}><td>{dateBR(t.date)}</td><td>{TX_LABEL[t.type]}</td><td className="mono">{t.ticker}</td><td className="num">{t.qty ?? '—'}</td><td className="num">{brl(t.amount)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setPreview(null)}>Cancelar</button>
              <button
                className="btn primary"
                disabled={!preview.txs.length}
                onClick={() => {
                  preview.newAssets.forEach(addAsset);
                  const n = importTransactions(preview.txs);
                  setPreview(null);
                  toast(`${n} operações importadas (${preview.txs.length - n} duplicadas ignoradas).`);
                }}
              >
                Importar
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Disclaimer />
    </div>
  );
}
