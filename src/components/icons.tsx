const P: Record<string, string> = {
  painel: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  carteira: 'M21 7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16V7M17 14h.01',
  teto: 'M3 20h18M5 20V10l7-6 7 6v10M9 20v-6h6v6',
  ranking: 'M8 21V11M16 21V3M12 21v-6M4 21v-3M20 21v-8',
  aportes: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  dividendos: 'M3 3v18h18M7 15l4-4 3 3 6-6',
  alocacao: 'M21.2 15.9A10 10 0 1 1 8 2.8M22 12A10 10 0 0 0 12 2v10z',
  concentracao: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  projecao: 'M3 17l6-6 4 4 8-8M14 7h7v7',
  historico: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2',
  dados: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  config: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  sync: 'M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5',
};
export function Icon({ name, className = 'ico' }: { name: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name]} />
    </svg>
  );
}
export function RadarLogo() {
  return (
    <svg className="radar-ico" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="none" stroke="#1f3a63" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="#1f3a63" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="4" fill="none" stroke="#2a4f85" strokeWidth="1.2" />
      <g className="sweep">
        <path d="M16 16 L16 2 A14 14 0 0 1 28.1 9 Z" fill="url(#sw)" />
      </g>
      <circle cx="22" cy="10" r="1.6" fill="#19e3a1" />
      <circle cx="10" cy="20" r="1.2" fill="#38c6f4" />
      <defs>
        <linearGradient id="sw" x1="16" y1="2" x2="28" y2="9">
          <stop offset="0" stopColor="#38c6f4" stopOpacity=".05" />
          <stop offset="1" stopColor="#38c6f4" stopOpacity=".55" />
        </linearGradient>
      </defs>
    </svg>
  );
}
