import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type RouteDetailTab = { value: string; label: string };

/** The question-shaped route-section tabs (frontend §4.3), shared verbatim by
 * route-detail and compare so the two pages stay structurally identical.
 * Treatments & history absorbs the old Interventions and Timeline tabs;
 * Evidence absorbs Data notes. A Reliability tab joins when the reliability
 * capability surface leaves `building` (Track B Wave 1). */
export const ROUTE_DETAIL_TABS = [
  { value: "overview", label: "Overview" },
  { value: "where-when", label: "Where & when" },
  { value: "riders", label: "Riders" },
  { value: "treatments", label: "Treatments & history" },
  { value: "evidence", label: "Evidence" },
] as const satisfies readonly RouteDetailTab[];

export type RouteDetailTabValue = (typeof ROUTE_DETAIL_TABS)[number]["value"];

/**
 * Shared chrome for the route-detail and compare pages: the flush header card
 * plus the line-style tab bar and the scrolling content well. The header content
 * (single RouteHeader or the two-route RouteCompareHeader) and the per-tab
 * <TabsContent> blocks are passed in as slots, so the two pages differ only in
 * what they hand to `header` / `children` - not in the surrounding layout.
 */
export function RouteDetailShell({
  header,
  tabs,
  value,
  onValueChange,
  children,
}: {
  header: ReactNode;
  tabs: readonly RouteDetailTab[];
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 bg-[var(--bp-color-card)] px-7 pb-[18px] pt-6 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
        {header}
      </header>
      <Tabs
        value={value}
        onValueChange={onValueChange}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 bg-[var(--bp-color-card)] px-7 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
          <TabsList
            variant="line"
            className="h-auto w-fit justify-start gap-6 rounded-none bg-transparent p-0"
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="rounded-none border-0 px-0 py-[10px] text-[12.5px] font-normal text-[var(--bp-color-ink-55)] data-active:font-semibold data-active:text-[var(--bp-color-ink)] data-active:shadow-[inset_0_-2px_0_var(--bp-color-ink)] data-active:after:hidden"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-8 py-7">{children}</div>
      </Tabs>
    </div>
  );
}
