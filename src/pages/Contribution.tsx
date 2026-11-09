import { useMemo, useState } from 'react';
import { useDerived } from '../store/derived';
import { useStore } from '../store/store';
import { Badge, Card, Disclaimer, Empty, Field, Modal, NumInput, ScoreRing, Stat } from '../components/ui';
import { AssetLink, ClassBadge, PriorityBadge } from '../components/common';
import { planContribution } from '../domain/calc/allocator';
import { CLASS_LABEL, CLASS_ORDER, type AssetClass } from '../domain/types';
import { brl, pct, qtyFmt, signedPct } from '../domain/format';
import { todayISO } from '../domain/util';
import { toast } from '../components/toast';
import { IncomeTools } from '../components/IncomeTools';
import { ManualAporte } from '../components/ManualAporte';

export default function Contribution() {
  const d = useDerived();
  const { updateSettings, addTransaction } = useStore();
  const al = d.settings.allocator;
  const [amount, setAmount] = useState<number | null>(d.settings.profile.monthlyContribution);
  const [date, setDate] = useState(todayISO());
  const [eligible, setEligible] = useState<Set<string> | null>(null);
  const [showElig, setShowElig] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const setAl = (p: Partial<typeof al>) => updateSettings((s) => ({ ...s, allocator: { ...s.allocator, ...p } }));

  const plan = useMemo(
    () => planContribution({ amount: amount ?? 0, date, reserve: al.reserve, maxPerAsset: al.maxPerAsset, priorityClasses: al.priorityClasses, eligibleIds: eligible ? [...eligible] : null, includeMaintenance: al.includeMaintenance, mode: al.mode, maxAssets: al.maxAssets }, d.ranking, d.ctx),
    [amount, date, al, eligible, d],
  );

  // impacto na alocação após as compras sugeridas
  const impact = useMemo(() => {
    const add: Record<AssetClass, number> = { acao: 0, fii: 0, tesouro: 0, etf: 0, cripto: 0 };
    for (const l of plan.lines) add[l.asset.class] += l.cost;
    const total = d.alloc.total + plan.invested;
    return d.alloc.rows.map((r) => ({ ...r, after: total ? ((r.value + add[r.cls]) / total) * 100 : 0, added: add[r.cls] }));
  }, [plan, d.alloc]);

  const toggleClass = (c: AssetClass) => setAl({ priorityClasses: al.priorityClasses.includes(c) ? al.priorityClasses.filter((x) => x !== c) : [...al.priorityClasses, c] });
  const allIds = d.assets.map((a) => a.id);
  const elig = eligible ?? new Set(allIds);

  const register = () => {
    addTransaction({ date, type: 'aporte', amount: amount ?? 0, notes: 'Aporte registrado pela central' });
    for (const l of plan.lines) addTransaction({ date, type: 'compra', assetId: l.asset.id, ticker: l.asset.ticker, qty: l.qty, price: l.price, fees: 0, amount: l.cost, notes: 'Compra registrada pela central de aportes' });
    setConfirm(false);
    toast(`Registradas ${plan.lines.length} compras e o aporte de ${brl(amount)}. Ajuste preços reais na Central de Operações, se necessário.`);
  };

  return (
    <div className="stack">
      <div className="page-h">
        <div>
          <div className="kicker">Planejamento</div>
          <h1>Central de aportes</h1>
          <p>A sugestão distribui o valor disponível entre os ativos de maior prioridade, respeitando a régua de compra, a alocação-alvo e os limites de concentração. Em “Minha escolha de aporte” você define os ativos, os valores e o preço de compra de cada cota.</p>
        </div>
      </div>
      <div className="grid g2">
        <Card title="Parâmetros do aporte">
          <div className="form-grid">
            <Field label="Valor disponível"><NumInput value={amount} onChange={setAmount} /></Field>
            <Field label="Data prevista"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Reserva a manter"><NumInput value={al.reserve} onChange={(v) => setAl({ reserve: v ?? 0 })} /></Field>
            <Field label="Limite máximo por ativo"><NumInput value={al.maxPerAsset} onChange={(v) => setAl({ maxPerAsset: v ?? 0 })} /></Field>
            <Field label="Máx. de ativos"><NumInput value={al.maxAssets} onChange={(v) => setAl({ maxAssets: Math.max(1, Math.round(v ?? 1)) })} /></Field>
            <Field label="Modo">
              <select value={al.mode} onChange={(e) => setAl({ mode: e.target.value as any })}>
                <option value="auto">Automático</option>
                <option value="concentrar">Concentrar no melhor</option>
                <option value="distribuir">Distribuir entre os melhores</option>
              </select>
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="field-l" style={{ marginBottom: 6 }}>Classes prioritárias</div>
            <div className="row">
              {CLASS_ORDER.map((c) => (
                <label key={c} className="chk"><input type="checkbox" checked={al.priorityClasses.includes(c)} onChange={() => toggleClass(c)} /> {CLASS_LABEL[c]}</label>
              ))}
            </div>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <label className="chk"><input type="checkbox" checked={al.includeMaintenance} onChange={(e) => setAl({ includeMaintenance: e.target.checked })} /> Incluir faixa “Comprar para manutenção”</label>
            <button className="btn sm" onClick={() => setShowElig(true)}>Ativos elegíveis ({elig.size}/{allIds.length})</button>
          </div>
        </Card>
        <Card title="Resultado" className="hl">
          <div className="grid g3">
            <Stat label="Veredito" value={plan.verdict === 'investir' ? 'Investir' : plan.verdict === 'parcial' ? 'Investir parcial' : 'Aguardar'} tone={plan.verdict === 'aguardar' ? 'warn' : 'pos'} />
            <Stat label="Alocado" value={brl(plan.invested)} sub={`de ${brl(plan.investable)} investíveis`} />
            <Stat label="Fica em caixa" value={brl(plan.leftover)} sub={al.reserve ? `inclui reserva ${brl(al.reserve)}` : ''} />
          </div>
          <ul className="reasons" style={{ marginTop: 12 }}>{plan.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
          {plan.lines.length > 0 && (
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn" onClick={() => setConfirm(true)}>Registrar no histórico (após executar na corretora)</button>
            </div>
          )}
        </Card>
      </div>

      <Card title="Distribuição sugerida" sub="Simulação de quantidades com a última cotação disponível">
        {plan.lines.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Ativo</th><th>Pontuação</th><th>Classificação</th><th className="num">Qtd</th><th className="num">Cotação</th><th className="num">Valor</th><th className="num">% do aporte</th><th>Justificativa</th></tr></thead>
              <tbody>
                {plan.lines.map((l) => (
                  <tr key={l.asset.id}>
                    <td><AssetLink a={l.asset} /> <ClassBadge c={l.asset.class} /></td>
                    <td><ScoreRing score={l.result.score} size={36} /></td>
                    <td><PriorityBadge p={l.result.priority} /></td>
                    <td className="num">{qtyFmt(l.qty, l.asset.class)}</td>
                    <td className="num">{brl(l.price)}</td>
                    <td className="num">{brl(l.cost)}</td>
                    <td className="num">{pct(plan.invested ? (l.cost / plan.invested) * 100 : 0, 0)}</td>
                    <td><ul className="reasons">{l.why.map((w, i) => <li key={i}>{w}</li>)}</ul></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={5}>Total</td><td className="num">{brl(plan.invested)}</td><td colSpan={2}></td></tr></tfoot>
            </table>
          </div>
        ) : (
          <Empty>Nenhuma compra sugerida. O sistema não força a aplicação quando não há oportunidades adequadas.</Empty>
        )}
      </Card>

      <ManualAporte amount={amount ?? 0} date={date} suggestion={plan.lines.map((l) => ({ assetId: l.asset.id, qty: l.qty }))} />

      <div className="grid g2">
        <Card title="Impacto na alocação (sugestão)">
          <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Classe</th><th className="num">Hoje</th><th className="num">Após</th><th className="num">Alvo</th><th className="num">Aporte</th></tr></thead>
            <tbody>
              {impact.map((r) => (
                <tr key={r.cls}>
                  <td>{CLASS_LABEL[r.cls]}</td>
                  <td className="num">{pct(r.current)}</td>
                  <td className="num">{pct(r.after)} <span className={Math.abs(r.after - r.target) < Math.abs(r.current - r.target) ? 'pos' : 'dim'} style={{ fontSize: 11 }}>{signedPct(r.after - r.current)}</span></td>
                  <td className="num">{pct(r.target, 0)}</td>
                  <td className="num">{r.added ? brl(r.added) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
        <Card title="Por que outros ativos ficaram de fora" sub="Primeiros 15 do ranking">
          {plan.excluded.length ? (
            <table className="tbl">
              <tbody>
                {plan.excluded.slice(0, 15).map((e) => (
                  <tr key={e.asset.id}><td><AssetLink a={e.asset} sub={false} /></td><td className="muted" style={{ fontSize: 12 }}>{e.reason}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>—</Empty>
          )}
        </Card>
      </div>

      <Modal open={showElig} onClose={() => setShowElig(false)} title="Ativos elegíveis para este aporte" wide>
        <div className="row" style={{ marginBottom: 10 }}>
          <button className="btn sm" onClick={() => setEligible(null)}>Todos</button>
          <button className="btn sm" onClick={() => setEligible(new Set(d.assets.filter((a) => a.status === 'carteira').map((a) => a.id)))}>Só carteira</button>
          <button className="btn sm" onClick={() => setEligible(new Set())}>Nenhum</button>
        </div>
        <div className="form-grid">
          {d.assets.map((a) => (
            <label key={a.id} className="chk">
              <input type="checkbox" checked={elig.has(a.id)} onChange={() => { const n = new Set(elig); n.has(a.id) ? n.delete(a.id) : n.add(a.id); setEligible(n); }} />
              <span className="mono">{a.ticker}</span> <Badge tone="muted">{a.status === 'carteira' ? 'C' : 'W'}</Badge>
            </label>
          ))}
        </div>
      </Modal>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Registrar aporte e compras">
        <p>O sistema <b>não executa ordens</b>. Use isto somente depois de comprar na {d.settings.profile.broker}. Serão lançados:</p>
        <ul>
          <li>Aporte de {brl(amount)} em {date}</li>
          {plan.lines.map((l) => <li key={l.asset.id}>Compra de {qtyFmt(l.qty, l.asset.class)} {l.asset.ticker} a {brl(l.price)}</li>)}
        </ul>
        <p className="muted">Preços e taxas podem ser ajustados depois na Central de Operações.</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => setConfirm(false)}>Cancelar</button>
          <button className="btn primary" onClick={register}>Registrar</button>
        </div>
      </Modal>
      <IncomeTools suggestedId={plan.lines[0]?.asset.id} />
      <Disclaimer />
    </div>
  );
}
