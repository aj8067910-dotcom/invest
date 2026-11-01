import type { BazinResult } from '../domain/calc/bazin';
import { BAND_INFO, BAND_ORDER } from '../domain/calc/bazin';
import type { Bands } from '../domain/types';
import { brl, num, pct } from '../domain/format';

/**
 * Régua de compra em escada, por margem de segurança = (Teto − Preço) ÷ Teto.
 * Degraus: Aguardar (margem < 0) → Manutenção (0 a margem exigida) → Oportunidade (≥ margem exigida).
 */
export function Ladder({ r, bands, compact }: { r: BazinResult; bands: Bands; compact?: boolean }) {
  if (!r.ceiling) return <div className="empty sm">{r.reason || 'Preço-teto indisponível.'}</div>;
  // faixas em margem (%): Aguardar [-30, 0), Manutenção [0, m), Oportunidade [m, m + 25]
  const ranges = { aguardar: [-30, 0], manutencao: [0, bands.margin], oportunidade: [bands.margin, bands.margin + 25] } as const;
  const labels = [`margem < 0%`, `0% a ${num(bands.margin, 0)}%`, `≥ ${num(bands.margin, 0)}%`];
  const activeIdx = r.band ? BAND_ORDER.indexOf(r.band) : -1;
  return (
    <div className={`ladder ${compact ? 'compact' : ''}`}>
      <div className="ladder-steps three">
        {BAND_ORDER.map((k, i) => {
          const [lo, hi] = ranges[k];
          const here = activeIdx === i && r.margin !== null;
          const pos = here ? Math.max(4, Math.min(96, ((r.margin! - lo) / (hi - lo)) * 100)) : 0;
          const priceRange = i === 0 ? `> ${brl(r.ceiling)}` : i === 1 ? `${brl(r.opportunityPrice)} – ${brl(r.ceiling)}` : `≤ ${brl(r.opportunityPrice)}`;
          return (
            <div key={k} className={`step s-${BAND_INFO[k].tone} ${i <= activeIdx ? 'lit' : ''} ${here ? 'here' : ''}`} style={{ ['--h' as any]: `${45 + i * 27}%` }}>
              <div className="step-bar">
                {here && (
                  <div className="marker" style={{ left: `${pos}%` }}>
                    <span className="mono">{brl(r.price)}</span>
                  </div>
                )}
              </div>
              <div className="step-info">
                <b>{BAND_INFO[k].label}</b>
                {!compact && <span className="dec">{BAND_INFO[k].decision}</span>}
                <span className="mono rng">{priceRange}</span>
                <span className="mono pctl">{labels[i]}</span>
              </div>
            </div>
          );
        })}
      </div>
      {!compact && (
        <div className="ladder-foot">
          <span>
            Teto <b className="mono">{brl(r.ceiling)}</b> · oportunidade <b className="mono">{brl(r.opportunityPrice)}</b> · margem atual{' '}
            <b className={`mono ${r.margin !== null && r.margin < 0 ? 'neg' : 'pos'}`}>{r.margin === null ? '—' : `${r.margin >= 0 ? '+' : ''}${pct(r.margin, 1)}`}</b>
          </span>
          {r.nextBand ? (
            <span>
              Próxima faixa (<b>{BAND_INFO[r.nextBand.key].label}</b>): faltam <b className="mono neg">−{brl(r.nextBand.distanceAbs)}</b> ({num(r.nextBand.distancePct, 1)}%) — abaixo de {brl(r.nextBand.upperPrice)}
            </span>
          ) : r.band === 'oportunidade' ? (
            <span className="warn-t">Margem exigida atingida: a classificação final depende do filtro de qualidade.</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function MiniLadder({ r }: { r: BazinResult }) {
  const idx = r.band ? BAND_ORDER.indexOf(r.band) : -1;
  return (
    <span className="mini-ladder" title={r.band ? BAND_INFO[r.band].label : 'Sem faixa'}>
      {BAND_ORDER.map((k, i) => (
        <i key={k} className={`${i <= idx ? 'lit s-' + BAND_INFO[k].tone : ''}`} style={{ height: `${10 + i * 6}px` }} />
      ))}
    </span>
  );
}
