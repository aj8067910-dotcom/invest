import { useMemo, useState } from 'react';
import { useDerived } from '../store/derived';
import { useStore } from '../store/store';
import { Card, DataTag, Disclaimer, Field, NumInput, Stat } from '../components/ui';
import { AssetLink, BandBadge } from '../components/common';
import { Ladder, MiniLadder } from '../components/Ladder';
import { brl, num, pct } from '../domain/format';
import { computeBazin, ceilingPrice, bandFor, BAND_INFO } from '../domain/calc/bazin';
import { makeAsset } from '../domain/seed';
import { isBazinClass } from '../domain/types';

export default function Ceiling() {
  const d = useDerived();
  const update = useStore((s) => s.updateAsset);
  const [filter, setFilter] = useState<'todos' | 'carteira' | 'watchlist'>('todos');
  const [cls, setCls] = useState<'todas' | 'acao' | 'fii'>('todas');
  const [sel, setSel] = useState<string | null>(null);
  const list = useMemo(
    () =>
      d.assets
        .filter((a) => isBazinClass(a.class) && (filter === 'todos' || a.status === filter) && (cls === 'todas' || a.class === cls))
        .map((a) => ({ a, r: d.scoreById[a.id].bazin }))
        .sort((x, y) => (x.r.ratio ?? 999) - (y.r.ratio ?? 999)),
    [d, filter, cls],
  );
  const selected = list.find((x) => x.a.id === sel) || list.find((x) => x.r.ceiling) || null;

  // calculadora livre
  const [calc, setCalc] = useState<{ div: number | null; dy: number | null; price: number | null }>({ div: 2, dy: 8, price: null });
  const calcAsset = useMemo(() => {
    const a = makeAsset({ ticker: 'CALC', class: 'acao', dyTarget: calc.dy, next12mEstimate: calc.div, useEstimate: true });
    a.quote = { price: calc.price, date: null, source: null };
    return computeBazin(a, d.settings);
  }, [calc, d.settings]);

  return (
    <div className="stack">
      <div className="page-h">
        <div>
          <div className="kicker">Método Bazin</div>
          <h1>Preço-teto & régua de compra</h1>
          <p>Preço-teto = provento anual recorrente por unidade ÷ DY-alvo. Proventos extraordinários são excluídos. Aplicado somente a ações e FIIs.</p>
        </div>
      </div>

      {selected && (
        <Card title={<>Régua — <AssetLink a={selected.a} sub={false} /></>} sub={`${selected.a.name} · base ${brl(selected.r.base.value)} (${selected.r.base.label}) · DY-alvo ${selected.r.dyTarget}%`} className="hl">
          <Ladder r={selected.r} bands={d.settings.bands} />
        </Card>
      )}

      <Card
        title="Todos os ativos de renda"
        sub="Ordenados do mais descontado ao mais caro. Clique em uma linha para ver a régua. DY-alvo editável por ativo."
        right={
          <div className="row">
            <div className="seg">
              {(['todos', 'carteira', 'watchlist'] as const).map((f) => (
                <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
              ))}
            </div>
            <div className="seg">
              {(['todas', 'acao', 'fii'] as const).map((f) => (
                <button key={f} className={cls === f ? 'on' : ''} onClick={() => setCls(f)}>{f === 'todas' ? 'Todas' : f === 'acao' ? 'Ações' : 'FIIs'}</button>
              ))}
            </div>
          </div>
        }
      >
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ativo</th>
                <th className="num">Provento base</th>
                <th className="num">DY-alvo</th>
                <th className="num">Preço-teto</th>
                <th className="num">Cotação</th>
                <th className="num">DY atual</th>
                <th className="num">Preço/teto</th>
                <th className="num">Desc./prêmio</th>
                <th className="num">Entrada ideal</th>
                <th>Faixa</th>
                <th className="num">Próx. faixa</th>
                {d.settings.dyScenarios.map((s) => (
                  <th key={s} className="num">Teto {s}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(({ a, r }) => (
                <tr key={a.id} onClick={() => setSel(a.id)} style={{ cursor: 'pointer', background: selected?.a.id === a.id ? 'rgba(47,140,255,.07)' : undefined }}>
                  <td><AssetLink a={a} /></td>
                  <td className="num">
                    {brl(r.base.value)} {r.base.kind !== 'real' && <DataTag kind={r.base.kind === 'estimativa' ? 'estimativa' : 'ausente'} />}
                  </td>
                  <td className="num" onClick={(e) => e.stopPropagation()} style={{ width: 90 }}>
                    <NumInput className="sm" value={a.dyTarget} placeholder={String(r.dyTarget)} suffix="%" onChange={(v) => update(a.id, { dyTarget: v })} />
                  </td>
                  <td className="num">{brl(r.ceiling)}</td>
                  <td className="num">{r.price === null ? <DataTag kind="ausente" /> : brl(r.price)}</td>
                  <td className="num">{pct(r.dyCurrent, 2)}</td>
                  <td className="num">
                    <span className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <MiniLadder r={r} /> {pct(r.ratio, 0)}
                    </span>
                  </td>
                  <td className={`num ${r.discount === null ? '' : r.discount >= 0 ? 'pos' : 'neg'}`}>{r.discount === null ? '—' : (r.discount >= 0 ? '−' : '+') + num(Math.abs(r.discount), 1) + '%'}</td>
                  <td className="num">{brl(r.idealEntry)}</td>
                  <td><BandBadge b={r.band} /></td>
                  <td className="num">{r.nextBand ? `${brl(r.nextBand.distanceAbs)} (${num(r.nextBand.distancePct, 1)}%)` : '—'}</td>
                  {r.scenarios.map((s) => (
                    <td key={s.dy} className="num dim">{brl(s.ceiling)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>“Desc./prêmio”: − indica desconto em relação ao teto; + indica prêmio (cotação acima do teto). Margem de segurança = desconto quando positivo.</p>
      </Card>

      <div className="grid g2">
        <Card title="Calculadora rápida" sub="Simule qualquer ativo sem cadastrar">
          <div className="form-grid">
            <Field label="Provento anual por unidade"><NumInput value={calc.div} onChange={(v) => setCalc({ ...calc, div: v })} /></Field>
            <Field label="DY-alvo"><NumInput value={calc.dy} suffix="%" onChange={(v) => setCalc({ ...calc, dy: v })} /></Field>
            <Field label="Cotação (opcional)"><NumInput value={calc.price} onChange={(v) => setCalc({ ...calc, price: v })} /></Field>
          </div>
          <div className="grid g3" style={{ marginTop: 12 }}>
            <Stat label="Preço-teto" value={brl(calcAsset.ceiling)} tone="info" />
            <Stat label="Preço/teto" value={pct(calcAsset.ratio, 1)} sub={calcAsset.band ? BAND_INFO[calcAsset.band].label : ''} />
            <Stat label="DY na cotação" value={calc.price && calc.div ? pct((calc.div / calc.price) * 100, 2) : '—'} />
          </div>
          {calcAsset.ceiling && <div style={{ marginTop: 14 }}><Ladder r={calcAsset} bands={d.settings.bands} compact /></div>}
        </Card>
        <Card title="Faixas da régua (exemplo: teto R$ 50,00)" sub="Limites editáveis em Parâmetros">
          <table className="tbl">
            <thead><tr><th>Faixa</th><th>Relação com o teto</th><th className="num">Preço</th><th>Decisão</th></tr></thead>
            <tbody>
              {(['aguardar', 'manutencao', 'oportunidade', 'extrema'] as const).map((k) => {
                const b = d.settings.bands;
                const rel = { aguardar: `> ${b.wait}%`, manutencao: `${b.maintenance}–${b.wait}%`, oportunidade: `${b.opportunity}–${b.maintenance}%`, extrema: `≤ ${b.opportunity}%` }[k];
                const pr = { aguardar: `> ${brl(50 * b.wait / 100)}`, manutencao: `${brl(50 * b.maintenance / 100)} – ${brl(50 * b.wait / 100)}`, oportunidade: `${brl(50 * b.opportunity / 100)} – ${brl(50 * b.maintenance / 100)}`, extrema: `≤ ${brl(50 * b.opportunity / 100)}` }[k];
                return (
                  <tr key={k}>
                    <td><BandBadge b={k} /></td>
                    <td className="mono">{rel}</td>
                    <td className="num">{pr}</td>
                    <td className="muted">{BAND_INFO[k].decision}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12 }}>Verificação: {brl(ceilingPrice(2, 8))} = R$ 2,00 ÷ 8%. Faixa de R$ 40,00 com teto R$ 50: {BAND_INFO[bandFor(80, d.settings.bands)].label}.</p>
        </Card>
      </div>
      <Disclaimer />
    </div>
  );
}
