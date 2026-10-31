import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDerived } from '../store/derived';
import { AlertList, Badge, Card, Disclaimer, Empty, Tabs } from '../components/ui';
import { PALETTE } from '../components/common';
import { DIMENSION_LABEL, exposure, overlaps, type Dimension } from '../domain/calc/concentration';
import { brl, pct } from '../domain/format';

const DIMS: Dimension[] = ['ativo', 'setor', 'emissor', 'classe', 'segmentoFii', 'tipoFii', 'internacional', 'moeda'];

export default function Concentration() {
  const d = useDerived();
  const [dim, setDim] = useState<Dimension>('setor');
  const rows = exposure(d.assets, d.positions, dim);
  const ov = overlaps(d.assets, d.positions);
  const L = d.settings.limits;
  const limitFor: Partial<Record<Dimension, number>> = { ativo: L.maxAssetPct, setor: L.maxSectorPct, emissor: L.maxIssuerPct, segmentoFii: L.maxFiiSegmentPct };
  const lim = limitFor[dim];
  return (
    <div className="stack">
      <div className="page-h">
        <div>
          <div className="kicker">Risco</div>
          <h1>Concentração e diversificação</h1>
          <p>Exposição por ativo, setor, emissor, classe, segmento de FII, exposição internacional e moeda. Limites editáveis em <Link to="/config">Parâmetros</Link>.</p>
        </div>
      </div>
      <Card title="Alertas de concentração">{d.concAlerts.length ? <AlertList alerts={d.concAlerts} /> : <Empty>{d.totals.marketValue ? 'Nenhum limite ultrapassado.' : 'Sem posições registradas.'}</Empty>}</Card>
      <Card title="Exposição" right={lim ? <span className="muted" style={{ fontSize: 12 }}>limite {lim}%{dim === 'segmentoFii' ? ' dos FIIs' : ''}</span> : null}>
        <Tabs tabs={DIMS.map((k) => ({ key: k, label: DIMENSION_LABEL[k] }))} value={dim} onChange={setDim} />
        {rows.length ? (
          <div className="stack" style={{ gap: 8 }}>
            <div className="bar-h" style={{ height: 14 }}>
              {rows.map((r, i) => <span key={r.key} title={`${r.key}: ${pct(r.pct)}`} style={{ width: `${r.pct}%`, background: PALETTE[i % PALETTE.length] }} />)}
            </div>
            <table className="tbl">
              <thead><tr><th>{DIMENSION_LABEL[dim]}</th><th className="num">Valor</th><th className="num">Peso</th><th style={{ width: '30%' }}></th><th>Ativos</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key}>
                    <td><span style={{ color: PALETTE[i % PALETTE.length] }}>■</span> {r.key}</td>
                    <td className="num">{brl(r.value)}</td>
                    <td className={`num ${lim && r.pct > lim ? 'neg' : ''}`}>{pct(r.pct)}</td>
                    <td>
                      <div className="bar-h" style={{ position: 'relative' }}>
                        <span style={{ width: `${r.pct}%`, background: lim && r.pct > lim ? 'var(--neg)' : PALETTE[i % PALETTE.length] }} />
                        {lim && <i style={{ position: 'absolute', left: `${lim}%`, top: -2, bottom: -2, width: 2, background: 'var(--warn)' }} />}
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.tickers.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dim === 'setor' && <p className="muted" style={{ fontSize: 12 }}>O alerta de setor considera apenas ações e FIIs sobre o patrimônio total; ETFs, Tesouro e cripto aparecem como categorias próprias.</p>}
          </div>
        ) : (
          <Empty>Sem posições para esta dimensão.</Empty>
        )}
      </Card>
      <Card title="Sobreposições identificadas" sub="Inclui ativos da watchlist para avaliar o efeito de compras futuras">
        {ov.length ? (
          <div className="grid g2">
            {ov.map((o, i) => (
              <div key={i} className="note" style={{ borderLeftColor: o.kind === 'emissor' ? 'var(--warn)' : o.kind === 'setor' ? 'var(--neg)' : 'var(--accent)' }}>
                <div className="row between">
                  <b style={{ color: 'var(--text)' }}>{o.title}</b>
                  <Badge tone={o.held ? 'warn' : 'muted'}>{o.held ? 'na carteira' : 'potencial'}</Badge>
                </div>
                <div style={{ marginTop: 4 }}>{o.detail}</div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>Nenhuma sobreposição.</Empty>
        )}
      </Card>
      <Disclaimer />
    </div>
  );
}
