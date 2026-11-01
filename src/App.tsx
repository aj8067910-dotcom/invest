import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from './store/store';
import { useDerived } from './store/derived';
import { Icon, RadarLogo } from './components/icons';
import { Toast, toast } from './components/toast';
import { ConflictModal } from './components/CloudCard';
import { dateBR, num } from './domain/format';
import { todayISO } from './domain/util';
import { syncMacro, syncQuotes } from './services/sync';
import { startAutoSync, useCloud } from './services/cloudsync';
import { applyMarketData } from './services/marketdata';
import Dashboard from './pages/Dashboard';
import Assets from './pages/Assets';
import AssetDetail from './pages/AssetDetail';
import Ceiling from './pages/Ceiling';
import Ranking from './pages/Ranking';
import Contribution from './pages/Contribution';
import Dividends from './pages/Dividends';
import Allocation from './pages/Allocation';
import Concentration from './pages/Concentration';
import Projection from './pages/Projection';
import Operations from './pages/Operations';
import DataSources from './pages/DataSources';
import SettingsPage from './pages/Settings';

const NAV: { sec: string; items: { to: string; label: string; icon: string }[] }[] = [
  { sec: 'Visão', items: [{ to: '/', label: 'Painel', icon: 'painel' }, { to: '/carteira', label: 'Carteira & Watchlist', icon: 'carteira' }] },
  {
    sec: 'Decisão',
    items: [
      { to: '/preco-teto', label: 'Preço-teto & Régua', icon: 'teto' },
      { to: '/ranking', label: 'Ranking de aportes', icon: 'ranking' },
      { to: '/aportes', label: 'Central de aportes', icon: 'aportes' },
    ],
  },
  {
    sec: 'Análise',
    items: [
      { to: '/dividendos', label: 'Dividendos', icon: 'dividendos' },
      { to: '/alocacao', label: 'Alocação', icon: 'alocacao' },
      { to: '/concentracao', label: 'Concentração', icon: 'concentracao' },
      { to: '/projecao', label: 'Projeção', icon: 'projecao' },
    ],
  },
  {
    sec: 'Registro',
    items: [
      { to: '/operacoes', label: 'Central de Operações', icon: 'historico' },
      { to: '/dados', label: 'Dados & integrações', icon: 'dados' },
      { to: '/config', label: 'Parâmetros', icon: 'config' },
    ],
  },
];

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const macro = useStore((s) => s.macro);
  const recordSnapshot = useStore((s) => s.recordSnapshot);
  const d = useDerived();
  const [open, setOpen] = useState(false);
  const noQuote = d.assets.filter((a) => a.quote.price === null).length;
  const [busy, setBusy] = useState<string | null>(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);

  // sincronização em nuvem: só depois de carregar os dados locais
  // ao abrir: primeiro traz os dados da nuvem, depois aplica as cotações e proventos do robô diário
  useEffect(() => {
    if (!hydrated) return;
    startAutoSync().then(() => applyMarketData());
  }, [hydrated]);
  const cloud = useCloud();

  // registra a evolução patrimonial diária (base do gráfico de evolução desde dez/2025)
  useEffect(() => {
    if (!hydrated || d.totals.marketValue <= 0) return;
    recordSnapshot({ date: todayISO(), value: Number(d.totals.marketValue.toFixed(2)), invested: Number(d.totals.costBasis.toFixed(2)) });
  }, [hydrated, d.totals.marketValue, d.totals.costBasis, recordSnapshot]);

  const sync = async () => {
    setBusy('Atualizando…');
    try {
      const [q] = await Promise.all([syncQuotes({ onProgress: setBusy }), syncMacro()]);
      const parts = [`${q.ok.length} ativos atualizados`];
      if (q.robot?.generatedAt) parts.push(`dados do robô de ${new Date(q.robot.generatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`);
      if (q.needToken.length) parts.push(`${q.needToken.length} fora do robô precisam do token da brapi (${q.needToken.slice(0, 5).join(', ')}${q.needToken.length > 5 ? '…' : ''})`);
      if (q.failed.length) parts.push(`${q.failed.length} falharam — veja Dados & integrações`);
      toast(parts.join(' · ') + '.', q.ok.length === 0);
    } catch (e: any) {
      toast('Falha na atualização: ' + (e?.message || e), true);
    } finally {
      setBusy(null);
    }
  };

  if (!hydrated)
    return (
      <div className="empty" style={{ margin: 40 }}>
        Carregando dados locais…
      </div>
    );

  return (
    <div className="app">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand">
          <RadarLogo />
          <div className="brand-t">
            RADAR
            <small>de investimentos · renda passiva</small>
          </div>
        </div>
        {NAV.map((g) => (
          <div key={g.sec}>
            <div className="nav-sec">{g.sec}</div>
            {g.items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
                <Icon name={i.icon} /> {i.label}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="side-foot">
          Desde {dateBR(d.settings.profile.startDate)} · {d.settings.profile.broker}
          <br />
          {cloud.status === 'off' ? 'Dados só neste aparelho. Ative a nuvem em Dados & integrações.' : 'Dados sincronizados na nuvem (criptografados).'}
        </div>
      </aside>
      <div className="main">
        <div className="top">
          <button className="btn ghost sm burger" onClick={() => setOpen(true)} aria-label="Menu">
            <Icon name="menu" />
          </button>
          <div className="tape">
            {macro.map((m) => (
              <span key={m.key} className="tape-i" title={`${m.source}${m.date ? ' · ' + dateBR(m.date) : ''}`}>
                {m.label}
                <b>{m.value === null ? 'sem dado' : m.key === 'usd' ? 'R$ ' + num(m.value, 4) : num(m.value, 2) + '%'}</b>
                {m.date && <em>{dateBR(m.date)}</em>}
              </span>
            ))}
            <span className="tape-i">
              Sem cotação<b className={noQuote ? 'warn-t' : ''}>{noQuote}/{d.assets.length}</b>
            </span>
          </div>
          <NavLink to="/dados" className={`cloud c-${cloud.status}`} title={cloud.message || 'Sincronização em nuvem desativada'}>
            <span className="cloud-dot" />
            {{ off: 'Só neste aparelho', syncing: 'Sincronizando…', ok: 'Nuvem ok', error: 'Erro na nuvem', conflict: 'Escolha a versão' }[cloud.status]}
          </NavLink>
          <button className="btn sm primary" onClick={sync} disabled={!!busy} title="Atualiza cotações (brapi.dev, CoinGecko), proventos e indicadores do Banco Central">
            <Icon name="sync" /> {busy || 'Atualizar dados'}
          </button>
        </div>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/carteira" element={<Assets />} />
            <Route path="/ativo/:id" element={<AssetDetail />} />
            <Route path="/preco-teto" element={<Ceiling />} />
            <Route path="/ranking" element={<Ranking />} />
            <Route path="/aportes" element={<Contribution />} />
            <Route path="/dividendos" element={<Dividends />} />
            <Route path="/alocacao" element={<Allocation />} />
            <Route path="/concentracao" element={<Concentration />} />
            <Route path="/projecao" element={<Projection />} />
            <Route path="/operacoes" element={<Operations />} />
            <Route path="/historico" element={<Operations />} />
            <Route path="/dados" element={<DataSources />} />
            <Route path="/config" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
      <ConflictModal />
      <Toast />
    </div>
  );
}
