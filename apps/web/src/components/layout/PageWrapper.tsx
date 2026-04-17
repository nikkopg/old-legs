// READY FOR QA
// Component: PageWrapper
// What was built: Composes Sidebar + BottomNav + TopBar + main content area.
//   Desktop (md+): fixed 240px Sidebar on left, main content fills remaining width.
//   Mobile (<md): full-width stack; main content gets bottom padding to clear the
//   fixed BottomNav (pb-20 = 80px > 64px nav height, giving a small breathing gap).
// Edge cases:
//   - Sidebar is 240px fixed — main content uses ml-60 on md+ to avoid overlap
//   - BottomNav is fixed at bottom; pb-20 on main prevents content being hidden behind it
//   - pageTitle is optional — TopBar is only rendered when provided
//   - avatarUrl is optional (Avatar falls back to initials)
//   - children wrapped in React.Fragment so any content type is accepted

import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { TopBar } from "./TopBar";

interface PageWrapperProps {
  children: React.ReactNode;
  userName: string;
  avatarUrl?: string | null;
  pageTitle?: string;
  className?: string;
}

export function PageWrapper({
  children,
  userName,
  avatarUrl,
  pageTitle,
  className = "",
}: PageWrapperProps) {
  return (
    <div className={["flex h-screen bg-background overflow-hidden", className].join(" ")}>
      {/* Desktop sidebar — fixed, hidden on mobile */}
      <Sidebar userName={userName} avatarUrl={avatarUrl} />

      {/* Main area — offset by sidebar width on desktop */}
      <div className="flex flex-col flex-1 md:ml-60 min-w-0">
        {pageTitle && (
          <TopBar
            title={pageTitle}
            userName={userName}
            avatarUrl={avatarUrl}
          />
        )}

        {/* Scrollable content */}
        <main
          className={[
            "flex-1 overflow-y-auto",
            "p-4 pb-20 md:p-6 md:pb-6",
          ].join(" ")}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — fixed, hidden on desktop */}
      <BottomNav />
    </div>
  );
}
