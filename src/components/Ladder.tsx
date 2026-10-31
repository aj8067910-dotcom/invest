import type { BazinResult, BandKey } from '../domain/calc/bazin';
import { BAND_INFO, BAND_ORDER } from '../domain/calc/bazin';
import type { Bands } from '../domain/types';
import { brl, num, pct } from '../domain/format';

/**
 * Régua de compra em escada: cada degrau é uma faixa de preço relativa ao preço-teto.
 * Conforme a cotação cai, o marcador desce os degraus da esquerda para a direita.
 */
export function Ladder({ r, bands, compact }: { r: BazinResult; bands: Bands; compact?: boolean }) {
  if (!r.ceiling) return <div className="empty sm">{r.reason || 'Preço-teto indisponível.'}</div>;
  const ranges: Record<BandKey, [number, number]> = {
    aguardar: [Math.max(120, (r.ratio ?? 0) + 5), bands.wait],
    manutencao: [bands.wait, bands.maintenance],
    oportunidade: [bands.maintenance, bands.opportunity],
    extrema: [bands.opportunity, Math.min(40, (r.ratio ?? 100) - 5)],
  };
  const pctLabels = [`> ${bands.wait}%`, `${bands.maintenance}–${bands.wait}%`, `${bands.opportunity}–${bands.maintenance}%`, `≤ ${bands.opportunity}%`];
  const activeIdx = r.band ? BAND_ORDER.indexOf(r.band) : -1;
  return (
    <div className={`ladder ${compact ? 'compact' : ''}`}>
      <div className="ladder-steps">
        {BAND_ORDER.map((k, i) => {
          const [hi, lo] = ranges[k];
          const lvl = r.levels[i];
          const upper = i === 0 ? null : lvl.upperPrice;
          const lower = i < 3 ? r.levels[i + 1].upperPrice : null;
          const here = activeIdx === i && r.ratio !== null;
          const pos = here ? Math.max(4, Math.min(96, ((hi - r.ratio!) / (hi - lo)) * 100)) : 0;
          return (
            <div key={k} className={`step s-${BAND_INFO[k].tone} ${i <= activeIdx ? 'lit' : ''} ${here ? 'here' : ''}`} style={{ ['--h' as any]: `${40 + i * 20}%` }}>
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
                <span className="mono rng">
                  {i === 0 ? `> ${brl(r.levels[1].upperPrice)}` : i === 3 ? `≤ ${brl(upper)}` : `${brl(lower)} – ${brl(upper)}`}
                </span>
                <span className="mono pctl">{pctLabels[i]}</span>
              </div>
            </div>
          );
        })}
      </div>
      {!compact && (
        <div className="ladder-foot">
          <span>
            Preço-teto <b className="mono">{brl(r.ceiling)}</b> · cotação em <b className="mono">{pct(r.ratio, 1)}</b> do teto
          </span>
          {r.nextBand ? (
            <span>
              Próxima faixa (<b>{BAND_INFO[r.nextBand.key].label}</b>): faltam <b className="mono neg">{brl(r.nextBand.distanceAbs)}</b> ({num(r.nextBand.distancePct, 1)}%) — abaixo de {brl(r.nextBand.upperPrice)}
            </span>
          ) : r.band === 'extrema' ? (
            <span className="warn-t">Faixa mais baixa atingida: revisar fundamentos antes de qualquer compra.</span>
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
        <i key={k} className={`${i <= idx ? 'lit s-' + BAND_INFO[k].tone : ''}`} style={{ height: `${10 + i * 4}px` }} />
      ))}
    </span>
  );
}
