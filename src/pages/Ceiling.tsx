import { useMemo, useState } from 'react';
import { useDerived } from '../store/derived';
import { useStore } from '../store/store';
import { Card, DataTag, Disclaimer, Field, NumInput, Stat, Why } from '../components/ui';
import { AssetLink, BandBadge } from '../components/common';
import { Ladder, MiniLadder } from '../components/Ladder';
import { brl, dateBR, num, pct } from '../domain/format';
import { computeBazin, ceilingPrice, BAND_INFO, dpaRefFor } from '../domain/calc/bazin';
import { makeAsset } from '../domain/seed';
import { DPA_REF_LABEL, isBazinClass, type DpaRef } from '../domain/types';
import { REFS } from '../domain/calc/analysis360';
import { TAX_REFS } from '../domain/tax';

export default function Ceiling() {
  const d = useDerived();
  const update = useStore((s) => s.updateAsset);
  const [filter, setFilter] = useState<'todos' | 'carteira' | 'watchlist'>('todos');
  const [cls, setCls] = useState<'todas' | 'acao' | 'fii'>('todas');
  const [sel, setSel] = useState<string | null>(null);
  const s = d.settings;
  const list = useMemo(
    () =>
      d.assets
        .filter((a) => isBazinClass(a.class) && (filter === 'todos' || a.status === filter) && (cls === 'todas' || a.class === cls))
        .map((a) => ({ a, r: d.scoreById[a.id].bazin }))
        .sort((x, y) => (y.r.margin ?? -999) - (x.r.margin ?? -999)),
    [d, filter, cls],
  );
  const selected = list.find((x) => x.a.id === sel) || list.find((x) => x.r.ceiling) || null;
  const selicMacro = useStore((st) => st.macro.find((m) => m.key === 'selic'));

  // calculadora livre (DPA LÍQUIDO informado)
  const [calc, setCalc] = useState<{ div: number | null; dy: number | null; price: number | null }>({ div: 2, dy: s.defaultDy.acao, price: 22 });
  const calcR = useMemo(() => {
    const a = makeAsset({ ticker: 'CALC', class: 'acao', dyTarget: calc.dy, next12mEstimate: calc.div, useEstimate: true, thesis: 'x' });
    a.quote = { price: calc.price, date: null, source: null };
    return computeBazin(a, s);
  }, [calc, s]);

  return (
    <div className="stack">
      <div className="page-h">
        <div>
          <div className="kicker">Método Bazin · calculadora de preço-teto</div>
          <h1>Preço-teto & régua de compra</h1>
          <p>
            Teto = DPA de referência <b>líquido</b> ÷ DY exigido. Oportunidade = Teto × (1 − margem). Margem de segurança = (Teto − Preço) ÷ Teto. Um único motor alimenta esta tela, a ficha do ativo, o ranking e a central de aportes.
            <Why text={`${REFS.bazin} ${TAX_REFS.jcp} Proventos marcados como extraordinários não entram no DPA (Lintner, 1956).`} />
          </p>
        </div>
      </div>

      <div className="grid g4">
        <Stat label="DY original de Bazin" value={pct(s.bazinDy, 0)} sub="referência histórica do método" />
        <Stat label="Seu DY-alvo" value={`${pct(s.defaultDy.acao, 1)} · ${pct(s.defaultDy.fii, 1)}`} sub="ações · FIIs (editável por ativo)" />
        <Stat label="Selic meta" value={selicMacro?.value === null || !selicMacro ? '—' : pct(selicMacro.value, 2)} sub="custo de oportunidade nominal" seal={{ source: 'Banco Central (SGS 432)', at: selicMacro?.fetchedAt || selicMacro?.date }} />
        <Stat label="NTN-B (~10 anos)" value={d.market.ntnb ? `IPCA + ${pct(d.market.ntnb.rate, 2)}` : '—'} sub={d.market.ntnb ? `vencimento ${dateBR(d.market.ntnb.maturity)} · custo de oportunidade real` : 'sem dado'} seal={{ source: 'Tesouro Nacional', at: d.market.ntnb?.date }} />
      </div>

      {selected && (
        <Card title={<>Régua — <AssetLink a={selected.a} sub={false} /></>} sub={`${selected.a.name} · DPA ${brl(selected.r.base.value)} (${selected.r.base.label}${selected.r.dpaNote ? '; ' + selected.r.dpaNote : ''}) · DY-alvo ${selected.r.dyTarget}% · margem exigida ${s.bands.margin}%`} className="hl">
          <Ladder r={selected.r} bands={s.bands} />
        </Card>
      )}

      <Card
        title="Ativos de renda"
        sub="Ordenados da maior para a menor margem. DY-alvo e DPA de referência editáveis por ativo."
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
                <th>DPA de referência</th>
                <th className="num">DPA líquido</th>
                <th className="num">DY-alvo</th>
                <th className="num">Teto</th>
                <th className="num">Teto Bazin {s.bazinDy}%</th>
                <th className="num">Oportunidade</th>
                <th className="num">Cotação</th>
                <th className="num">DY 12m líq.</th>
                <th className="num">Margem</th>
                <th>Faixa</th>
                <th className="num">Próxima faixa</th>
              </tr>
            </thead>
            <tbody>
              {list.map(({ a, r }) => (
                <tr key={a.id} onClick={() => setSel(a.id)} style={{ cursor: 'pointer', background: selected?.a.id === a.id ? 'rgba(47,140,255,.07)' : undefined }}>
                  <td><AssetLink a={a} /></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select value={a.dpaRef || ''} onChange={(e) => update(a.id, { dpaRef: (e.target.value || null) as DpaRef | null })} style={{ width: 150, padding: '4px 6px', fontSize: 12 }} aria-label={`DPA de referência de ${a.ticker}`}>
                      <option value="">Padrão ({DPA_REF_LABEL[dpaRefFor({ ...a, dpaRef: null }, s)].toLowerCase()})</option>
                      {(Object.keys(DPA_REF_LABEL) as DpaRef[]).map((k) => <option key={k} value={k}>{DPA_REF_LABEL[k]}</option>)}
                    </select>
                    {r.dpaNote && <div className="warn-t" style={{ fontSize: 11 }}>{r.dpaNote}</div>}
                  </td>
                  <td className="num">{brl(r.base.value)} {r.base.kind !== 'real' && <DataTag kind={r.base.kind === 'estimativa' ? 'estimativa' : 'ausente'} />}</td>
                  <td className="num" onClick={(e) => e.stopPropagation()} style={{ width: 90 }}>
                    <NumInput className="sm" value={a.dyTarget} placeholder={String(r.dyTarget)} suffix="%" onChange={(v) => update(a.id, { dyTarget: v })} />
                  </td>
                  <td className="num">{brl(r.ceiling)}</td>
                  <td className="num dim">{brl(r.bazinCeiling)}</td>
                  <td className="num">{brl(r.opportunityPrice)}</td>
                  <td className="num">{r.price === null ? <DataTag kind="ausente" /> : brl(r.price)}</td>
                  <td className="num">{pct(r.dyCurrent, 2)}</td>
                  <td className="num">
                    <span className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <MiniLadder r={r} />
                      <span className={r.margin === null ? '' : r.margin < 0 ? 'neg' : 'pos'}>{r.margin === null ? '—' : `${r.margin >= 0 ? '▲ +' : '▼ '}${num(r.margin, 1)}%`}</span>
                    </span>
                  </td>
                  <td><BandBadge b={r.band} /></td>
                  <td className="num">{r.nextBand ? `−${brl(r.nextBand.distanceAbs)} (${num(r.nextBand.distancePct, 1)}%)` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          DPA líquido: JCP descontado o IRRF de {pct(s.tax.jcpRate, 1)}; rendimento de FII isento quando cumpre os requisitos; dividendos sem retenção por ação (a regra dos R$ 50 mil/mês é por investidor). Proventos anteriores à janela da B3 vêm do Yahoo sem o tipo: são tratados como dividendos (estimativa).
        </p>
      </Card>

      <div className="grid g2">
        <Card title="Calculadora rápida" sub="Simule qualquer ativo informando o DPA líquido">
          <div className="form-grid">
            <Field label="DPA anual líquido por unidade"><NumInput value={calc.div} onChange={(v) => setCalc({ ...calc, div: v })} /></Field>
            <Field label="DY exigido"><NumInput value={calc.dy} suffix="%" onChange={(v) => setCalc({ ...calc, dy: v })} /></Field>
            <Field label="Cotação"><NumInput value={calc.price} onChange={(v) => setCalc({ ...calc, price: v })} /></Field>
          </div>
          <div className="grid g3" style={{ marginTop: 12 }}>
            <Stat label="Preço-teto" value={brl(calcR.ceiling)} tone="info" sub={`Bazin ${s.bazinDy}%: ${brl(calcR.bazinCeiling)}`} />
            <Stat label="Oportunidade" value={brl(calcR.opportunityPrice)} sub={`margem exigida ${s.bands.margin}%`} />
            <Stat label="Margem" value={calcR.margin === null ? '—' : `${calcR.margin >= 0 ? '+' : ''}${pct(calcR.margin, 1)}`} sub={calcR.band ? BAND_INFO[calcR.band].label : ''} tone={calcR.margin !== null && calcR.margin < 0 ? 'neg' : 'pos'} />
          </div>
          {calcR.ceiling && <div style={{ marginTop: 14 }}><Ladder r={calcR} bands={s.bands} compact /></div>}
        </Card>
        <Card title="Régua (exemplo: DPA líquido R$ 2,00, DY 8%)" sub="Limite editável em Parâmetros">
          <table className="tbl">
            <thead><tr><th>Faixa</th><th>Margem</th><th className="num">Preço</th><th>Decisão</th></tr></thead>
            <tbody>
              {(['aguardar', 'manutencao', 'oportunidade'] as const).map((k) => {
                const teto = ceilingPrice(2, 8);
                const op = teto * (1 - s.bands.margin / 100);
                const rel = { aguardar: 'abaixo de 0%', manutencao: `0% a ${s.bands.margin}%`, oportunidade: `≥ ${s.bands.margin}%` }[k];
                const pr = { aguardar: `> ${brl(teto)}`, manutencao: `${brl(op)} – ${brl(teto)}`, oportunidade: `≤ ${brl(op)}` }[k];
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
          <p className="muted" style={{ fontSize: 12 }}>Oportunidade exige também o filtro de qualidade (Etapa 8): sem alerta vermelho em endividamento, perfil da dívida e sustentabilidade; F-Score ≥ {s.limits360.fScoreMin}; Altman fora da zona de alerta; tese registrada.</p>
        </Card>
      </div>
      <Disclaimer />
    </div>
  );
}
