import { useEffect, useState, type ReactNode } from 'react';
import { ageDays, dateBR, dateTimeBR } from '../domain/format';
import { parseNum } from '../domain/util';

export function Card({ title, sub, right, children, className = '', id }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card ${className}`} id={id}>
      {(title || right) && (
        <header className="card-h">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <p className="sub">{sub}</p>}
          </div>
          {right && <div className="card-r">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Selo obrigatório de origem do dado: "Fonte · atualizado em dd/mm/aaaa hh:mm". */
export function Seal({ source, at }: { source: string; at?: string | null }) {
  const stale = at ? ageDays(at) > 7 : false;
  return (
    <div className={`seal ${stale ? 'stale' : ''}`} title={stale ? 'dado com mais de 7 dias' : undefined}>
      {source}
      {at ? ` · atualizado em ${dateTimeBR(at)}` : ''}
      {stale ? ' · defasado' : ''}
    </div>
  );
}

export function Stat({ label, value, sub, tone, tag, seal }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'pos' | 'neg' | 'warn' | 'info'; tag?: ReactNode; seal?: { source: string; at?: string | null } }) {
  return (
    <div className={`stat ${tone ? 't-' + tone : ''}`}>
      <div className="stat-l">
        {label} {tag}
      </div>
      <div className="stat-v mono">{value}</div>
      {sub && <div className="stat-s">{sub}</div>}
      {seal && <Seal {...seal} />}
    </div>
  );
}

/** Ícone "por que isso importa": mostra o fundamento (lei, norma ou estudo) ao passar o mouse ou tocar. */
export function Why({ text }: { text: string }) {
  return (
    <details className="why">
      <summary aria-label="Por que isso importa" title={text}>?</summary>
      <div className="why-pop">{text}</div>
    </details>
  );
}

export function Badge({ tone = 'muted', children, title }: { tone?: string; children: ReactNode; title?: string }) {
  return (
    <span className={`badge b-${tone}`} title={title}>
      {children}
    </span>
  );
}

/** Indica a natureza do dado: real (fonte), manual, estimativa, projeção ou ausente. */
export function DataTag({ kind, date, source }: { kind: 'real' | 'manual' | 'estimativa' | 'projecao' | 'ausente'; date?: string | null; source?: string | null }) {
  const label = { real: 'REAL', manual: 'MANUAL', estimativa: 'ESTIMATIVA', projecao: 'PROJEÇÃO', ausente: 'SEM DADO' }[kind];
  const stale = date && ageDays(date) > 7 && kind !== 'estimativa' && kind !== 'projecao';
  const tip = [source, date ? `atualizado em ${dateTimeBR(date)}` : null, stale ? 'dado com mais de 7 dias' : null].filter(Boolean).join(' · ');
  return (
    <span className={`dtag d-${kind} ${stale ? 'stale' : ''}`} title={tip || label}>
      {label}
      {date && <em>{dateBR(date)}</em>}
    </span>
  );
}

/** Número para edição: vírgula decimal, sem separador de milhar e sem notação científica (0,00045667, não 4.5667e-4). */
const numText = (v: number) => v.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 12 });

export function NumInput({ value, onChange, step = 'any', placeholder = '—', suffix, className = '', min, disabled }: { value: number | null | undefined; onChange: (v: number | null) => void; step?: string; placeholder?: string; suffix?: string; className?: string; min?: number; disabled?: boolean }) {
  const [txt, setTxt] = useState(value === null || value === undefined ? '' : numText(value));
  useEffect(() => {
    const cur = parseNum(txt);
    if (cur !== (value ?? null)) setTxt(value === null || value === undefined ? '' : numText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span className={`num-in ${className}`}>
      <input
        inputMode="decimal"
        value={txt}
        placeholder={placeholder}
        step={step}
        min={min}
        disabled={disabled}
        onChange={(e) => {
          setTxt(e.target.value);
          onChange(parseNum(e.target.value));
        }}
      />
      {suffix && <i>{suffix}</i>}
    </span>
  );
}

export function Field({ label, children, hint, wide }: { label: ReactNode; children: ReactNode; hint?: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span className="field-l">{label}</span>
      {children}
      {hint && <span className="field-h">{hint}</span>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <header>
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </header>
        <div className="modal-b">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: ReactNode }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} className={value === t.key ? 'on' : ''} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Meter({ value, max = 100, tone }: { value: number; max?: number; tone?: string }) {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className="meter">
      <span className={`meter-f ${tone ? 'm-' + tone : ''}`} style={{ width: `${w}%` }} />
    </span>
  );
}

export function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const tone = score >= 75 ? 'var(--pos)' : score >= 60 ? 'var(--accent)' : score >= 45 ? 'var(--warn)' : 'var(--neg)';
  return (
    <svg width={size} height={size} className="ring" aria-label={`Pontuação ${score}`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth="4" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth="4" fill="none" strokeDasharray={`${(score / 100) * c} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="mono" fontSize={size * 0.3} fill="var(--text)">
        {score}
      </text>
    </svg>
  );
}

export function AlertList({ alerts }: { alerts: { level: string; message: string }[] }) {
  if (!alerts.length) return null;
  return (
    <ul className="alerts">
      {alerts.map((a, i) => (
        <li key={i} className={`al-${a.level}`}>
          <span className="al-dot" />
          {a.message}
        </li>
      ))}
    </ul>
  );
}

export function Disclaimer({ children }: { children?: ReactNode }) {
  return <p className="disclaimer">{children || 'Ferramenta de apoio à decisão. Não é recomendação de investimento e não executa operações. Projeções e estimativas não são garantia de retorno.'}</p>;
}
