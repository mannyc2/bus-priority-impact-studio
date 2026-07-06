import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  type HonestEmptyState,
  type RouteDetailSection,
  routeSectionAnchorId,
} from "./section-registry";

/**
 * Shared chrome for the route-detail page: editorial header, slim anchor index,
 * and scrolling content well.
 */
export function RouteDetailShell({
  header,
  sections,
  children,
}: {
  header: ReactNode;
  sections: readonly RouteDetailSection[];
  children: ReactNode;
}) {
  return (
    <div className="h-full min-h-0 overflow-auto">
      <header
        id={routeSectionAnchorId("overview")}
        className="scroll-mt-16 bg-[var(--bp-color-card)] px-7 pb-6 pt-6 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:px-4"
      >
        {header}
      </header>
      <nav
        aria-label="Route page sections"
        className="sticky top-0 z-10 overflow-x-auto bg-[var(--bp-color-card)] px-7 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:px-4"
      >
        <div className="flex w-max min-w-full items-center gap-6 py-[10px]">
          {sections.map((section) => (
            <a
              key={section.value}
              href={`#${routeSectionAnchorId(section.value)}`}
              className="inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold text-[var(--bp-color-ink-70)] no-underline hover:text-[var(--bp-color-ink)]"
            >
              {section.label}
              {section.emptyState ? (
                <Badge
                  variant={emptyStateVariant(section.emptyState)}
                  className="h-[17px] px-[5px] py-0 text-[10px]"
                >
                  {emptyStateLabel(section.emptyState)}
                </Badge>
              ) : null}
              {section.badge && section.badge.count > 0 ? (
                <Badge
                  variant={section.badge.severity === "high" ? "bad" : "warn"}
                  className="h-[17px] min-w-[17px] px-[5px] py-0 text-[10px]"
                  aria-label={`${section.badge.count} notice${
                    section.badge.count === 1 ? "" : "s"
                  }`}
                >
                  {section.badge.count > 9 ? "9+" : section.badge.count}
                </Badge>
              ) : null}
            </a>
          ))}
        </div>
      </nav>
      <div className="px-8 py-8 max-md:px-4">{children}</div>
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
