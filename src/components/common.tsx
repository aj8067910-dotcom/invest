import { Link } from 'react-router-dom';
import type { Asset, AssetClass } from '../domain/types';
import { CLASS_LABEL } from '../domain/types';
import { PRIORITY_INFO, type Priority } from '../domain/calc/scoring';
import { BAND_INFO, type BandKey } from '../domain/calc/bazin';
import { Badge, DataTag } from './ui';
import { brl } from '../domain/format';

export const CLASS_COLOR: Record<AssetClass, string> = {
  acao: '#2f8cff',
  fii: '#2fd38a',
  tesouro: '#f5b83d',
  etf: '#38c6f4',
  cripto: '#c49bff',
};
export const PALETTE = ['#2f8cff', '#2fd38a', '#f5b83d', '#38c6f4', '#c49bff', '#f0525f', '#7dd3fc', '#a3e635', '#fb923c', '#e879f9', '#94a3b8', '#facc15'];

export function AssetLink({ a, sub = true }: { a: Asset; sub?: boolean }) {
  return (
    <Link to={`/ativo/${a.id}`} className="tk">
      {a.ticker}
      {sub && <span className="tk-sub">{a.name}</span>}
    </Link>
  );
}

export function PriorityBadge({ p }: { p: Priority }) {
  return <Badge tone={PRIORITY_INFO[p].tone}>{PRIORITY_INFO[p].label}</Badge>;
}

export function BandBadge({ b }: { b: BandKey | null }) {
  if (!b) return <Badge tone="muted">sem faixa</Badge>;
  const tone = BAND_INFO[b].tone;
  return <Badge tone={tone === 'good' ? 'good' : tone === 'info' ? 'info' : 'muted'}>{BAND_INFO[b].label}</Badge>;
}

export function ClassBadge({ c }: { c: AssetClass }) {
  return (
    <span className="badge b-muted" style={{ color: CLASS_COLOR[c], borderColor: CLASS_COLOR[c] + '66' }}>
      {CLASS_LABEL[c]}
    </span>
  );
}

export function QuoteCell({ a }: { a: Asset }) {
  if (a.quote.price === null) return <DataTag kind="ausente" />;
  return (
    <span className="nowrap">
      {brl(a.quote.price)} <DataTag kind={a.quote.kind === 'manual' ? 'manual' : 'real'} date={a.quote.date} source={a.quote.source} />
    </span>
  );
}

export function ChartTip({ active, payload, label, fmt = brl, labelFmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rt">
      <div className="muted" style={{ marginBottom: 4 }}>{labelFmt ? labelFmt(label) : label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey + p.name}>
          <span style={{ color: p.color || p.fill }}>■</span> {p.name}: <b>{fmt(p.value)}</b>
        </div>
      ))}
    </div>
  );
}
