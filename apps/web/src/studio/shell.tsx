import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, FileText, GitBranch, RouteIcon, Search, Shapes } from "lucide-react";
import type { ReactNode } from "react";
import { StudioMark } from "@/components/StudioMark";

const navItems = [
  { to: "/", label: "Routes", icon: RouteIcon },
  { to: "/findings", label: "Findings", icon: GitBranch },
  { to: "/briefs", label: "Briefs", icon: FileText },
  { to: "/methods", label: "Methods", icon: Shapes },
  { to: "/docs", label: "Docs", icon: BookOpen },
] as const;

export function StudioShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bp-color-paper)] text-[var(--bp-color-ink)]">
      <header
        className="flex h-[54px] shrink-0 items-center gap-8 bg-[var(--bp-color-card)] px-7 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:px-4"
        style={{ viewTransitionName: "persistent-nav" }}
      >
        <Link to="/" viewTransition className="flex items-center gap-2.5 no-underline">
          <StudioMark size={22} />
          <div className="text-sm font-semibold tracking-[0]">
            Bus Priority{" "}
            <span className="font-normal text-[var(--bp-color-ink-55)]">Impact Studio</span>
          </div>
        </Link>
        <nav
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          aria-label="Primary"
        >
          {navItems.map((item) => (
            <StudioNavLink key={item.to} item={item} pathname={pathname} />
          ))}
        </nav>
        <Link
          to="/search"
          search={{ q: "manhattan ace" }}
          viewTransition
          className="flex h-8 shrink-0 items-center gap-2 rounded-[3px] border border-[var(--bp-color-ink-20)] bg-[var(--bp-color-card-raised)] px-3 text-[12px] text-[var(--bp-color-ink-55)] no-underline max-sm:hidden"
        >
          <Search size={14} strokeWidth={1.8} />
          Search
          <span className="font-mono text-[10px] text-[var(--bp-color-ink-40)]">/</span>
        </Link>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function StudioNavLink({ item, pathname }: { item: (typeof navItems)[number]; pathname: string }) {
  const Icon = item.icon;
  const active =
    item.to === "/"
      ? pathname === "/" || pathname.startsWith("/routes")
      : pathname.startsWith(item.to);

  return (
    <Link
      to={item.to}
      viewTransition
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-[3px] px-2.5 text-[12.5px] no-underline transition-colors ${
        active
          ? "bg-[var(--bp-color-ink)] text-[var(--bp-color-paper)]"
          : "bg-transparent text-[var(--bp-color-ink-55)]"
      }`}
    >
      <Icon size={14} strokeWidth={1.8} />
      {item.label}
    </Link>
  );
}
