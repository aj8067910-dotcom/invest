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
import { capOf } from '../domain/calc/concentration';
import { Badge } from '../components/ui';
import type { Asset } from '../domain/types';

/** Último alerta da análise 360° que mudou de cor nos últimos 30 dias. */
const recentChange = (a: Asset) => {
  const lim = new Date(Date.now() - 30 * 86400000).toISOString();
  const c = (a.alertChanges || []).filter((x) => x.at >= lim).pop();
  return c ? `${c.key}: ${c.from} → ${c.to} em ${c.at.slice(0, 10).split('-').reverse().join('/')}` : null;
};

type SortKey = 'ticker' | 'value' | 'weight' | 'dy' | 'ratio' | 'score';

export default function Assets() {
  const d = useDerived();
  const { addAsset, updateAsset, removeAsset } = useStore();
  const nav = useNavigate();
  const [status, setStatus] = useState<AssetStatus | 'todos'>('todos');
  const [cls, setCls] = useState<AssetClass | 'todas'>('todas');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'value', dir: -1 });
  const [adding, setAdding] = useState<AssetStatus | null>(null);
  const move = (a: Asset) => {
    const to: AssetStatus = a.status === 'carteira' ? 'watchlist' : 'carteira';
    const p = d.positions[a.id];
    if (to === 'watchlist' && isHeld(p) && !confirm(`${a.ticker} ainda tem posição (${qtyFmt(p.qty)}). Ela continua no patrimônio e no histórico; só a lista muda. Mover para a watchlist?`)) return;
    updateAsset(a.id, { status: to });
    toast(`${a.ticker} movido para a ${to === 'carteira' ? 'carteira' : 'watchlist'}.`);
  };
  const remove = (a: Asset) => {
    const n = d.allTransactions.filter((t) => t.assetId === a.id || t.targetAssetId === a.id).length;
    if (n) return toast(`${a.ticker} tem ${n} lançamento(s) no histórico e não pode ser removido (o livro não apaga lançamentos). Use "Mover para watchlist" ou estorne os lançamentos na Central de Operações.`, true);
    if (confirm(`Remover ${a.ticker} da ${a.status === 'carteira' ? 'carteira' : 'watchlist'}?`)) {
      removeAsset(a.id);
      toast(`${a.ticker} removido.`);
    }
  };

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
          sort.k === 'ticker' ? o.a.ticker : sort.k === 'value' ? o.value : sort.k === 'weight' ? o.weight : sort.k === 'dy' ? o.r.bazin.dyCurrent ?? -1 : sort.k === 'ratio' ? -(o.r.bazin.margin ?? -999) : o.r.score;
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
          <p>Quantidade e preço médio vêm da Central de Operações. Clique no ticker para abrir a ficha completa. A watchlist só entra na lista de compras da Central de aportes quando o ativo está em Oportunidade.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setAdding('watchlist')}>+ Adicionar à watchlist</button>
          <button className="btn primary" onClick={() => setAdding('carteira')}>+ Adicionar à carteira</button>
        </div>
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
                {th('ratio', 'Margem')}
                <th className="num">Preço de interesse</th>
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
                  <td className="num" title={capOf(a, d.settings).own ? 'Teto definido para o ativo' : 'Teto geral por ativo (Parâmetros)'}>
                    <span className={weight && weight >= capOf(a, d.settings).pct && (capOf(a, d.settings).own || (a.class !== 'etf' && a.class !== 'tesouro')) ? 'neg' : ''}>{weight ? pct(weight) : '—'}</span>
                    {(capOf(a, d.settings).own || (a.class !== 'etf' && a.class !== 'tesouro')) && <div className="dim" style={{ fontSize: 11 }}>teto {pct(capOf(a, d.settings).pct, 0)}{capOf(a, d.settings).own ? '' : '*'}</div>}
                  </td>
                  <td className="num">{r.bazin.applicable ? pct(r.bazin.dyCurrent, 2) : <span className="dim">n/a</span>}</td>
                  <td>
                    {r.bazin.applicable ? (
                      <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <MiniLadder r={r.bazin} /> <span className={`mono ${r.bazin.margin !== null && r.bazin.margin < 0 ? 'neg' : 'pos'}`} style={{ fontSize: 12 }}>{r.bazin.margin === null ? '—' : `${r.bazin.margin >= 0 ? '+' : ''}${pct(r.bazin.margin, 0)}`}</span>
                      </span>
                    ) : (
                      <span className="dim">n/a</span>
                    )}
                  </td>
                  <td className="num" title={a.interestPrice ? `Manual: ${a.interestNote || 'sem justificativa'} (${a.interestDate || 'sem data'})` : 'Preço de oportunidade calculado (teto × (1 − margem))'}>
                    {a.interestPrice ? <>{brl(a.interestPrice)} <span className="dim" style={{ fontSize: 11 }}>manual</span></> : r.bazin.opportunityPrice ? brl(r.bazin.opportunityPrice) : <span className="dim">—</span>}
                  </td>
                  <td>
                    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      {recentChange(a) && <Badge tone="warn" title={recentChange(a)!}>mudou</Badge>}
                      <span className="mono">{r.score}</span> <PriorityBadge p={r.priority} />
                    </span>
                  </td>
                  <td className="nowrap">
                    <button className="btn ghost sm" title={a.status === 'carteira' ? 'Mover para a watchlist' : 'Mover para a carteira'} onClick={() => move(a)}>
                      {a.status === 'carteira' ? '→ Watchlist' : '→ Carteira'}
                    </button>
                    <button className="btn ghost sm" title="Remover da lista (só ativos sem lançamentos)" onClick={() => remove(a)}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Margem = (Teto − Preço) ÷ Teto, só para ações e FIIs; ETFs, Tesouro e cripto são avaliados por alocação. Preço de interesse: o manual (com justificativa e data, no cadastro) ou o preço de oportunidade calculado. “mudou” indica alerta da análise 360° que mudou de cor nos últimos 30 dias. <BandBadge b={null} /> = sem cotação ou sem proventos.
        </p>
      </Card>
      <Modal open={!!adding} onClose={() => setAdding(null)} title={adding === 'carteira' ? 'Novo ativo na carteira' : 'Novo ativo na watchlist'} wide>
        <AssetForm
          key={adding || ''}
          isNew
          initial={makeAsset({ ticker: '', class: 'acao', status: adding || 'watchlist' })}
          onCancel={() => setAdding(null)}
          onSave={(a) => {
            if (d.assets.some((x) => x.ticker === a.ticker)) return toast(`${a.ticker} já está cadastrado.`, true);
            addAsset({ ...a, issuer: a.issuer || a.ticker, name: a.name || a.ticker });
            setAdding(null);
            toast(`${a.ticker} adicionado à ${a.status === 'carteira' ? 'carteira' : 'watchlist'}.${a.status === 'carteira' ? ' Lance as compras na Central de Operações.' : ''}`);
            nav(`/ativo/${a.id}`);
          }}
        />
      </Modal>
      <Disclaimer />
    </div>
  );
}
