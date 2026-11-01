import { useEffect, useState } from 'react';
import { Badge, Card } from './ui';
import { fetchMarketFile, type MarketFile } from '../services/marketdata';
import { useStore } from '../store/store';
import { dateTimeBR } from '../domain/format';

/** Mostra quando o robô coletou os dados e quais ativos ficam fora dele. */
export function RobotCard() {
  const assets = useStore((s) => s.assets);
  const [m, setM] = useState<MarketFile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetchMarketFile().then(setM, (e) => setErr(e.message));
  }, []);
  const covered = m ? new Set([...Object.keys(m.quotes), ...Object.keys(m.tesouro)]) : new Set<string>();
  const outside = m ? assets.filter((a) => !covered.has(a.ticker.toUpperCase())) : [];
  const ageH = m ? (Date.now() - new Date(m.generatedAt).getTime()) / 3600000 : null;
  return (
    <Card
      title="Robô de dados de mercado"
      sub="Coleta cotações, proventos, Tesouro Direto e indicadores do Banco Central no servidor do GitHub (sem token) e publica junto com o site. Ao abrir o Radar os dados são aplicados automaticamente."
      right={m ? <Badge tone={ageH! < 30 ? 'good' : 'warn'}>{ageH! < 30 ? 'Em dia' : 'Desatualizado'}</Badge> : <Badge tone={err ? 'bad' : 'muted'}>{err ? 'Indisponível' : 'Carregando'}</Badge>}
    >
      {m ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 18 }}>
            <span>Última coleta: <b className="mono">{dateTimeBR(m.generatedAt)}</b></span>
            <span>Cotações: <b className="mono">{Object.keys(m.quotes).length}</b></span>
            <span>Tesouro: <b className="mono">{Object.keys(m.tesouro).length}</b></span>
            <span>Indicadores: <b className="mono">{Object.keys(m.macro).length}</b></span>
          </div>
          {m.errors.length > 0 && <div className="note warn">Falhas na última coleta: {m.errors.join('; ')}</div>}
          {outside.length > 0 ? (
            <div className="note">
              Fora do robô: <b className="mono">{outside.map((a) => a.ticker).join(', ')}</b>. Para incluí-los, adicione o ticker em <span className="mono">market/tickers.json</span> no repositório (ou peça ao Claude). Até lá, use o token da brapi ou a cotação manual.
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Todos os seus ativos estão cobertos pelo robô.</p>
          )}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>{err || 'Carregando…'}</p>
      )}
    </Card>
  );
}
