// Box Office: the app's own mark, an admission ticket with a star, so the fork
// doesn't use career-ops' logo. Colors follow the theme tokens.
export function AppMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="7" fill="var(--color-brand)" />
      <g transform="rotate(-12 16 16)">
        <path
          d="M6 10.5h20v3a2.5 2.5 0 0 0 0 5v3H6v-3a2.5 2.5 0 0 0 0-5z"
          fill="var(--color-brand-foreground)"
        />
        <path d="M20 11.5v9" stroke="var(--color-brand)" strokeWidth="1.2" strokeDasharray="1.4 1.4" />
        <path
          d="m13 13 .9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.5 2.1-.3z"
          fill="var(--color-brand)"
        />
      </g>
    </svg>
  );
}
