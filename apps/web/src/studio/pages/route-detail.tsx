import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { AiAttribution } from "@/components/AiAttribution";
import { BeforeAfter } from "@/components/BeforeAfter";
import { ChartFrame } from "@/components/ChartFrame";
import { KPI } from "@/components/KPI";
import { RouteBadge } from "@/components/RouteBadge";
import { SegmentRow, SegmentRowHeader } from "@/components/SegmentRow";
import { Spark } from "@/components/Spark";
import { StudioHero, StudioPage, StudioPanel } from "../page.js";
import { getStudioRoute, routeSegments } from "../sample-data.js";
import { NotFoundPage } from "./not-found.js";

export function RouteDetailPage({ routeSlug }: { routeSlug: string }) {
  const route = getStudioRoute(routeSlug);
  if (!route) return <NotFoundPage />;

  const segments = routeSegments(route.slug);

  return (
    <StudioPage
      rail={
        <StudioPanel>
          <div className="mb-3 flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-[var(--bp-color-accent)]">◆</span>
            <span className="text-[13px] font-semibold">Brief seed</span>
          </div>
          <div className="text-[12px] leading-5 text-[var(--bp-color-ink-70)]">
            This route has enough evidence to generate a cited intervention brief.
          </div>
          <Link
            to="/briefs/new"
            search={{ route: route.slug }}
            viewTransition
            className="mt-4 inline-flex h-8 items-center gap-1 rounded-[3px] bg-[var(--bp-color-ink)] px-3 text-[12px] font-medium text-[var(--bp-color-paper)] no-underline"
          >
            Generate brief
            <ArrowRight size={13} />
          </Link>
        </StudioPanel>
      }
    >
      <StudioHero
        label={
          <span className="inline-flex items-center gap-2">
            <RouteBadge route={route.label} sbs={route.sbs} size="lg" />
            {route.borough}
          </span>
        }
        title={route.corridor}
        body={route.diagnosis}
        action={
          <Link
            to="/routes/$routeId/ladder"
            params={{ routeId: route.slug }}
            viewTransition
            className="inline-flex h-9 items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-ink-20)] px-3.5 text-[12.5px] font-medium no-underline"
          >
            Open ladder
            <ArrowRight size={14} />
          </Link>
        }
      />
      <div className="mb-5 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <KPI
          label="Observed speed"
          value={route.speedMph.toFixed(1)}
          unit="mph"
          tone={route.speedMph < 5 ? "bad" : "warn"}
          sub={`vs ${route.scheduledMph.toFixed(1)} scheduled`}
        />
        <KPI
          label="Rider-hours lost"
          value={route.riderHoursLost.toLocaleString()}
          tone="bad"
          sub="weekday estimate"
        />
        <KPI
          label="Lane coverage"
          value={route.laneCoverage}
          unit="%"
          tone={route.laneCoverage < 40 ? "warn" : "good"}
          sub="slow segments"
        />
        <KPI label="Reliability" value={route.reliability} tone="accent" sub="AI-ranked context" />
      </div>
      <AiAttribution>
        The strongest explanation is a treatment gap: rider delay concentrates on a corridor where
        enforcement and lane coverage are weaker than the rest of the route.
      </AiAttribution>
      <div className="mt-5 grid grid-cols-[1fr_280px] gap-5 max-xl:grid-cols-1">
        <ChartFrame title="Speed trend" source="MTA segment speeds, weekday hours">
          <div className="flex h-[170px] items-center justify-center">
            <Spark
              data={route.spark}
              width={480}
              height={120}
              baseline={route.scheduledMph}
              color={route.speedMph < 5 ? "var(--bp-color-bad)" : "var(--bp-color-warn)"}
              fill
            />
          </div>
        </ChartFrame>
        <StudioPanel>
          <div className="mb-3 text-[13px] font-semibold">Intervention potential</div>
          <BeforeAfter before={route.speedMph} after={route.speedMph + 1.4} max={10} />
          <div className="mt-3 text-[11.5px] leading-5 text-[var(--bp-color-ink-55)]">
            This is not a promise. It is a bounded scenario based on peer treatment performance.
          </div>
        </StudioPanel>
      </div>
      <section className="mt-5 overflow-x-auto rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <div className="min-w-[680px]">
          <SegmentRowHeader />
          {segments.map((segment, index) => (
            <SegmentRow
              key={segment.id}
              dir={segment.direction}
              from={segment.from}
              to={segment.to}
              mph={segment.speedMph}
              sched={segment.scheduledMph}
              riderHours={segment.riderHours}
              hours={segment.hours}
              lane={segment.lane}
              ace={segment.ace}
              tsp={segment.tsp}
              hasNote={index === 0}
              {...(index === 0 ? { flag: "top" as const } : {})}
            />
          ))}
        </div>
      </section>
    </StudioPage>
  );
}
