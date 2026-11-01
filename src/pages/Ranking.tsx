import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDerived } from '../store/derived';
import { useStore } from '../store/store';
import { AlertList, Badge, Card, Disclaimer, Meter, NumInput, ScoreRing } from '../components/ui';
import { AssetLink, BandBadge, ClassBadge, PriorityBadge } from '../components/common';
import { PRIORITY_INFO, type Priority } from '../domain/calc/scoring';
import { CRITERION_LABEL, type Criterion } from '../domain/types';
import { pct } from '../domain/format';

const SHOW: Criterion[] = ['qualidade', 'sustentabilidade', 'dy', 'preco', 'alocacao'];

export default function Ranking() {
  const d = useDerived();
  const updateSettings = useStore((s) => s.updateSettings);
  const [status, setStatus] = useState<'todos' | 'carteira' | 'watchlist'>('todos');
  const [prio, setPrio] = useState<Priority | 'todas'>('todas');
  const [open, setOpen] = useState<string | null>(null);
  const [showW, setShowW] = useState(false);
  const byId = useMemo(() => new Map(d.assets.map((a) => [a.id, a])), [d.assets]);
  const rows = d.ranking.filter((r) => {
    const a = byId.get(r.assetId)!;
    return (status === 'todos' || a.status === status) && (prio === 'todas' || r.priority === prio);
  });
  const counts = Object.fromEntries((Object.keys(PRIORITY_INFO) as Priority[]).map((p) => [p, d.ranking.filter((r) => r.priority === p).length]));
  const wSum = Object.values(d.settings.weights).reduce((a, b) => a + b, 0);

  return (
    <div className="stack">
      <div className="page-h">
        <div>
          <div className="kicker">Priorização</div>
          <h1>Ranking de aportes</h1>
          <p>Classificação objetiva (Etapa 8): margem = (Teto − Preço) ÷ Teto; Aguardar abaixo de 0%, Manutenção até a margem exigida, Oportunidade a partir dela se aprovado no filtro de qualidade. Um alerta vermelho rebaixa para Aguardar; dois amarelos, para Manutenção; peso acima do alvo ou sobreposição econômica cai uma faixa. A pontuação 0–100 só ordena os ativos dentro de cada faixa.</p>
        </div>
        <button className="btn" onClick={() => setShowW((x) => !x)}>{showW ? 'Ocultar pesos' : 'Ajustar pesos'}</button>
      </div>
      {showW && (
        <Card title="Pesos dos critérios" sub={`Soma atual: ${wSum} (a pontuação é normalizada pelos pesos com dado disponível)`}>
          <div className="form-grid">
            {(Object.keys(CRITERION_LABEL) as Criterion[]).map((k) => (
              <label key={k} className="field">
                <span className="field-l">{CRITERION_LABEL[k]}</span>
                <NumInput value={d.settings.weights[k]} onChange={(v) => updateSettings((s) => ({ ...s, weights: { ...s.weights, [k]: Math.max(0, v ?? 0) } }))} />
              </label>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Limiares de classificação e cobertura mínima em <Link to="/config">Parâmetros</Link>.</p>
        </Card>
      )}
      <div className="row">
        {(Object.keys(PRIORITY_INFO) as Priority[]).map((p) => (
          <button key={p} className={`btn sm ${prio === p ? 'primary' : ''}`} onClick={() => setPrio(prio === p ? 'todas' : p)}>
            {PRIORITY_INFO[p].label} <span className="mono">{counts[p]}</span>
          </button>
        ))}
        <div className="seg" style={{ marginLeft: 'auto' }}>
          {(['todos', 'carteira', 'watchlist'] as const).map((s) => (
            <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s[0].toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
      </div>
      <Card>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Ativo</th>
                <th>Pontuação</th>
                <th>Classificação</th>
                <th>Régua</th>
                {SHOW.map((k) => <th key={k} style={{ minWidth: 90 }}>{CRITERION_LABEL[k].split(' ')[0]}</th>)}
                <th className="num">Dados</th>
                <th>Filtro de qualidade</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const a = byId.get(r.assetId)!;
                return (
                  <Fragment key={r.assetId}>
                    <tr onClick={() => setOpen(open === r.assetId ? null : r.assetId)} style={{ cursor: 'pointer' }}>
                      <td className="mono dim">{i + 1}</td>
                      <td>
                        <AssetLink a={a} /> <ClassBadge c={a.class} />
                      </td>
                      <td><ScoreRing score={r.score} size={38} /></td>
                      <td><PriorityBadge p={r.priority} /></td>
                      <td>{r.bazin.applicable ? <BandBadge b={r.bazin.band} /> : <span className="dim">n/a</span>}</td>
                      {SHOW.map((k) => {
                        const c = r.criteria.find((x) => x.key === k)!;
                        return (
                          <td key={k} title={c.note}>
                            {c.na ? <span className="dim">n/a</span> : c.score === null ? <span className="neg" style={{ fontSize: 11 }}>sem dado</span> : <Meter value={c.score} tone={c.score >= 70 ? 'pos' : c.score >= 45 ? undefined : 'warn'} />}
                          </td>
                        );
                      })}
                      <td className="num">{pct(r.coverage, 0)}</td>
                      <td>{r.bazin.applicable ? (r.quality.passed ? <Badge tone="good">● aprovado</Badge> : <Badge tone="warn" title={r.quality.failures.join('; ')}>▲ reprovado</Badge>) : <span className="dim">alocação</span>}</td>
                      <td className="muted" style={{ fontSize: 12, maxWidth: 320 }}>{r.reasons[r.reasons.length - 1] || r.reasons[0]}</td>
                    </tr>
                    {open === r.assetId && (
                      <tr>
                        <td colSpan={6 + SHOW.length + 3} style={{ background: 'var(--bg2)' }}>
                          <div className="grid g2" style={{ padding: '6px 0' }}>
                            <div>
                              <b style={{ fontSize: 12.5 }}>Justificativa</b>
                              <ul className="reasons">{r.reasons.map((x, j) => <li key={j}>{x}</li>)}</ul>
                              {r.alerts.length > 0 && <div style={{ marginTop: 8 }}><AlertList alerts={r.alerts} /></div>}
                            </div>
                            <div>
                              <b style={{ fontSize: 12.5 }}>Critérios</b>
                              <table className="tbl"><tbody>{r.criteria.filter((c) => !c.na).map((c) => (
                                <tr key={c.key}><td>{c.label}</td><td className="num">{c.score ?? '—'}</td><td className="muted" style={{ fontSize: 12 }}>{c.note}</td></tr>
                              ))}</tbody></table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Disclaimer />
    </div>
  );
}
