// READY FOR QA
// Component: ToneBadge (TASK-127)
// What was built: Tabloid tone badge — critical/good/neutral variants with newspaper aesthetic (no border radius)
// Edge cases to test:
//   - All three tone variants render correct bg/text/border combinations
//   - Children text is uppercase regardless of input casing (CSS handles it)
//   - className prop merges correctly without overriding base styles
//   - Long verdict tag text (e.g. "HELD THE LINE") does not wrap unexpectedly

interface ToneBadgeProps {
  tone: 'critical' | 'good' | 'neutral';
  children: string;
  className?: string;
}

const toneClasses: Record<ToneBadgeProps['tone'], string> = {
  critical: 'bg-accent text-[var(--color-ink-on-accent)]',
  good: 'bg-ink text-[var(--color-ink-on-ink)]',
  neutral: 'bg-transparent border border-[var(--color-ink)] text-[var(--color-ink)]',
};

export function ToneBadge({ tone, children, className = '' }: ToneBadgeProps) {
  return (
    <span
      className={[
        'inline-block px-2 py-[3px]',
        'font-sans text-[9px] font-bold uppercase tracking-[0.125rem]',
        toneClasses[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}

export default ToneBadge;
