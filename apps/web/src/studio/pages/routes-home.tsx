import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import {
  AiAttribution,
  Chip,
  KPI,
  RouteBadge,
  SearchField,
  Spark,
} from "../../design-system/primitives.js";
import { bpiColors } from "../../design-system/tokens.js";
import { StudioHero, StudioPage, StudioPanel } from "../page.js";
import { studioRoutes } from "../sample-data.js";

export function RoutesHomePage() {
  return (
    <StudioPage
      rail={
        <StudioPanel>
          <div className="text-[13px] font-semibold">What changed</div>
          <div className="mt-3 space-y-3 text-[12px] leading-5 text-[var(--bp-color-ink-70)]">
            <p>
              Routes are ranked by week-over-week speed decline, rider-hour impact, and whether an
              intervention already exists.
            </p>
            <p>
              The home page stays route-first. Segment maps and charts appear after a route or
              finding earns attention.
            </p>
          </div>
        </StudioPanel>
      }
    >
      <StudioHero
        label="Route evidence studio"
        title="Pick a route. See the evidence."
        body="Search by route, corridor, borough, or intervention. The studio turns precomputed transit data into route pages, findings, and cited briefs."
        action={
          <Link
            to="/docs"
            viewTransition
            className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] px-3.5 text-[12.5px] font-medium text-[var(--bp-color-paper)] no-underline"
          >
            API docs
            <ArrowRight size={14} />
          </Link>
        }
      />
      <div className="mb-6 max-w-[760px]">
        <SearchField placeholder="Search by route number, street, or borough..." shortcut="/" />
      </div>
      <AiAttribution>
        Needs-attention routes are surfaced from the same evidence that appears in route detail:
        rider-hour delay, treatment coverage, trend direction, and source caveats.
      </AiAttribution>
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="m-0 text-[18px] font-semibold">Routes needing attention</h2>
          <Chip tone="accent">Mar 2026 baseline</Chip>
        </div>
        <div className="grid gap-3">
          {studioRoutes.map((route, index) => (
            <Link
              key={route.slug}
              to="/routes/$routeId"
              params={{ routeId: route.slug }}
              viewTransition
              className="grid grid-cols-[44px_1fr_auto] items-center gap-4 rounded-[3px] bg-[var(--bp-color-card)] p-4 text-[var(--bp-color-ink)] no-underline shadow-[0_0_0_1px_var(--bp-color-rule)] transition-colors hover:bg-[var(--bp-color-card-raised)] max-sm:grid-cols-[1fr_auto]"
            >
              <div className="font-mono text-[12px] font-bold text-[var(--bp-color-ink-40)] max-sm:hidden">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <RouteBadge route={route.label} sbs={route.sbs} size="md" />
                  <Chip tone={route.speedMph < 5 ? "bad" : "warn"}>{route.reliability}</Chip>
                </div>
                <div className="truncate text-[14px] font-semibold">{route.corridor}</div>
                <div className="mt-1 text-[12px] text-[var(--bp-color-ink-55)]">
                  {route.diagnosis}
                </div>
              </div>
              <div className="grid grid-cols-[96px_96px] items-center gap-5 max-sm:grid-cols-1">
                <KPI
                  label="Speed"
                  value={route.speedMph.toFixed(1)}
                  unit="mph"
                  tone={route.speedMph < 5 ? "bad" : "warn"}
                />
                <Spark
                  data={route.spark}
                  width={82}
                  height={26}
                  color={route.speedMph < 5 ? bpiColors.bad : bpiColors.warn}
                  baseline={route.scheduledMph}
                />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </StudioPage>
  );
}
