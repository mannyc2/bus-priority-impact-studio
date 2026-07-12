import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { HonestEmptyState, RouteDetailTabValue, RouteDetailTabView } from "./section-registry";

/**
 * Shared chrome for the route-detail page: a compact, non-sticky header block
 * (plan 033 — the header scrolls away), a sticky bar of real tabs, one panel
 * for the active tab's content, and an always-present "About this data"
 * collapsible below it. Only the active tab's `children` mount — unmounted tabs
 * never render or fetch.
 *
 * The tab bar is intentionally plain markup (`role="tablist"` +
 * `role="tab"`/`aria-selected` buttons): the URL owns the active tab, so the
 * shell needs no internal tab state, and plain buttons give exact control over
 * the underlined MTA-blue tab styling without fighting the shadcn tab presets.
 */
export function RouteDetailShell({
  header,
  tabs,
  activeTab,
  onTabChange,
  aboutData,
  children,
}: {
  header: ReactNode;
  tabs: readonly RouteDetailTabView[];
  activeTab: RouteDetailTabValue;
  onTabChange: (tab: RouteDetailTabValue) => void;
  aboutData: ReactNode | null;
  children: ReactNode;
}) {
  return (
    <div className="h-full min-h-0 overflow-auto">
      {header}
      <div
        role="tablist"
        aria-label="Route sections"
        className="sticky top-0 z-10 overflow-x-auto bg-[var(--bp-color-card)] px-7 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:px-4"
      >
        <div className="flex w-max min-w-full items-center gap-6 py-[10px]">
          {tabs.map((tab) => {
            const active = tab.value === activeTab;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(tab.value)}
                className={cn(
                  "inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap border-0 bg-transparent px-0 text-[13px] leading-none transition-colors",
                  active
                    ? "font-semibold text-[var(--bp-color-ink)] shadow-[inset_0_-2px_0_var(--bp-color-accent)]"
                    : "font-medium text-[var(--bp-color-ink-55)] hover:text-[var(--bp-color-ink)]",
                )}
              >
                {tab.label}
                {tab.presentation.mode === "empty" ? (
                  <Badge
                    variant={emptyStateVariant(tab.presentation.state)}
                    className="h-[17px] px-[5px] py-0 text-[10px]"
                  >
                    {emptyStateLabel(tab.presentation.state)}
                  </Badge>
                ) : null}
                {tab.badge && tab.badge.count > 0 ? (
                  <Badge
                    variant={tab.badge.severity === "high" ? "bad" : "warn"}
                    className="h-[17px] min-w-[17px] px-[5px] py-0 text-[10px]"
                    aria-label={`${tab.badge.count} notice${tab.badge.count === 1 ? "" : "s"}`}
                  >
                    {tab.badge.count > 9 ? "9+" : tab.badge.count}
                  </Badge>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="px-8 py-8 max-md:px-4">
        {children}
        {aboutData ? (
          <Collapsible className="mt-10 border-t border-[var(--bp-color-rule)] pt-2">
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 bg-transparent px-0 py-2 text-left text-[12.5px] font-semibold text-[var(--bp-color-ink-55)] hover:text-[var(--bp-color-ink)]">
              About this data
              <span
                aria-hidden
                className="text-[10px] transition-transform group-data-[panel-open]:rotate-180"
              >
                ▾
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">{aboutData}</CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </div>
  );
}

function emptyStateLabel(state: HonestEmptyState): string {
  switch (state) {
    case "checked_clean":
      return "Checked";
    case "building":
      return "Building";
    case "insufficient_data":
      return "Thin";
    case "blocked":
      return "Blocked";
  }
}

function emptyStateVariant(state: HonestEmptyState): "neutral" | "good" | "bad" {
  if (state === "checked_clean") return "good";
  if (state === "blocked") return "bad";
  return "neutral";
}
