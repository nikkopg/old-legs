// READY FOR QA
// Component: Card
// What was built: Base container with optional header/footer slots and noPadding prop
// Edge cases: noPadding for full-bleed content (e.g. charts); hover prop for clickable cards

interface CardProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  noPadding?: boolean;
  hover?: boolean;
  className?: string;
}

export function Card({
  children,
  header,
  footer,
  noPadding = false,
  hover = false,
  className = "",
}: CardProps) {
  return (
    <div
      className={[
        "bg-surface rounded-md border border-border shadow-card",
        hover ? "hover:bg-surface-raised transition-colors cursor-pointer" : "",
        className,
      ].join(" ")}
    >
      {header && (
        <div className="px-4 py-3 border-b border-border text-sm font-medium text-text-primary">
          {header}
        </div>
      )}
      <div className={noPadding ? "" : "p-4"}>{children}</div>
      {footer && (
        <div className="px-4 py-3 border-t border-border text-sm text-text-muted">
          {footer}
        </div>
      )}
    </div>
  );
}
