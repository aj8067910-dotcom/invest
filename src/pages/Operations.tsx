import { useSearchParams } from 'react-router-dom';
import { useDerived } from '../store/derived';
import { Card, Disclaimer, Stat, Tabs } from '../components/ui';
import { brl } from '../domain/format';
import { INCOME_TX } from '../domain/types';
import { OpsSheet } from './ops/OpsSheet';
import { EntryForm } from './ops/EntryForm';
import { ImportWizard } from './ops/ImportWizard';
import { AssetLedger, AuditPanel, ContributionsPanel, ImportsPanel, ReviewPanel } from './ops/Panels';

type Tab = 'planilha' | 'lancar' | 'importar' | 'ativo' | 'aportes' | 'revisao' | 'importacoes' | 'auditoria';

export default function Operations() {
  const d = useDerived();
  const [params, setParams] = useSearchParams();
  // aba e ativo vivem no endereço: links diretos e o botão voltar funcionam
  const assetId = params.get('ativo');
  const tab = (params.get('aba') as Tab) || (assetId ? 'ativo' : 'planilha');
  const setTab = (t: Tab) => setParams(t === 'ativo' && assetId ? { aba: t, ativo: assetId } : { aba: t });
  const setAssetId = (id: string) => setParams({ aba: 'ativo', ativo: id });
  const openAsset = (id: string) => setAssetId(id);
  const reviewCount = d.assets.reduce((s, a) => s + d.positions[a.id].reviews.length + d.positions[a.id].divergences.length, 0);
  const preset = assetId ? d.assets.find((a) => a.id === assetId) : null;
  const income = d.transactions.filter((t) => INCOME_TX.includes(t.type)).reduce((s, t) => s + t.amount, 0);

  return (
    <div className="stack">
      <div className="page-h">
        <div>
          <div className="kicker">Registro</div>
          <h1>Central de Operações</h1>
          <p>Um único livro de operações alimenta carteira, preço médio, proventos, aportes, alocação, ranking e projeção. Importe o histórico uma vez e faça os novos lançamentos aqui.</p>
        </div>
      </div>
      <div className="grid g6">
        <Stat label="Operações registradas" value={String(d.transactions.length)} />
        <Stat label="Aportes externos" value={brl(d.totals.deposits)} tone="info" />
        <Stat label="Proventos recebidos" value={brl(income)} tone="pos" />
        <Stat label="Custo investido" value={brl(d.totals.costBasis)} />
        <Stat label="Resultado realizado" value={brl(d.totals.realized)} tone={d.totals.realized >= 0 ? 'pos' : 'neg'} />
        <Stat label="Para revisar" value={String(reviewCount)} tone={reviewCount ? 'warn' : undefined} />
      </div>
      <Tabs
        tabs={[
          { key: 'planilha', label: 'Planilha' },
          { key: 'lancar', label: 'Novo lançamento' },
          { key: 'importar', label: 'Importar' },
          { key: 'ativo', label: 'Histórico por ativo' },
          { key: 'aportes', label: 'Aportes' },
          { key: 'revisao', label: `Revisão${reviewCount ? ` (${reviewCount})` : ''}` },
          { key: 'importacoes', label: 'Importações' },
          { key: 'auditoria', label: 'Auditoria' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'planilha' && <OpsSheet onOpenAsset={openAsset} />}
      {tab === 'lancar' && (
        <Card title="Novo lançamento" sub="Mesmas regras de validação e processamento da importação. A carteira é atualizada ao confirmar.">
          <EntryForm preset={preset} />
        </Card>
      )}
      {tab === 'importar' && <ImportWizard />}
      {tab === 'ativo' && <AssetLedger assetId={assetId} onSelect={setAssetId} />}
      {tab === 'aportes' && <ContributionsPanel />}
      {tab === 'revisao' && <ReviewPanel onOpenAsset={openAsset} />}
      {tab === 'importacoes' && <ImportsPanel />}
      {tab === 'auditoria' && <AuditPanel />}
      <Disclaimer>A plataforma registra e calcula; não executa ordens na corretora.</Disclaimer>
    </div>
  );
}
