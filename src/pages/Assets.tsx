import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDerived } from '../store/derived';
import { useStore } from '../store/store';
import { Card, Disclaimer, Modal } from '../components/ui';
import { AssetLink, BandBadge, ClassBadge, PriorityBadge, QuoteCell } from '../components/common';
import { AssetForm } from '../components/AssetForm';
import { MiniLadder } from '../components/Ladder';
import { makeAsset } from '../domain/seed';
import { brl, pct, qtyFmt } from '../domain/format';
import type { AssetClass, AssetStatus } from '../domain/types';
import { CLASS_LABEL, CLASS_ORDER } from '../domain/types';
import { toast } from '../components/toast';
import { isHeld } from '../domain/calc/positions';

type SortKey = 'ticker' | 'value' | 'weight' | 'dy' | 'ratio' | 'score';

export default function Assets() {
  const d = useDerived();
  const { addAsset, updateAsset, removeAsset } = useStore();
  const nav = useNavigate();
  const [status, setStatus] = useState<AssetStatus | 'todos'>('todos');
  const [cls, setCls] = useState<AssetClass | 'todas'>('todas');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'value', dir: -1 });
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    const total = d.totals.marketValue || 1;
    return d.assets
      .filter((a) => (status === 'todos' || a.status === status) && (cls === 'todas' || a.class === cls))
      .filter((a) => !q || (a.ticker + a.name + a.sector + a.issuer).toLowerCase().includes(q.toLowerCase()))
      .map((a) => {
        const p = d.positions[a.id];
        const r = d.scoreById[a.id];
        return { a, p, r, value: isHeld(p) ? p.marketValue : 0, weight: isHeld(p) ? (p.marketValue / total) * 100 : 0 };
      })
      .sort((x, y) => {
        const v = (o: typeof x) =>
          sort.k === 'ticker' ? o.a.ticker : sort.k === 'value' ? o.value : sort.k === 'weight' ? o.weight : sort.k === 'dy' ? o.r.bazin.dyCurrent ?? -1 : sort.k === 'ratio' ? o.r.bazin.ratio ?? 999 : o.r.score;
        const a = v(x);
        const b = v(y);
        return (a < b ? -1 : a > b ? 1 : 0) * sort.dir;
      });
  }, [d, status, cls, q, sort]);

  const th = (k: SortKey, label: string, num = true) => (
    <th className={`sortable ${num ? 'num' : ''}`} onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>
      {label} {sort.k === k ? (sort.dir === 1 ? '▲' : '▼') : ''}
    </th>
  );
  const counts = { carteira: d.assets.filter((a) => a.status === 'carteira').length, watchlist: d.assets.filter((a) => a.status === 'watchlist').length };

  return (
    <div className="stack">
      <div className="page-h">
        <div>
          <div className="kicker">Cadastro</div>
          <h1>Carteira & Watchlist</h1>
          <p>Quantidade e preço médio vêm da Central de Operações. Clique no ticker para abrir a ficha completa (preço-teto, dividendos, fundamentos e valuation).</p>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Adicionar ativo</button>
      </div>
      <Card>
        <div className="filters">
          <div className="seg">
            {(['todos', 'carteira', 'watchlist'] as const).map((s) => (
              <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
                {s === 'todos' ? `Todos (${d.assets.length})` : s === 'carteira' ? `Carteira (${counts.carteira})` : `Watchlist (${counts.watchlist})`}
              </button>
            ))}
          </div>
          <select value={cls} onChange={(e) => setCls(e.target.value as any)}>
            <option value="todas">Todas as classes</option>
            {CLASS_ORDER.map((c) => (
              <option key={c} value={c}>{CLASS_LABEL[c]}</option>
            ))}
          </select>
          <input placeholder="Buscar ticker, nome, setor…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {th('ticker', 'Ativo', false)}
                <th>Classe / setor</th>
                <th className="num">Qtd</th>
                <th className="num">Preço médio</th>
                <th>Cotação</th>
                {th('value', 'Valor')}
                {th('weight', 'Peso')}
                {th('dy', 'DY rec.')}
                {th('ratio', 'Régua')}
                {th('score', 'Ranking')}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, p, r, value, weight }) => (
                <tr key={a.id}>
                  <td><AssetLink a={a} /></td>
                  <td>
                    <ClassBadge c={a.class} /> <span className="tk-sub" style={{ display: 'inline' }}>{a.sector}</span>
                  </td>
                  <td className="num">{p.qty > 0 ? qtyFmt(p.qty) : p.valueOnly ? <span className="dim">por valor</span> : <span className="dim">—</span>}</td>
                  <td className="num">{p.qty > 0 ? brl(p.avgPrice) : '—'}</td>
                  <td><QuoteCell a={a} /></td>
                  <td className="num">{value ? brl(value) : '—'}</td>
                  <td className="num">{weight ? pct(weight) : '—'}</td>
                  <td className="num">{r.bazin.applicable ? pct(r.bazin.dyCurrent, 2) : <span className="dim">n/a</span>}</td>
                  <td>
                    {r.bazin.applicable ? (
                      <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <MiniLadder r={r.bazin} /> <span className="mono" style={{ fontSize: 12 }}>{pct(r.bazin.ratio, 0)}</span>
                      </span>
                    ) : (
                      <span className="dim">n/a</span>
                    )}
                  </td>
                  <td>
                    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <span className="mono">{r.score}</span> <PriorityBadge p={r.priority} />
                    </span>
                  </td>
                  <td className="nowrap">
                    <button
                      className="btn ghost sm"
                      title={a.status === 'carteira' ? 'Mover para watchlist' : 'Mover para carteira'}
                      onClick={() => {
                        updateAsset(a.id, { status: a.status === 'carteira' ? 'watchlist' : 'carteira' });
                        toast(`${a.ticker} movido para ${a.status === 'carteira' ? 'watchlist' : 'carteira'}.`);
                      }}
                    >
                      ⇄
                    </button>
                    <button
                      className="btn ghost sm"
                      title="Excluir"
                      onClick={() => {
                        const n = d.transactions.filter((t) => t.assetId === a.id).length;
                        if (confirm(`Excluir ${a.ticker}?${n ? ` ${n} operação(ões) do histórico também serão removidas.` : ''}`)) removeAsset(a.id);
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Faixa da régua só para ações e FIIs. ETFs, Tesouro e cripto são avaliados por alocação e métricas próprias. <BandBadge b={null} /> = sem cotação ou sem proventos cadastrados.
        </p>
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title="Novo ativo" wide>
        <AssetForm
          isNew
          initial={makeAsset({ ticker: '', class: 'acao', status: 'watchlist' })}
          onCancel={() => setAdding(false)}
          onSave={(a) => {
            if (d.assets.some((x) => x.ticker === a.ticker)) return toast(`${a.ticker} já está cadastrado.`, true);
            addAsset({ ...a, issuer: a.issuer || a.ticker, name: a.name || a.ticker });
            setAdding(false);
            nav(`/ativo/${a.id}`);
          }}
        />
      </Modal>
      <Disclaimer />
    </div>
  );
}
