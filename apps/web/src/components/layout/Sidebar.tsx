// READY FOR QA
// Component: Sidebar
// What was built: Fixed left sidebar, 240px wide, full viewport height. App name, nav items
//   (Dashboard, Runs, Plan, Pak Har) with Lucide icons and active-state detection via
//   usePathname, and a user avatar + name at the bottom.
// Edge cases:
//   - Active route detection uses startsWith for sub-routes (e.g. /activities/123 stays active on Runs)
//   - /dashboard is exact-matched to avoid false positives
//   - Hidden on mobile (hidden md:flex)

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  Calendar,
  MessageSquare,
} from "lucide-react";
import { Avatar } from "@/components/ui";

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

interface SidebarProps {
  userName: string;
  avatarUrl?: string | null;
  className?: string;
}

export function Sidebar({ userName, avatarUrl, className = "" }: SidebarProps) {
  const pathname = usePathname();

  function isActive(item: NavItem): boolean {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  return (
    <aside
      className={[
        "hidden md:flex flex-col",
        "fixed left-0 top-0 h-screen w-60",
        "bg-surface border-r border-border",
        "z-40",
        className,
      ].join(" ")}
    >
      {/* App name */}
      <div className="px-6 py-5 shrink-0">
        <span className="text-primary font-bold text-lg tracking-tight">
          Old Legs
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium",
                "transition-colors",
                active
                  ? "text-accent"
                  : "text-muted hover:text-primary hover:bg-surface-raised",
              ].join(" ")}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={16} strokeWidth={active ? 2 : 1.5} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-border shrink-0">
        <div className="flex items-center gap-3">
          <Avatar src={avatarUrl} name={userName} size="sm" />
          <span className="text-sm text-muted truncate">{userName}</span>
        </div>
      </div>
    </aside>
  );
}
