// READY FOR QA
// Component: Badge
// What was built: Pill label with variants: neutral, accent, muted, success, danger
// Edge cases: accent variant uses border only (no fill) per design spec; rounded-sm per ux-notes

interface BadgeProps {
  variant?: "neutral" | "accent" | "muted" | "success" | "danger";
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  neutral:
    "bg-surface-raised text-text-primary border border-border",
  accent:
    "bg-transparent text-accent border border-accent",
  muted:
    "bg-surface text-text-muted border border-border",
  success:
    "bg-transparent text-success border border-success",
  danger:
    "bg-transparent text-error border border-error",
};

export function Badge({ variant = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium",
        variantClasses[variant],
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
