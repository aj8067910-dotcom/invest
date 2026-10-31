import { useStore } from '../store/store';
import { Card, Disclaimer, Field, NumInput } from '../components/ui';
import { defaultSettings } from '../domain/seed';
import { CRITERION_LABEL, type Criterion, type Settings } from '../domain/types';
import { toast } from '../components/toast';

type Path<K extends keyof Settings> = [K, keyof Settings[K]];

export default function SettingsPage() {
  const s = useStore((x) => x.settings);
  const update = useStore((x) => x.updateSettings);
  const set = <K extends keyof Settings>([k, f]: Path<K>, v: unknown) => update((x) => ({ ...x, [k]: { ...(x[k] as object), [f]: v } }));
  const n = <K extends keyof Settings>(p: Path<K>, label: string, suffix?: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <NumInput value={(s[p[0]] as any)[p[1]]} suffix={suffix} onChange={(v) => set(p, v ?? 0)} />
    </Field>
  );
  const bandsOk = s.bands.wait > s.bands.maintenance && s.bands.maintenance > s.bands.opportunity;

  return (
    <div className="stack">
      <div className="page-h">
        <div>
          <div className="kicker">Configuração</div>
          <h1>Parâmetros do sistema</h1>
          <p>Todos os parâmetros de decisão são editáveis e ficam salvos. Alterações recalculam instantaneamente preço-teto, régua, ranking e central de aportes.</p>
        </div>
        <button className="btn" onClick={() => { const d = defaultSettings(); update((x) => ({ ...d, integrations: x.integrations, profile: x.profile, targetAllocation: x.targetAllocation, goals: x.goals })); toast('Parâmetros de decisão restaurados ao padrão.'); }}>Restaurar padrão</button>
      </div>

      <Card title="Perfil do investidor">
        <div className="form-grid">
          <Field label="Nome"><input value={s.profile.name} onChange={(e) => set(['profile', 'name'], e.target.value)} /></Field>
          <Field label="Início dos investimentos"><input type="date" value={s.profile.startDate} onChange={(e) => set(['profile', 'startDate'], e.target.value)} /></Field>
          <Field label="Corretora"><input value={s.profile.broker} onChange={(e) => set(['profile', 'broker'], e.target.value)} /></Field>
          <Field label="Perfil de risco"><input value={s.profile.risk} onChange={(e) => set(['profile', 'risk'], e.target.value)} /></Field>
          {n(['profile', 'monthlyContribution'], 'Aporte mensal', 'R$')}
          <Field label="Estratégia" wide><input value={s.profile.strategy} onChange={(e) => set(['profile', 'strategy'], e.target.value)} /></Field>
        </div>
      </Card>

      <div className="grid g2">
        <Card title="Preço-teto (Bazin)">
          <div className="form-grid">
            {n(['defaultDy', 'acao'], 'DY-alvo padrão — ações', '%')}
            {n(['defaultDy', 'fii'], 'DY-alvo padrão — FIIs', '%')}
            <Field label="Cenários de DY" hint="Separados por vírgula" wide>
              <input defaultValue={s.dyScenarios.join(', ')} onBlur={(e) => update((x) => ({ ...x, dyScenarios: e.target.value.split(',').map((v) => Number(v.trim().replace(',', '.'))).filter((v) => v > 0) }))} />
            </Field>
          </div>
        </Card>
        <Card title="Régua de compra" sub="Percentual da cotação em relação ao preço-teto">
          <div className="form-grid">
            {n(['bands', 'wait'], 'Aguardar acima de', '%')}
            {n(['bands', 'maintenance'], 'Manutenção a partir de', '%')}
            {n(['bands', 'opportunity'], 'Oportunidade extrema até', '%')}
          </div>
          {!bandsOk && <div className="note warn" style={{ marginTop: 10 }}>Os limites devem ser decrescentes: aguardar &gt; manutenção &gt; oportunidade extrema.</div>}
        </Card>
      </div>

      <Card title="Pesos do ranking (0–100 pontos)" sub="Sustentabilidade e qualidade devem pesar mais que o DY isolado">
        <div className="form-grid">
          {(Object.keys(CRITERION_LABEL) as Criterion[]).map((k) => (
            <Field key={k} label={CRITERION_LABEL[k]}>
              <NumInput value={s.weights[k]} onChange={(v) => update((x) => ({ ...x, weights: { ...x.weights, [k]: Math.max(0, v ?? 0) } }))} />
            </Field>
          ))}
        </div>
      </Card>

      <div className="grid g2">
        <Card title="Classificação" sub="Limiares de pontuação e dados mínimos">
          <div className="form-grid">
            {n(['scoring', 'maxPriorityScore'], 'Prioridade máxima a partir de', 'pts')}
            {n(['scoring', 'highPriorityScore'], 'Prioridade alta a partir de', 'pts')}
            {n(['scoring', 'monitorScore'], 'Monitoramento a partir de', 'pts')}
            {n(['scoring', 'minCoverage'], 'Cobertura mínima de dados', '%', 'Abaixo disto, no máximo “Monitoramento”')}
            {n(['scoring', 'goodRealRate'], 'Tesouro IPCA+: taxa real atrativa', '%')}
          </div>
        </Card>
        <Card title="Limites de concentração">
          <div className="form-grid">
            {n(['limits', 'maxAssetPct'], 'Máximo por ativo', '%')}
            {n(['limits', 'maxSectorPct'], 'Máximo por setor', '%')}
            {n(['limits', 'maxIssuerPct'], 'Máximo por emissor/grupo', '%')}
            {n(['limits', 'maxFiiSegmentPct'], 'Máximo por segmento (FIIs)', '%')}
            {n(['limits', 'maxInternationalPct'], 'Máximo internacional', '%')}
            {n(['limits', 'maxTopPayerPct'], 'Máximo da renda em 1 pagador', '%')}
          </div>
        </Card>
      </div>

      <Card title="Alertas de revisão da tese" sub="Disparam quando os fundamentos pioram; queda de preço com alerta não é tratada como oportunidade">
        <div className="form-grid">
          {n(['thesisRules', 'roeDropPts'], 'Queda de ROE', 'p.p.')}
          {n(['thesisRules', 'marginDropPts'], 'Queda de margem líquida', 'p.p.')}
          {n(['thesisRules', 'netDebtEbitdaMax'], 'Dív. líq./EBITDA máxima', 'x')}
          {n(['thesisRules', 'payoutMax'], 'Payout máximo', '%')}
          {n(['thesisRules', 'divDropPct'], 'Corte de proventos 12m', '%')}
          {n(['thesisRules', 'vacancyMax'], 'Vacância financeira máx. (FII)', '%')}
          {n(['thesisRules', 'delinquencyMax'], 'Inadimplência máx. (FII)', '%')}
          {n(['thesisRules', 'fiiLeverageMax'], 'Alavancagem máx. (FII)', '%')}
        </div>
      </Card>
      <Disclaimer />
    </div>
  );
}
