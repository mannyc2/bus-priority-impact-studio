import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Chip, HourStrip, RouteBadge, TreatmentRow } from "../../design-system/primitives.js";
import { bpiColors } from "../../design-system/tokens.js";
import { StudioHero, StudioPage, StudioPanel } from "../page.js";
import { getStudioRoute, routeSegments } from "../sample-data.js";
import { NotFoundPage } from "./not-found.js";

export function RouteLadderPage({ routeSlug }: { routeSlug: string }) {
  const route = getStudioRoute(routeSlug);
  if (!route) return <NotFoundPage />;

  const segments = routeSegments(route.slug);

  return (
    <StudioPage>
      <StudioHero
        label={
          <span className="inline-flex items-center gap-2">
            <RouteBadge route={route.label} sbs={route.sbs} size="lg" />
            Ladder view
          </span>
        }
        title="Performance along the route"
        body="A route ladder reads like a spine: slow segments, rider impact, and treatments stay aligned so the pattern is visible without starting from a map."
        action={
          <Link
            to="/routes/$routeId"
            params={{ routeId: route.slug }}
            viewTransition
            className="inline-flex h-9 items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-ink-20)] px-3.5 text-[12.5px] font-medium no-underline"
          >
            <ChevronLeft size={14} />
            Route detail
          </Link>
        }
      />
      <div className="grid grid-cols-[1fr_280px] gap-6 max-xl:grid-cols-1">
        <div className="rounded-[3px] bg-[var(--bp-color-card)] p-6 shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <div className="relative mx-auto max-w-[720px]">
            <div className="absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 bg-[var(--bp-color-ink-20)]" />
            <div className="space-y-5">
              {segments.map((segment, index) => {
                const bad = segment.speedMph < 5;
                return (
                  <div
                    key={segment.id}
                    className="relative grid grid-cols-[1fr_64px_1fr] items-center gap-5"
                  >
                    <div className="text-right">
                      <div
                        className="font-mono text-[22px] font-semibold"
                        style={{ color: bad ? bpiColors.bad : bpiColors.warn }}
                      >
                        {segment.speedMph.toFixed(1)}
                      </div>
                      <div className="text-[11px] text-[var(--bp-color-ink-55)]">mph observed</div>
                    </div>
                    <div className="relative z-10 flex size-16 items-center justify-center rounded-full bg-[var(--bp-color-paper)] shadow-[inset_0_0_0_2px_var(--bp-color-ink)]">
                      <span className="font-mono text-[11px] font-bold">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <StudioPanel>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-[13px] font-semibold">
                          {segment.from} {"->"} {segment.to}
                        </div>
                        {index === 0 ? <Chip tone="accent">top impact</Chip> : null}
                      </div>
                      <HourStrip hours={segment.hours} />
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="font-mono text-[11px] text-[var(--bp-color-ink-55)]">
                          {segment.riderHours.toLocaleString()} RH/day
                        </span>
                        <TreatmentRow lane={segment.lane} ace={segment.ace} tsp={segment.tsp} />
                      </div>
                    </StudioPanel>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <StudioPanel>
          <div className="text-[13px] font-semibold">Time window</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip tone="accent">PM peak</Chip>
            <Chip tone="neutral">AM peak</Chip>
            <Chip tone="neutral">All day</Chip>
          </div>
          <p className="mt-4 text-[12px] leading-5 text-[var(--bp-color-ink-70)]">
            Scan slow points along the route spine, then open the matching route page or evidence
            bundle when a segment needs a brief claim.
          </p>
        </StudioPanel>
      </div>
    </StudioPage>
  );
}
