// READY FOR QA
// Component: TopBar
// What was built: Page title (h1) on the left, Avatar on the right. Nothing else.
//   Visible on all viewports — sits above the main content area.
// Edge cases:
//   - title is required; avatarUrl is optional (Avatar falls back to initials)
//   - Does not contain nav — that's handled by Sidebar / BottomNav

import { Avatar } from "@/components/ui";

interface TopBarProps {
  title: string;
  userName: string;
  avatarUrl?: string | null;
  className?: string;
}

export function TopBar({ title, userName, avatarUrl, className = "" }: TopBarProps) {
  return (
    <header
      className={[
        "flex items-center justify-between",
        "px-6 py-4",
        "border-b border-border bg-surface",
        "shrink-0",
        className,
      ].join(" ")}
    >
      <h1 className="text-base font-semibold text-primary">{title}</h1>
      <Avatar src={avatarUrl} name={userName} size="sm" />
    </header>
  );
}
