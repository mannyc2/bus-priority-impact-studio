import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RouteDetailTab } from "./section-registry";

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
                className="inline-flex items-center gap-1.5 rounded-none border-0 px-0 py-[10px] text-[12.5px] font-normal text-[var(--bp-color-ink-55)] data-active:font-semibold data-active:text-[var(--bp-color-ink)] data-active:shadow-[inset_0_-2px_0_var(--bp-color-ink)] data-active:after:hidden"
              >
                {t.label}
                {t.badge && t.badge.count > 0 ? (
                  <Badge
                    variant={t.badge.severity === "high" ? "bad" : "warn"}
                    className="h-[17px] min-w-[17px] px-[5px] py-0 text-[10px]"
                    aria-label={`${t.badge.count} flagged insight${t.badge.count === 1 ? "" : "s"}`}
                  >
                    {t.badge.count > 9 ? "9+" : t.badge.count}
                  </Badge>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-8 py-7">{children}</div>
      </Tabs>
    </div>
  );
}
