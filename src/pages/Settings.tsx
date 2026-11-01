import { useStore } from '../store/store';
import { Card, Disclaimer, Field, NumInput } from '../components/ui';
import { defaultSettings } from '../domain/seed';
import { CRITERION_LABEL, DPA_REF_LABEL, type Criterion, type DpaRef, type Settings } from '../domain/types';
import { toast } from '../components/toast';

type Path<K extends keyof Settings> = [K, keyof Settings[K]];

export default function SettingsPage() {
  const s = useStore((x) => x.settings);
  const update = useStore((x) => x.updateSettings);
  const set = <K extends keyof Settings>([k, f]: Path<K>, v: unknown) => update((x) => ({ ...x, [k]: { ...(x[k] as object), [f]: v } }));
  const dpaSel = (k: 'acao' | 'fii' | 'commodity') => (
    <select value={s.dpa[k]} onChange={(e) => set(['dpa', k], e.target.value)}>
      {(Object.keys(DPA_REF_LABEL) as DpaRef[]).map((r) => <option key={r} value={r}>{DPA_REF_LABEL[r]}</option>)}
    </select>
  );
  const n = <K extends keyof Settings>(p: Path<K>, label: string, suffix?: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <NumInput value={(s[p[0]] as any)[p[1]]} suffix={suffix} onChange={(v) => set(p, v ?? 0)} />
    </Field>
  );

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

      <Card title="Aparência">
        <div className="seg">
          {(['sistema', 'claro', 'escuro'] as const).map((t) => (
            <button key={t} className={s.theme === t ? 'on' : ''} onClick={() => update((x) => ({ ...x, theme: t }))}>{t === 'sistema' ? 'Seguir o sistema' : t === 'claro' ? 'Claro' : 'Escuro'}</button>
          ))}
        </div>
      </Card>

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
            <Field label="DY original de Bazin (referência)"><NumInput value={s.bazinDy} suffix="%" onChange={(v) => update((x) => ({ ...x, bazinDy: v ?? 6 }))} /></Field>
            <Field label="DPA de referência — ações">{dpaSel('acao')}</Field>
            <Field label="DPA de referência — FIIs">{dpaSel('fii')}</Field>
            <Field label="DPA de referência — commodities">{dpaSel('commodity')}</Field>
            <Field label="Cenários de DY" hint="Separados por vírgula" wide>
              <input defaultValue={s.dyScenarios.join(', ')} onBlur={(e) => update((x) => ({ ...x, dyScenarios: e.target.value.split(',').map((v) => Number(v.trim().replace(',', '.'))).filter((v) => v > 0) }))} />
            </Field>
          </div>
        </Card>
        <Card title="Régua de compra (margem de segurança)" sub="Margem = (Teto − Preço) ÷ Teto. Aguardar abaixo de 0%; Manutenção entre 0% e a margem exigida; Oportunidade a partir dela (com filtro de qualidade).">
          <div className="form-grid">
            {n(['bands', 'margin'], 'Margem exigida para Oportunidade', '%', 'Também define o preço de oportunidade = Teto × (1 − margem)')}
          </div>
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
            <Field label="Banda de tolerância da alocação"><NumInput value={s.allocationBand} suffix="p.p." onChange={(v) => update((x) => ({ ...x, allocationBand: Math.max(0, v ?? 5) }))} /></Field>
          </div>
        </Card>
      </div>

      <Card title="Regras tributárias" sub="Valores da sua especificação, com a base legal. Editáveis; confirme com um contador.">
        <div className="form-grid">
          {n(['tax', 'jcpRate'], 'IRRF sobre JCP', '%', 'LC 224/2025 (17,5% desde 01/01/2026)')}
          {n(['tax', 'dividendMonthlyExempt'], 'Dividendos isentos até (por empresa/mês)', 'R$', 'Lei 15.270/2025')}
          {n(['tax', 'dividendRateAbove'], 'Retenção acima do limite (sobre o total do mês)', '%', 'Lei 15.270/2025')}
          <Field label="Rendimento de FII isento por padrão" hint="Lei 14.754/2023: ≥ 100 cotistas, cotas em bolsa, participação < 10%">
            <label className="chk" style={{ padding: '7px 0' }}><input type="checkbox" checked={s.tax.fiiExemptDefault} onChange={(e) => set(['tax', 'fiiExemptDefault'], e.target.checked)} /> isento</label>
          </Field>
          {n(['tax', 'fiiRateIfNotExempt'], 'IR do FII sem isenção', '%')}
          {n(['tax', 'stockSwingRate'], 'Ganho de capital — ações', '%', 'Lei 11.033/2004')}
          {n(['tax', 'stockSwingMonthlyExempt'], 'Isenção ações (vendas no mês até)', 'R$')}
          {n(['tax', 'dayTradeRate'], 'Ganho de capital — day trade', '%')}
          {n(['tax', 'fiiGainRate'], 'Ganho de capital — FII', '%')}
          {n(['tax', 'etfGainRate'], 'Ganho de capital — ETF (sem isenção)', '%', 'confirmar com contador')}
          {n(['tax', 'cryptoGainRate'], 'Ganho de capital — cripto', '%')}
          {n(['tax', 'cryptoMonthlyExempt'], 'Isenção cripto (vendas no mês até)', 'R$')}
        </div>
      </Card>

      <Card title="Análise 360° — limites (verde / amarelo / vermelho)" sub="Padrões editáveis; o fundamento de cada limite aparece no ícone “?” de cada indicador.">
        <div className="form-grid">
          {n(['limits360', 'roeMin'], 'ROE mínimo (amarelo abaixo)', '%')}
          {n(['limits360', 'netDebtEbitdaYellow'], 'Dív. Líq./EBITDA — amarelo acima', 'x')}
          {n(['limits360', 'netDebtEbitdaRed'], 'Dív. Líq./EBITDA — vermelho acima', 'x')}
          {n(['limits360', 'utilityNetDebtEbitdaYellow'], 'Elétricas/saneamento — amarelo acima', 'x')}
          {n(['limits360', 'utilityNetDebtEbitdaRed'], 'Elétricas/saneamento — vermelho acima', 'x')}
          {n(['limits360', 'interestCoverageYellow'], 'Cobertura de juros — amarelo abaixo', 'x')}
          {n(['limits360', 'interestCoverageRed'], 'Cobertura de juros — vermelho abaixo', 'x')}
          {n(['limits360', 'shortTermDebtPct'], 'Dívida vencendo em 12 meses — amarelo acima', '%')}
          {n(['limits360', 'payoutYellow'], 'Payout — amarelo acima', '%')}
          {n(['limits360', 'payoutRed'], 'Payout — vermelho acima', '%')}
          {n(['limits360', 'fcfCoverageYellow'], 'Cobertura FCL ÷ proventos — amarelo abaixo', 'x')}
          {n(['limits360', 'dyTrapRatio'], 'Armadilha de DY: DY atual ÷ DY 5a acima de', 'x')}
          {n(['limits360', 'fScoreMin'], 'F-Score mínimo (filtro de qualidade)', 'pts')}
          {n(['limits360', 'altmanSafe'], 'Altman Z″ — zona segura acima de', '')}
          {n(['limits360', 'altmanGrey'], 'Altman Z″ — alerta abaixo de', '')}
          {n(['limits360', 'minDailyLiquidity'], 'Liquidez mínima diária', 'R$ mil')}
          {n(['limits360', 'fiiVacancyYellow'], 'FII vacância — amarelo acima', '%')}
          {n(['limits360', 'fiiVacancyRed'], 'FII vacância — vermelho acima', '%')}
          {n(['limits360', 'fiiDebtorConcentration'], 'FII papel: concentração por devedor — amarelo acima', '%')}
          {n(['limits360', 'fiiMinHolders'], 'FII: alerta de cotistas abaixo de', '')}
          {n(['limits360', 'fiiOverDistributionMonths'], 'FII: meses distribuindo acima do resultado', '')}
          {n(['limits360', 'staleDays'], 'Dado defasado após', 'dias')}
          <Field label="Setores de commodities (DPA de ciclo)" wide>
            <input defaultValue={s.limits360.commoditySectors.join(', ')} onBlur={(e) => set(['limits360', 'commoditySectors'], e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
          </Field>
          <Field label="Setores regulados (limite de alavancagem próprio)" wide>
            <input defaultValue={s.limits360.utilitySectors.join(', ')} onBlur={(e) => set(['limits360', 'utilitySectors'], e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
          </Field>
        </div>
      </Card>

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
