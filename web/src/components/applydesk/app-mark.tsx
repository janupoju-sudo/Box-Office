// applydesk: the app's own mark (a desk tray with an outgoing arrow), so the
// fork doesn't use career-ops' logo. Colors follow the theme tokens.
export function AppMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="7" fill="var(--color-brand)" />
      <path d="M8 18v5h16v-5" fill="none" stroke="var(--color-brand-foreground)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 19V8m0 0-4 4m4-4 4 4" fill="none" stroke="var(--color-brand-foreground)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
