// READY FOR QA
// Component: BottomNav
// What was built: Mobile-only fixed bottom tab bar with 4 icon-only tabs matching the Sidebar
//   nav. Active tab uses text-accent, inactive uses text-muted. Hidden on md and above.
// Edge cases:
//   - Icon-only on mobile — no text labels (space-constrained)
//   - aria-label on each link for accessibility in lieu of visible text
//   - Active detection mirrors Sidebar logic (exact for /dashboard, startsWith for others)

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  Calendar,
  MessageSquare,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, exact: true },
  { label: "Runs", href: "/activities", icon: Activity },
  { label: "Plan", href: "/plan", icon: Calendar },
  { label: "Pak Har", href: "/coach", icon: MessageSquare },
];

interface BottomNavProps {
  className?: string;
}

export function BottomNav({ className = "" }: BottomNavProps) {
  const pathname = usePathname();

  function isActive(item: NavItem): boolean {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  return (
    <nav
      className={[
        "flex md:hidden",
        "fixed bottom-0 left-0 right-0 z-40",
        "bg-surface border-t border-border",
        "h-16",
        className,
      ].join(" ")}
      aria-label="Main navigation"
    >
      <div className="flex w-full items-center justify-around px-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={[
                "flex flex-col items-center justify-center",
                "flex-1 h-full",
                "transition-colors",
                active ? "text-accent" : "text-muted",
              ].join(" ")}
            >
              <Icon size={22} strokeWidth={active ? 2 : 1.5} aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
