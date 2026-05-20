import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { StudioMark } from "@/components/StudioMark";

const navItems = [
  { to: "/", label: "Routes" },
  { to: "/findings", label: "Findings" },
  { to: "/briefs", label: "Briefs" },
  { to: "/methods", label: "Methods" },
  { to: "/docs", label: "Docs" },
] as const;

const DATA_CURRENT_TO = "2026-05-12";

export function StudioShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bp-color-canvas)] text-[var(--bp-color-ink)]">
      <header
        className="flex h-[54px] shrink-0 items-center gap-8 bg-[var(--bp-color-card)] px-7 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:px-4"
        style={{ viewTransitionName: "persistent-nav" }}
      >
        <Link to="/" viewTransition className="flex items-center gap-2.5 no-underline">
          <StudioMark size={22} />
          <div className="text-sm font-semibold tracking-[-0.01em]">
            Bus Priority{" "}
            <span className="font-normal text-[var(--bp-color-ink-55)]">Impact Studio</span>
          </div>
        </Link>
        <nav
          className="flex min-w-0 flex-1 items-center gap-[22px] overflow-x-auto"
          aria-label="Primary"
        >
          {navItems.map((item) => (
            <StudioNavLink key={item.to} item={item} pathname={pathname} />
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-[var(--bp-color-ink-55)] max-sm:hidden">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--bp-color-good)]" aria-hidden />
          data current to {DATA_CURRENT_TO}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function StudioNavLink({ item, pathname }: { item: (typeof navItems)[number]; pathname: string }) {
  const active =
    item.to === "/"
      ? pathname === "/" || pathname.startsWith("/routes")
      : pathname.startsWith(item.to);

  return (
    <Link
      to={item.to}
      viewTransition
      className={
        active
          ? "shrink-0 pb-[2px] text-[13px] font-semibold text-[var(--bp-color-ink)] no-underline shadow-[inset_0_-2px_0_var(--bp-color-ink)]"
          : "shrink-0 pb-[2px] text-[13px] font-normal text-[var(--bp-color-ink-55)] no-underline hover:text-[var(--bp-color-ink)]"
      }
    >
      {item.label}
    </Link>
  );
}
