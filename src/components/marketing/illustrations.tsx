/** Illustrations built from shapes only: no stock photos, no logos, no performance numbers. */

export function CatchmentMap({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 340" className={className} role="img" aria-label="Illustration: two showrooms on a city map with their target radius circles">
      <rect width="480" height="340" rx="16" fill="#172743" />
      <g stroke="#24385c" strokeWidth="10" strokeLinecap="round" fill="none">
        <path d="M-10 250 C 90 220, 160 260, 260 200 S 420 120, 500 140" />
        <path d="M120 -10 C 140 80, 110 160, 150 350" />
        <path d="M330 -10 C 300 100, 360 200, 320 350" />
      </g>
      <g stroke="#3a4f75" strokeWidth="3" fill="none">
        <path d="M0 90 H480" />
        <path d="M0 170 H480" />
        <path d="M60 0 V340" />
        <path d="M230 0 V340" />
        <path d="M410 0 V340" />
      </g>
      <circle cx="170" cy="190" r="95" fill="#f59e0b" fillOpacity="0.14" stroke="#f59e0b" strokeDasharray="6 6" strokeWidth="2" />
      <circle cx="170" cy="190" r="45" fill="#f59e0b" fillOpacity="0.18" stroke="#f59e0b" strokeWidth="2" />
      <circle cx="350" cy="110" r="70" fill="#2563eb" fillOpacity="0.16" stroke="#60a5fa" strokeDasharray="6 6" strokeWidth="2" />
      <g>
        <path d="M170 150c-11 0-20 8.7-20 19.6C150 184 170 200 170 200s20-16 20-30.4C190 158.7 181 150 170 150z" fill="#f59e0b" />
        <circle cx="170" cy="169" r="7" fill="#0f1b31" />
      </g>
      <g>
        <path d="M350 72c-11 0-20 8.7-20 19.6C330 106 350 122 350 122s20-16 20-30.4C370 80.7 361 72 350 72z" fill="#60a5fa" />
        <circle cx="350" cy="91" r="7" fill="#0f1b31" />
      </g>
      <g fontFamily="system-ui, sans-serif" fontSize="12" fill="#ebeff6">
        <rect x="196" y="236" width="110" height="24" rx="6" fill="#0f1b31" />
        <text x="206" y="252">Showroom · 5 km</text>
        <rect x="372" y="168" width="96" height="24" rx="6" fill="#0f1b31" />
        <text x="380" y="184">Service · 3 km</text>
      </g>
    </svg>
  );
}

/** Layout preview of the dashboard. Values are deliberately left blank. */
export function DashboardPreview({ className }: { className?: string }) {
  const bar = (x: number, h: number, c: string) => <rect x={x} y={250 - h} width="18" height={h} rx="3" fill={c} />;
  return (
    <svg viewBox="0 0 560 340" className={className} role="img" aria-label="Illustration of the AutoSutra dashboard layout with placeholder values">
      <rect width="560" height="340" rx="14" fill="#ffffff" stroke="#d7deea" />
      <rect width="120" height="340" rx="14" fill="#0f1b31" />
      {[40, 70, 100, 130, 160, 190].map((y) => (
        <rect key={y} x="18" y={y} width={y === 70 ? 84 : 70} height="10" rx="5" fill={y === 70 ? "#f59e0b" : "#3a4f75"} />
      ))}
      {[140, 245, 350, 455].map((x, i) => (
        <g key={x}>
          <rect x={x} y="24" width="92" height="58" rx="8" fill="#f5f7fb" stroke="#ebeff6" />
          <rect x={x + 10} y="36" width="50" height="7" rx="3" fill="#b5c0d4" />
          <rect x={x + 10} y="54" width={i === 1 ? 60 : 44} height="14" rx="4" fill="#d7deea" />
        </g>
      ))}
      <rect x="140" y="100" width="260" height="170" rx="8" fill="#f5f7fb" stroke="#ebeff6" />
      {bar(160, 60, "#f59e0b")}
      {bar(190, 90, "#2563eb")}
      {bar(220, 75, "#f59e0b")}
      {bar(250, 110, "#2563eb")}
      {bar(280, 95, "#f59e0b")}
      {bar(310, 120, "#2563eb")}
      {bar(340, 100, "#f59e0b")}
      {bar(370, 130, "#2563eb")}
      <rect x="415" y="100" width="132" height="170" rx="8" fill="#f5f7fb" stroke="#ebeff6" />
      {[120, 150, 180, 210, 240].map((y) => (
        <g key={y}>
          <circle cx="432" cy={y} r="6" fill={y === 150 ? "#f59e0b" : "#b5c0d4"} />
          <rect x="446" y={y - 4} width="86" height="8" rx="4" fill="#d7deea" />
        </g>
      ))}
      <text x="140" y="300" fontFamily="system-ui, sans-serif" fontSize="11" fill="#5b6f93">
        Layout preview. Your dashboard shows only data reported by your connected ad accounts and your own lead records.
      </text>
    </svg>
  );
}
