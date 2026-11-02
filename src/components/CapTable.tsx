import { useDerived } from '../store/derived';
import { useStore } from '../store/store';
import { capOf, roomToCap } from '../domain/calc/concentration';
import { isHeld } from '../domain/calc/positions';
import { brl, pct } from '../domain/format';
import { Card, NumInput } from './ui';
import { AssetLink, ClassBadge } from './common';

/** Teto de participação de cada ativo na carteira (ex.: BBSE3 no máximo 8%). */
export function CapTable() {
  const d = useDerived();
  const updateAsset = useStore((s) => s.updateAsset);
  const total = d.totals.marketValue || 0;
  const rows = d.assets
    .filter((a) => !a.isReserve)
    .map((a) => {
      const p = d.positions[a.id];
      const value = isHeld(p) ? p.marketValue : 0;
      const cap = capOf(a, d.settings);
      const free = !cap.own && (a.class === 'etf' || a.class === 'tesouro'); // veículos diversificados: regidos pela alocação da classe
      return { a, value, weight: total ? (value / total) * 100 : 0, cap, free, room: !total ? null : free ? Infinity : roomToCap(cap.pct, value, total) };
    })
    .sort((x, y) => (y.a.status === 'carteira' ? 1 : 0) - (x.a.status === 'carteira' ? 1 : 0) || y.weight - x.weight);
  const own = rows.filter((r) => r.a.status === 'carteira' && r.cap.own).reduce((s, r) => s + r.cap.pct, 0);
  return (
    <Card
      title="Teto por ativo"
      sub={`Participação máxima de cada ativo na carteira. Vazio = máximo geral por ativo (${d.settings.limits.maxAssetPct}%); ETFs e Tesouro sem teto próprio seguem só a alocação da classe. Ao atingir o teto, o ativo vai para “Aguardar” e a Central de aportes não sugere mais compra dele. A decisão continua sua.`}
    >
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Ativo</th><th className="num">Peso atual</th><th className="num" style={{ width: 130 }}>Teto</th><th className="num">Cabe até o teto</th><th>Situação</th></tr>
          </thead>
          <tbody>
            {rows.map(({ a, weight, cap, free, room }) => (
              <tr key={a.id}>
                <td><AssetLink a={a} /> <ClassBadge c={a.class} />{a.status === 'watchlist' && <span className="dim" style={{ fontSize: 11 }}> watchlist</span>}</td>
                <td className="num">{weight ? pct(weight) : '—'}</td>
                <td className="num">
                  <NumInput value={a.maxWeight ?? null} suffix="%" onChange={(v) => updateAsset(a.id, { maxWeight: v && v > 0 ? Math.min(100, v) : null })} />
                  {!cap.own && <div className="dim" style={{ fontSize: 11 }}>{free ? 'pela alocação da classe' : `geral ${pct(cap.pct, 0)}`}</div>}
                </td>
                <td className="num">{room === null ? '—' : room === Infinity ? 'pela alocação' : brl(room)}</td>
                <td>{free ? <span className="dim">—</span> : weight >= cap.pct ? <span className="neg">▲ no teto</span> : weight >= cap.pct * 0.9 ? <span className="warn-t">perto do teto</span> : <span className="dim">abaixo do teto</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        “Cabe até o teto” = quanto ainda pode ser aplicado no ativo, já contando que o aporte aumenta o patrimônio. Soma dos tetos definidos na carteira: {pct(own, 0)}
        {own > 0 && own < 100 ? ' (abaixo de 100%: os demais ativos usam o teto geral).' : '.'} Base: diversificação reduz o risco específico de cada empresa (Markowitz, 1952).
      </p>
    </Card>
  );
}
