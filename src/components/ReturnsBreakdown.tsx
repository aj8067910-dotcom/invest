import { useMemo, useState } from 'react';
import { useDerived } from '../store/derived';
import { Card, Empty } from './ui';
import { brl, pct, signedPct } from '../domain/format';
import { breakdown, LEVEL_LABEL, type Level } from '../domain/calc/breakdown';

const LEVELS: Level[] = ['carteira', 'classe', 'setor', 'segmento', 'ativo'];

/** Rendimento da carteira, por classe, setor, segmento e ativo. */
export function ReturnsBreakdown({ highlight }: { highlight?: string[] }) {
  const d = useDerived();
  const [level, setLevel] = useState<Level>('classe');
  const rows = useMemo(() => breakdown(level, d.assets, d.positions, d.yoc, d.market), [level, d.assets, d.positions, d.yoc, d.market]);
  const hl = new Set(highlight || []);
  const tone = (v: number | null) => (v === null ? '' : v >= 0 ? 'pos' : 'neg');
  return (
    <Card
      title="Rendimento da carteira"
      sub="Retorno total = valorização a mercado + resultado de vendas + proventos recebidos, sobre o total comprado. Setor e segmento das ações pela classificação oficial da B3; FIIs pelo segmento de atuação."
      right={
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {LEVELS.map((l) => <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>{LEVEL_LABEL[l]}</button>)}
        </div>
      }
    >
      {rows.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{LEVEL_LABEL[level]}</th><th className="num">Peso</th><th className="num">Custo</th><th className="num">Valor atual</th><th className="num">Valorização</th>
                <th className="num">Proventos recebidos</th><th className="num">Retorno total</th><th className="num">Proventos 12m</th><th className="num">DY mercado</th><th className="num">YoC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const on = r.tickers.some((t) => hl.has(t));
                return (
                  <tr key={r.key} style={on ? { background: 'var(--bg2)' } : undefined}>
                    <td>
                      <b>{r.key}</b>{on && <span className="badge b-info" style={{ marginLeft: 6 }}>no aporte</span>}
                      {level !== 'ativo' && level !== 'carteira' && <div className="dim" style={{ fontSize: 11 }}>{r.tickers.join(', ')}</div>}
                    </td>
                    <td className="num">{pct(r.weight, 1)}</td>
                    <td className="num">{brl(r.cost)}</td>
                    <td className="num">{brl(r.marketValue)}</td>
                    <td className={`num ${tone(r.appreciationPct)}`}>{signedPct(r.appreciationPct)}<div className="dim" style={{ fontSize: 11 }}>{brl(r.appreciation)}</div></td>
                    <td className="num pos">{brl(r.income)}</td>
                    <td className={`num ${tone(r.totalReturnPct)}`}><b>{signedPct(r.totalReturnPct)}</b><div className="dim" style={{ fontSize: 11 }}>{brl(r.totalReturn)}</div></td>
                    <td className="num">{brl(r.income12m)}</td>
                    <td className="num">{pct(r.dyMarket, 2)}</td>
                    <td className="num">{pct(r.yoc, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Lance compras na Central de Operações para ver o rendimento.</Empty>
      )}
    </Card>
  );
}
