// READY FOR QA
// Component: Spinner
// What was built: Animated loading indicator with sm/md/lg sizes
// Edge cases: Used only for isolated loading states (buttons, inline). Use skeleton blocks for content areas per ux-notes.md

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "h-3 w-3 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-7 w-7 border-[3px]",
};

export function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={[
        "inline-block rounded-full border-border border-t-accent animate-spin",
        sizeClasses[size],
        className,
      ].join(" ")}
    />
  );
}
