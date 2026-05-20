import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { AIDiagnosisStrip } from "@/components/AIDiagnosisStrip";
import { BeforeAfter } from "@/components/BeforeAfter";
import { ChartFrame } from "@/components/ChartFrame";
import { FilterChips } from "@/components/FilterChips";
import { HourBars } from "@/components/HourBars";
import { InterventionTimeline } from "@/components/InterventionTimeline";
import { KPISkeleton } from "@/components/KPI";
import { RouteBadge } from "@/components/RouteBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { SegmentRow, SegmentRowHeader, SegmentRowSkeleton } from "@/components/SegmentRow";
import { Spark } from "@/components/Spark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StudioRouteDetailResponse, StudioSegment } from "../api-contract.js";
import { StudioPage } from "../page.js";
import { NotFoundPage } from "./not-found.js";

const TAB_OPTIONS = [
  { value: "overview", label: "Overview" },
  { value: "slow-segments", label: "Slow segments" },
  { value: "ladder", label: "Ladder" },
  { value: "riders", label: "Riders" },
  { value: "interventions", label: "Interventions" },
  { value: "data-notes", label: "Data notes" },
] as const;

export function RouteDetailPage({ data }: { data: StudioRouteDetailResponse | null }) {
  if (data === null) return <NotFoundPage />;

  const { route, segments } = data;
  const flagged = segments.find((s) => s.flagged);
  const peer = data.peerRoute;

  return (
    <StudioPage flush>
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 bg-[var(--bp-color-card)] px-7 pb-[18px] pt-6 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
          <div className="mb-[18px] flex items-start gap-[18px]">
            <RouteBadge route={route.label} sbs={route.sbs} size="xl" />
            <div className="min-w-0 flex-1">
              <h1 className="m-0 text-[24px] font-semibold leading-[1.1] tracking-[-0.02em]">
                {route.corridorFull}
              </h1>
              <div className="mt-1 text-[13px] text-[var(--bp-color-ink-55)]">
                {route.borough} &middot; {route.termini.north} &harr; {route.termini.south} &middot;{" "}
                {route.miles} mi &middot; {route.stops} stops
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {peer ? (
                <Link
                  to="/compare"
                  search={{ a: route.slug, b: peer.slug }}
                  className="inline-flex items-center rounded-[3px] border border-[var(--bp-color-ink-20)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--bp-color-ink)] no-underline"
                >
                  Compare with {peer.label}
                  {peer.sbs ? " SBS" : ""}
                </Link>
              ) : null}
              <Link
                to="/briefs/new"
                search={{ route: route.slug }}
                className="inline-flex items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--bp-color-paper)] no-underline"
              >
                Generate brief
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
          <KpiStrip route={route} />
        </header>
        {route.slug === "m15-sbs" ? (
          <div className="shrink-0">
            <AIDiagnosisStrip
              body={
                <>
                  Full treatment stack (bus lane + ACE + TSP on {route.laneCoverage}% of route), yet
                  PM-peak speed has declined 0.6 mph over 14 months. Of 8 comparable routes, 6
                  reversed this pattern within 60 days of enforcement.
                </>
              }
              emphasis="Madison Av shows no correlated violation reduction - unusual for ACE corridors."
              drivers={[
                {
                  index: 1,
                  title: "Signal timing not yet adjusted for lane geometry",
                  detail: "4 of 8 comparable routes",
                },
                {
                  index: 2,
                  title: "Commercial loading blockage in ACE-exempt categories",
                  detail: "2 of 8",
                },
                {
                  index: 3,
                  title: "Through-traffic displacement post-congestion pricing",
                  detail: "2 of 8",
                },
              ]}
              footer={
                <>
                  Based on 14 months of speed + violation data &middot; 8 comparable SBS routes
                  &middot; confidence: high &middot;{" "}
                  <Link
                    to="/findings/$findingId"
                    params={{ findingId: "m15-full-treatment-still-declining" }}
                    className="text-[var(--bp-color-accent)] no-underline"
                  >
                    See full reasoning in Findings &rarr;
                  </Link>
                </>
              }
            />
          </div>
        ) : null}
        <Tabs defaultValue="slow-segments" className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="shrink-0 bg-[var(--bp-color-card)] px-7 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
            <TabsList
              variant="line"
              className="h-auto w-fit justify-start gap-6 rounded-none bg-transparent p-0"
            >
              {TAB_OPTIONS.map((t) => (
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
          <div className="min-h-0 flex-1 overflow-auto px-8 py-7">
            <TabsContent value="overview">
              <RouteOverviewTab route={route} segments={segments} />
            </TabsContent>
            <TabsContent value="slow-segments" className="space-y-11">
              <SlowSegmentsSection
                routeSlug={route.slug}
                segments={segments}
                {...(flagged?.id ? { flaggedId: flagged.id } : {})}
              />
              <InterventionsSection events={route.interventions} />
              {route.slug === "m15-sbs" ? <BeforeAfterSection /> : null}
            </TabsContent>
            <TabsContent value="ladder">
              <section className="grid grid-cols-[minmax(0,1fr)_280px] gap-5 max-lg:grid-cols-1">
                <div className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
                  <SectionHeader
                    title="Route ladder"
                    sub="Read the route as a vertical spine: observed speed on one side, treatment continuity on the other, and segment detail at the route grain."
                    right={<Badge variant="accent">interactive view</Badge>}
                  />
                  <div className="mt-5 grid grid-cols-[1fr_56px_1fr] gap-3 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
                    <span className="text-right">Speed</span>
                    <span className="text-center">Spine</span>
                    <span>Segment</span>
                  </div>
                  <ol className="relative m-0 mt-3 flex list-none flex-col gap-3 p-0">
                    <div
                      aria-hidden
                      className="absolute left-1/2 top-2 h-[calc(100%-16px)] w-[3px] -translate-x-1/2 bg-[var(--bp-color-ink-20)]"
                    />
                    {segments.slice(0, 6).map((segment, index) => {
                      const color =
                        segment.speedMph < 5
                          ? "var(--bp-color-bad)"
                          : segment.speedMph < 6.5
                            ? "var(--bp-color-warn)"
                            : "var(--bp-color-good)";
                      return (
                        <li
                          key={segment.id}
                          className="relative grid grid-cols-[1fr_56px_1fr] items-center gap-3"
                        >
                          <div className="text-right font-mono text-[14px] font-semibold tabular-nums">
                            <span style={{ color }}>{segment.speedMph.toFixed(1)}</span>
                            <span className="ml-1 text-[10px] text-[var(--bp-color-ink-55)]">
                              mph
                            </span>
                          </div>
                          <div className="relative z-10 flex h-10 w-10 items-center justify-center justify-self-center rounded-full bg-[var(--bp-color-paper)] font-mono text-[11px] font-bold shadow-[inset_0_0_0_2px_var(--bp-color-ink)]">
                            {String(index + 1).padStart(2, "0")}
                          </div>
                          <div className="min-w-0 rounded-[3px] bg-[var(--bp-color-paper)] px-3 py-2 shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
                            <div className="truncate text-[12px] font-semibold">
                              {segment.from} to {segment.to}
                            </div>
                            <div className="mt-1 font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">
                              {segment.riderHours.toLocaleString()} RH/day
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
                <div className="rounded-[3px] bg-[var(--bp-color-paper)] p-4 shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
                  <div className="text-[13px] font-semibold">Analyst challenge</div>
                  <p className="mt-2 text-[12px] leading-[1.6] text-[var(--bp-color-ink-70)]">
                    The full ladder view lets an analyst hide speeds and guess the worst segment
                    from treatment continuity first.
                  </p>
                  <Link
                    to="/routes/$routeId/ladder"
                    params={{ routeId: route.slug }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] px-3 py-2 text-[12px] font-semibold text-[var(--bp-color-paper)] no-underline"
                  >
                    Open full ladder
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </section>
            </TabsContent>
            <TabsContent value="riders">
              <RouteRidersTab route={route} segments={segments} />
            </TabsContent>
            <TabsContent value="interventions">
              <RouteInterventionsTab route={route} />
            </TabsContent>
            <TabsContent value="data-notes">
              <RouteDataNotesTab data={data} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </StudioPage>
  );
}

export function RouteDetailLoadingPage() {
  return (
    <StudioPage flush>
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 bg-[var(--bp-color-card)] px-7 pb-[18px] pt-6 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
          <div className="mb-[18px] flex items-start gap-[18px]">
            <Skeleton className="h-[58px] w-[78px] rounded-[3px]" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[27px] w-[430px] max-w-full" />
              <Skeleton className="mt-2 h-[14px] w-[520px] max-w-full" />
            </div>
            <div className="flex shrink-0 items-center gap-2 max-md:hidden">
              <Skeleton className="h-[36px] w-[170px] rounded-[3px]" />
              <Skeleton className="h-[36px] w-[126px] rounded-[3px]" />
            </div>
          </div>
          <div className="grid grid-cols-5 gap-6 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className={
                  index < 4 ? "border-r border-[var(--bp-color-rule)] pr-5 max-lg:border-r-0" : ""
                }
              >
                <KPISkeleton />
              </div>
            ))}
          </div>
        </header>
        <div className="shrink-0 bg-[var(--bp-color-card)] px-7 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
          <div className="flex gap-6 py-[10px]">
            {TAB_OPTIONS.map((tab) => (
              <Skeleton key={tab.value} className="h-[15px] w-[82px]" />
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-8 py-7">
          <div className="mb-11">
            <div className="mb-4 flex items-end justify-between gap-4 max-md:flex-col max-md:items-start">
              <div>
                <Skeleton className="h-[22px] w-[360px] max-w-full" />
                <Skeleton className="mt-2 h-[13px] w-[520px] max-w-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-[26px] w-[70px] rounded-full" />
                <Skeleton className="h-[26px] w-[92px] rounded-full" />
              </div>
            </div>
            <SegmentRowHeader />
            {Array.from({ length: 5 }).map((_, index) => (
              <SegmentRowSkeleton key={index} />
            ))}
          </div>
          <div>
            <Skeleton className="h-[22px] w-[280px]" />
            <Skeleton className="mt-2 h-[13px] w-[520px] max-w-full" />
            <div className="mt-6 grid grid-cols-3 gap-4 max-lg:grid-cols-1">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]"
                >
                  <Skeleton className="h-[14px] w-[140px]" />
                  <Skeleton className="mt-3 h-[10px] w-full" />
                  <Skeleton className="mt-2 h-[10px] w-[80%]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </StudioPage>
  );
}

function RouteOverviewTab({
  route,
  segments,
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
}) {
  const slowest = segments[0];
  const hourProfile = averageHourlySpeed(route, segments);

  return (
    <div className="flex flex-col gap-7">
      <div className="rounded-[3px] bg-[var(--bp-color-accent-bg)] p-4 shadow-[inset_0_0_0_1px_oklch(0.88_0.07_252)]">
        <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-accent)]">
          AI route briefing
        </div>
        <p className="m-0 max-w-[980px] text-[13px] leading-[1.65] text-[var(--bp-color-ink)]">
          {route.diagnosis}{" "}
          {slowest
            ? `${slowest.from} to ${slowest.to} is the current highest
          rider-impact segment at ${slowest.speedMph.toFixed(1)} mph and ${slowest.riderHours.toLocaleString()}
          rider-hours lost per day.`
            : null}{" "}
          Treatment coverage is visible below so this summary can be checked against the same
          evidence used in the slow-segment and intervention tabs.
        </p>
      </div>

      <ChartFrame
        title="Speed trend"
        source="Route sparkline from current Studio projection; dashed line is scheduled speed."
        height={132}
        right={
          <Badge variant={route.weightedAvgSpeed < 6 ? "bad" : "warn"}>
            {route.weightedAvgSpeed.toFixed(1)} mph now
          </Badge>
        }
      >
        <RouteSpeedTrend data={route.spark} scheduled={route.scheduledMph} />
      </ChartFrame>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-5 max-xl:grid-cols-1">
        <ChartFrame
          title="Speed by hour of day"
          source="Derived from segment hourly severity and route weighted average."
          height={210}
        >
          <HourBars
            data={hourProfile}
            sched={route.scheduledMph}
            width={790}
            height={210}
            min={Math.max(0, Math.floor(Math.min(...hourProfile) - 1))}
            max={Math.ceil(Math.max(route.scheduledMph, ...hourProfile) + 1)}
          />
        </ChartFrame>

        <div className="flex flex-col gap-3">
          <SectionHeader title="Treatment status" />
          <TreatmentStatusCard
            label="Bus lane"
            value={`${route.laneCoverage}%`}
            tone={route.laneCoverage >= 85 ? "good" : route.laneCoverage >= 45 ? "warn" : "bad"}
            note={
              slowest?.lane === "yes"
                ? "Present on the slowest visible segment"
                : "Gap or partial lane on the slowest visible segment"
            }
          />
          <TreatmentStatusCard
            label="ACE"
            value={route.aceStatus === "active" ? "Active" : "None"}
            tone={route.aceStatus === "active" ? "good" : "bad"}
            note={
              route.aceSince
                ? `Program record since ${route.aceSince}`
                : "No route-level enforcement record"
            }
          />
          <TreatmentStatusCard
            label="TSP"
            value={
              route.tspCoverage === "yes"
                ? "Covered"
                : route.tspCoverage === "partial"
                  ? "Partial"
                  : "None"
            }
            tone={
              route.tspCoverage === "yes"
                ? "good"
                : route.tspCoverage === "partial"
                  ? "warn"
                  : "bad"
            }
            note={`${segments.filter((s) => s.tsp).length} of ${segments.length} visible segments have TSP`}
          />
          <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
            <div className="mb-3 text-[13px] font-semibold">Route vitals</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[
                ["Borough", route.borough],
                ["Length", `${route.miles} mi`],
                ["Stops", String(route.stops)],
                ["Type", route.sbs ? "Select Bus Service" : "Local"],
                ["Reliability", route.reliability],
                ["Segments", String(segments.length)],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)]">
                    {label}
                  </div>
                  <div className="mt-0.5 text-[12.5px] font-medium">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RouteRidersTab({
  route,
  segments,
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
}) {
  const topSegments = [...segments].sort((a, b) => b.riderHours - a.riderHours).slice(0, 6);
  const maxRiderHours = Math.max(...topSegments.map((s) => s.riderHours), 1);
  const hourlyExposure = averageHourlySeverity(segments);

  return (
    <div className="flex flex-col gap-7">
      <div className="grid grid-cols-3 rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)] max-lg:grid-cols-1">
        <RiderKpi
          label="Daily riders"
          value={formatCompact(route.dailyRiders)}
          sub={`${route.ridersYoyPct >= 0 ? "+" : ""}${route.ridersYoyPct.toFixed(1)}% year over year`}
        />
        <RiderKpi
          label="Rider-hours lost / day"
          value={route.riderHoursLost.toLocaleString()}
          sub="vs. scheduled timepoints"
          tone="bad"
        />
        <RiderKpi
          label="Highest-impact segment"
          value={formatCompact(topSegments[0]?.riderHours ?? 0)}
          sub={
            topSegments[0] ? `${topSegments[0].from} to ${topSegments[0].to}` : "no segment data"
          }
          tone="bad"
        />
      </div>

      <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
        <ChartFrame
          title="Daily riders trend proxy"
          source="Current route sparkline scaled to boardings until monthly boarding series is exposed."
          height={148}
        >
          <RouteBoardingsTrend data={route.spark} dailyRiders={route.dailyRiders} />
        </ChartFrame>
        <div>
          <SectionHeader
            title="Top rider-impact segments"
            sub="Segment rider-hours lost, used as the route-level rider impact frame."
          />
          <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
            {topSegments.map((segment) => (
              <div
                key={segment.id}
                className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-4 px-4 py-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none"
              >
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-medium">
                    {segment.from} to {segment.to}
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-[var(--bp-color-ink-06)]">
                    <div
                      className="h-full rounded-full bg-[var(--bp-color-ink-40)]"
                      style={{ width: `${(segment.riderHours / maxRiderHours) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-right font-mono text-[13px] font-semibold tabular-nums">
                  {formatCompact(segment.riderHours)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ChartFrame
        title="Rider exposure by hour"
        source="Peak exposure inferred from segment severity timing; red bars mark the AM/PM windows where rider-delay risk is highest."
        height={112}
      >
        <HourlyExposureBars data={hourlyExposure} />
      </ChartFrame>

      <Alert variant="info">
        <AlertTitle variant="info">Rider-hours framing</AlertTitle>
        <AlertDescription>
          A 1-minute delay affecting 1,000 riders is 16.7 rider-hours. This route loses{" "}
          {route.riderHoursLost.toLocaleString()} rider-hours per weekday in the current projection,
          so the rider tab ranks where delay matters most rather than where buses are merely slow.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function RouteInterventionsTab({ route }: { route: StudioRouteDetailResponse["route"] }) {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <SectionHeader
          title="What's in place today"
          sub={`Treatment stack for ${route.label}${route.sbs ? " SBS" : ""}.`}
        />
        <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
          <TreatmentDeepCard
            title="Bus lane"
            status={
              route.laneCoverage >= 85
                ? "Broad coverage"
                : route.laneCoverage > 0
                  ? "Partial"
                  : "None"
            }
            tone={route.laneCoverage >= 85 ? "good" : route.laneCoverage > 0 ? "warn" : "bad"}
            lines={[
              `${route.laneCoverage}% of route mileage`,
              route.laneCoverage < 80
                ? "Coverage gap remains relevant to slow segments"
                : "Most of the route has lane coverage",
              "Use segment tab to verify whether the worst segment is treated",
            ]}
            gap={
              route.laneCoverage < 80
                ? "Coverage is not complete"
                : "Coverage is not the limiting signal"
            }
          />
          <TreatmentDeepCard
            title="ACE enforcement"
            status={route.aceStatus === "active" ? "Active" : "None"}
            tone={route.aceStatus === "active" ? "good" : "bad"}
            lines={[
              route.aceSince ? `Program record since ${route.aceSince}` : "No active program date",
              route.aceStatus === "active"
                ? "Check whether speed improves after enforcement"
                : "No route-level camera enforcement in current record",
              "Violation trend data should be attached before causal claims",
            ]}
            gap={
              route.aceStatus === "active"
                ? "Effect still needs before/after support"
                : "No enforcement treatment present"
            }
          />
          <TreatmentDeepCard
            title="Transit Signal Priority"
            status={
              route.tspCoverage === "yes"
                ? "Covered"
                : route.tspCoverage === "partial"
                  ? "Partial"
                  : "None"
            }
            tone={
              route.tspCoverage === "yes"
                ? "good"
                : route.tspCoverage === "partial"
                  ? "warn"
                  : "bad"
            }
            lines={[
              `Route-level TSP coverage: ${route.tspCoverage}`,
              "Compare against the slowest segments before recommending signal work",
              "TSP is a separate operational lever from lanes and enforcement",
            ]}
            gap={route.tspCoverage === "yes" ? "No obvious TSP gap" : "TSP gap remains plausible"}
          />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-6 max-xl:grid-cols-1">
        <InterventionsSection events={route.interventions} />
        <BeforeAfterSection />
      </div>
    </div>
  );
}

function RouteDataNotesTab({ data }: { data: StudioRouteDetailResponse }) {
  const { route, quality, segments } = data;
  const datasets = [
    ["Bus segment speeds", "MTA Open Data", `${segments.length} timepoint segments`, 14],
    [
      "Ridership and rider-hours",
      "MTA / Studio projection",
      `${formatCompact(route.dailyRiders)} weekday riders`,
      9,
    ],
    [
      "Schedule timepoints",
      "MTA GTFS",
      `${route.scheduledMph.toFixed(1)} mph scheduled baseline`,
      6,
    ],
    ["Bus lane geometry", "NYC DOT", `${route.laneCoverage}% route coverage`, 8],
    [
      "ACE program record",
      "MTA Open Data",
      route.aceSince ? `since ${route.aceSince}` : "no active record",
      5,
    ],
  ] as const;

  const caveats = [
    {
      title: "Speed is observed bus travel speed",
      body: "Segment speeds include dwell time, traffic, signals, and stops. Brief language should say observed bus travel speed, not general traffic speed.",
      scope: `${route.label} route view`,
    },
    {
      title: "Trend data is projection-backed",
      body: "The route sparkline is already computed in the Studio projection. Do not treat it as a full causal time-series without attaching source rows.",
      scope: "route trend",
    },
    {
      title: "Treatment attribution needs context",
      body: "Lane, ACE, and TSP status are shown as operational context. Before publishing an intervention claim, attach before/after windows and any overlapping events.",
      scope: "intervention claims",
    },
    {
      title: "Data quality travels with the route",
      body: `This response was generated at ${data.generatedAt}; quality confidence is ${quality.confidence}. Use the quality object when deciding whether a claim is publishable.`,
      scope: "publication review",
    },
  ];

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center gap-7 rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <DataWindow
          label="Primary window"
          value="Current projection"
          sub={`${segments.length} segments in route detail`}
        />
        <DataWindow
          label="Route quality"
          value={quality.confidence}
          sub={quality.caveats.join("; ") || quality.completenessStatus}
          good={quality.confidence === "high"}
        />
        <DataWindow
          label="Last generated"
          value={data.generatedAt.slice(0, 10)}
          sub="serving artifact timestamp"
        />
        <div className="ml-auto">
          <Link
            to="/methods"
            className="inline-flex items-center rounded-[3px] border border-[var(--bp-color-accent)] px-3 py-2 text-[12px] font-semibold text-[var(--bp-color-accent)] no-underline"
          >
            Full methodology &rarr;
          </Link>
        </div>
      </div>

      <div>
        <SectionHeader
          title="Route-specific caveats"
          sub="Apply these to briefs when the claim uses the associated route evidence."
        />
        <div className="flex flex-col gap-2.5">
          {caveats.map((caveat) => (
            <div
              key={caveat.title}
              className="flex items-start gap-3 rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]"
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bp-color-warn)]" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <div className="text-[13.5px] font-semibold">{caveat.title}</div>
                  <Badge variant="neutral">scope: {caveat.scope}</Badge>
                </div>
                <p className="m-0 mt-1 text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
                  {caveat.body}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-[3px] border border-[var(--bp-color-ink-20)] bg-transparent px-2.5 py-1.5 text-[11px] font-medium"
              >
                Apply to brief
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeader
          title="Datasets in use for this route"
          sub="Dataset rows are shown as route-level evidence inventory, not generic docs."
        />
        <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
          {datasets.map(([name, publisher, window, cites]) => (
            <div
              key={name}
              className="grid grid-cols-[220px_160px_minmax(0,1fr)_80px] items-center gap-5 px-4 py-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none max-lg:grid-cols-1 max-lg:gap-1"
            >
              <div className="text-[13px] font-semibold">{name}</div>
              <div className="font-mono text-[11.5px] text-[var(--bp-color-ink-55)]">
                {publisher}
              </div>
              <div className="text-[11.5px] text-[var(--bp-color-ink-55)]">{window}</div>
              <div className="text-right font-mono text-[11.5px] font-semibold text-[var(--bp-color-accent)] max-lg:text-left">
                cited {cites}x
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiStrip({ route }: { route: StudioRouteDetailResponse["route"] }) {
  const cells = [
    {
      label: "Weighted avg speed",
      value: route.weightedAvgSpeed.toFixed(2),
      unit: "mph",
      sub: `${ordinal(route.speedPercentile)} percentile of NYC SBS routes`,
      tone: route.weightedAvgSpeed < 6 ? "bad" : ("ink" as const),
      trend: (
        <Spark
          data={route.spark}
          width={68}
          height={20}
          color={route.weightedAvgSpeed < 6 ? "var(--bp-color-bad)" : "var(--bp-color-warn)"}
          baseline={route.scheduledMph}
        />
      ),
    },
    {
      label: "Daily riders",
      value:
        route.dailyRiders >= 1000
          ? `${(route.dailyRiders / 1000).toFixed(1)}K`
          : String(route.dailyRiders),
      sub: `${route.ridersYoyPct >= 0 ? "+" : ""}${route.ridersYoyPct.toFixed(1)}% YoY`,
    },
    {
      label: "Rider-hours lost / day",
      value: route.riderHoursLost.toLocaleString(),
      sub: "vs. scheduled timepoints",
      tone: "bad" as const,
    },
    {
      label: "Bus lane coverage",
      value: `${route.laneCoverage}%`,
      sub: "of route mileage",
    },
    {
      label: "ACE status",
      value: route.aceStatus === "active" ? "Active" : "None",
      sub: route.aceSince ? `since ${route.aceSince}` : "no coverage",
      tone: route.aceStatus === "active" ? ("good" as const) : undefined,
    },
  ];
  return (
    <div className="grid grid-cols-5 gap-6 max-xl:grid-cols-3 max-md:grid-cols-2">
      {cells.map((cell, i) => {
        const color =
          cell.tone === "bad"
            ? "var(--bp-color-bad)"
            : cell.tone === "good"
              ? "var(--bp-color-good)"
              : "var(--bp-color-ink)";
        return (
          <div
            key={cell.label}
            className={
              i < 4
                ? "pr-[18px] shadow-[inset_-1px_0_0_var(--bp-color-rule)] max-xl:nth-3:shadow-none max-md:nth-2:shadow-none"
                : ""
            }
          >
            <div className="mb-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink-70)]">
              {cell.label}
            </div>
            <div className="flex items-baseline gap-1">
              <div
                className="font-mono text-[28px] font-semibold tabular-nums leading-none tracking-[-0.02em]"
                style={{ color }}
              >
                {cell.value}
              </div>
              {cell.unit ? (
                <div className="text-[11px] tracking-[0.03em] text-[var(--bp-color-ink-55)]">
                  {cell.unit}
                </div>
              ) : null}
              {cell.trend ? <div className="ml-auto">{cell.trend}</div> : null}
            </div>
            <div className="mt-[3px] text-[11px] text-[var(--bp-color-ink-55)]">{cell.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

function SlowSegmentsSection({
  routeSlug,
  segments,
  flaggedId,
}: {
  routeSlug: string;
  segments: readonly StudioSegment[];
  flaggedId?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(flaggedId ?? null);
  const [direction, setDirection] = useState<"all" | "NB" | "SB" | "EB" | "WB">("all");
  const visible = (
    direction === "all" ? segments : segments.filter((s) => s.direction === direction)
  ).slice(0, 5);

  return (
    <section>
      <SectionHeader
        title="Top slow segments by rider-hours lost"
        sub={`${segments.length} timepoint segments observed in March 2026. Hour strip shows severity by time of day.`}
        right={
          <div className="flex items-center gap-2">
            <Badge variant="accent">Mar 2026</Badge>
            <FilterChips
              ariaLabel="Direction filter"
              value={direction}
              onChange={setDirection}
              options={[
                { id: "all" as const, label: "All directions" },
                { id: "NB" as const, label: "NB" },
                { id: "SB" as const, label: "SB" },
              ]}
            />
            <span className="mx-1 h-4 w-px bg-[var(--bp-color-rule)]" />
            <Link
              to="/routes/$routeId/ladder"
              params={{ routeId: routeSlug }}
              className="text-[12px] font-semibold text-[var(--bp-color-accent)] no-underline"
            >
              View as ladder &rarr;
            </Link>
          </div>
        }
      />
      <div className="min-w-[760px]">
        <SegmentRowHeader />
        {visible.map((segment) => {
          const isOpen = openId === segment.id;
          return (
            <div key={segment.id}>
              <SegmentRow
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
                hasNote={Boolean(segment.aiNote)}
                noteOpen={isOpen && Boolean(segment.aiNote)}
                {...(segment.flagged ? { flag: "top" as const } : {})}
                {...(segment.aiNote
                  ? {
                      onClick: () => setOpenId((cur) => (cur === segment.id ? null : segment.id)),
                    }
                  : {})}
              />
              {isOpen && segment.aiNote ? (
                <div className="flex items-start gap-2 bg-[var(--bp-color-accent-bg)] px-3 py-[11px] shadow-[inset_0_-1px_0_oklch(0.88_0.07_252)]">
                  <span className="mt-[2px] shrink-0 font-mono text-[10px] font-bold text-[var(--bp-color-accent)]">
                    &#9670;
                  </span>
                  <p className="m-0 text-[12px] leading-[1.6] text-[var(--bp-color-ink-70)]">
                    {segment.aiNote}
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-[11.5px] text-[var(--bp-color-ink-55)]">
        Showing {visible.length} of {segments.length} timepoint segments.{" "}
        <Link
          to="/routes/$routeId/ladder"
          params={{ routeId: routeSlug }}
          className="font-semibold text-[var(--bp-color-accent)] no-underline"
        >
          Show all &rarr;
        </Link>
      </div>
    </section>
  );
}

function InterventionsSection({
  events,
}: {
  events: StudioRouteDetailResponse["route"]["interventions"];
}) {
  return (
    <section>
      <SectionHeader
        title="Intervention timeline"
        sub="Major changes to this route since 2010 that affect what its current speed numbers mean."
      />
      <InterventionTimeline events={events} />
    </section>
  );
}

function BeforeAfterSection() {
  const cards: {
    label: string;
    before: number;
    after: number;
    unit: string;
    max: number;
    inverse?: boolean;
  }[] = [
    { label: "Avg speed (PM peak)", before: 6.2, after: 6.9, unit: "mph", max: 8 },
    { label: "Slow-window share", before: 41, after: 33, unit: "% of hours", max: 50 },
    {
      label: "Violations / day",
      before: 1840,
      after: 590,
      unit: "incidents",
      max: 2000,
      inverse: true,
    },
  ];
  return (
    <section>
      <SectionHeader
        title="Before / after - ACE all-day rollout"
        sub="60-day windows comparing speed and violations on ACE-enforced segments only."
        right={<Badge variant="warn">Caveat: overlaps congestion pricing</Badge>}
      />
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        {cards.map((c) => {
          const better = c.inverse ? c.after < c.before : c.after > c.before;
          return (
            <div
              key={c.label}
              className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]"
            >
              <div className="text-[13px] font-semibold">{c.label}</div>
              <div className="mb-3 text-[11px] text-[var(--bp-color-ink-55)]">{c.unit}</div>
              <BeforeAfter before={c.before} after={c.after} max={c.max} />
              <div
                className="mt-3 rounded-[3px] px-2.5 py-1.5 text-[11px] font-semibold"
                style={{
                  background: better ? "var(--bp-color-good-bg)" : "var(--bp-color-bad-bg)",
                  color: better ? "var(--bp-color-good)" : "var(--bp-color-bad)",
                }}
              >
                {c.inverse
                  ? `${Math.round((1 - c.after / c.before) * 100)}% fewer than before`
                  : `+${(c.after - c.before).toFixed(1)} ${c.unit.split(" ")[0]} vs. before`}
              </div>
            </div>
          );
        })}
      </div>
      <Alert variant="warn" className="mt-4">
        <AlertTitle variant="warn">Causal attribution is not clean</AlertTitle>
        <AlertDescription>
          The 2025 ACE all-day rollout coincided with the introduction of CBD congestion pricing. We
          do not claim ACE alone produced the speed gain. On segments where neither intervention
          applies, the gain is not observed.
        </AlertDescription>
      </Alert>
    </section>
  );
}

function TreatmentStatusCard({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad";
  note: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[3px] bg-[var(--bp-color-card)] p-3.5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div>
        <div className="text-[13px] font-semibold">{label}</div>
        <div className="mt-1 text-[11.5px] leading-[1.35] text-[var(--bp-color-ink-55)]">
          {note}
        </div>
      </div>
      <Badge variant={tone}>{value}</Badge>
    </div>
  );
}

function RiderKpi({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "bad";
}) {
  return (
    <div className="p-5 shadow-[inset_-1px_0_0_var(--bp-color-rule)] last:shadow-none max-lg:shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
      <div className="mb-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink-70)]">
        {label}
      </div>
      <div
        className="font-mono text-[30px] font-semibold leading-none tracking-[-0.02em]"
        style={{ color: tone === "bad" ? "var(--bp-color-bad)" : "var(--bp-color-ink)" }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-[var(--bp-color-ink-55)]">{sub}</div>
    </div>
  );
}

function TreatmentDeepCard({
  title,
  status,
  tone,
  lines,
  gap,
}: {
  title: string;
  status: string;
  tone: "good" | "warn" | "bad";
  lines: readonly string[];
  gap: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[15px] font-semibold tracking-[-0.01em]">{title}</div>
        <Badge variant={tone}>{status}</Badge>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        {lines.map((line) => (
          <div
            key={line}
            className="flex gap-2 text-[12px] leading-[1.45] text-[var(--bp-color-ink-70)]"
          >
            <span className="mt-[5px] text-[8px] text-[var(--bp-color-ink-40)]">▸</span>
            <span>{line}</span>
          </div>
        ))}
      </div>
      <div
        className="rounded-[3px] px-2.5 py-2 text-[11px] font-semibold leading-[1.35]"
        style={{
          background:
            tone === "good"
              ? "var(--bp-color-good-bg)"
              : tone === "bad"
                ? "var(--bp-color-bad-bg)"
                : "var(--bp-color-warn-bg)",
          color:
            tone === "good"
              ? "var(--bp-color-good)"
              : tone === "bad"
                ? "var(--bp-color-bad)"
                : "var(--bp-color-warn)",
        }}
      >
        {gap}
      </div>
    </div>
  );
}

function DataWindow({
  label,
  value,
  sub,
  good = false,
}: {
  label: string;
  value: string;
  sub: string;
  good?: boolean;
}) {
  return (
    <div className="max-w-[280px]">
      <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <div className="font-mono text-[20px] font-semibold tracking-[-0.015em]">{value}</div>
        {good ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--bp-color-good)]" /> : null}
      </div>
      <div
        className="mt-0.5 text-[11px] leading-[1.35]"
        style={{ color: good ? "var(--bp-color-good)" : "var(--bp-color-ink-55)" }}
      >
        {sub}
      </div>
    </div>
  );
}

function RouteSpeedTrend({ data, scheduled }: { data: readonly number[]; scheduled: number }) {
  const width = 980;
  const height = 132;
  const padL = 34;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const lo = Math.floor(Math.min(...data, scheduled) - 0.5);
  const hi = Math.ceil(Math.max(...data, scheduled) + 0.5);
  const range = hi - lo || 1;
  const x = (index: number) =>
    padL + (index / Math.max(1, data.length - 1)) * (width - padL - padR);
  const y = (value: number) => padT + (1 - (value - lo) / range) * (height - padT - padB);
  const d = data
    .map(
      (value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`,
    )
    .join(" ");
  const area = `${d} L${x(data.length - 1).toFixed(1)},${height - padB} L${padL},${height - padB} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-[132px] w-full font-mono"
      aria-hidden="true"
    >
      {[lo, scheduled, hi].map((tick) => (
        <g key={tick}>
          <line
            x1={padL}
            x2={width - padR}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--bp-color-rule)"
            strokeDasharray={tick === scheduled ? "4 3" : undefined}
          />
          <text
            x={padL - 6}
            y={y(tick) + 3}
            fontSize="10"
            textAnchor="end"
            fill="var(--bp-color-ink-55)"
          >
            {tick.toFixed(1)}
          </text>
        </g>
      ))}
      <path d={area} fill="var(--bp-color-bad)" opacity="0.07" />
      <path
        d={d}
        fill="none"
        stroke="var(--bp-color-bad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((_, index) =>
        index % 2 === 0 ? (
          <text
            key={index}
            x={x(index)}
            y={height - 8}
            fontSize="9"
            textAnchor="middle"
            fill="var(--bp-color-ink-55)"
          >
            {index + 1}
          </text>
        ) : null,
      )}
      <circle
        cx={x(data.length - 1)}
        cy={y(data[data.length - 1] ?? scheduled)}
        r="4"
        fill="var(--bp-color-bad)"
      />
    </svg>
  );
}

function RouteBoardingsTrend({
  data,
  dailyRiders,
}: {
  data: readonly number[];
  dailyRiders: number;
}) {
  const base = dailyRiders / 1000;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const scaled = data.map((value) => base * (0.94 + ((value - min) / (max - min || 1)) * 0.12));
  return <RouteSpeedTrend data={scaled} scheduled={base} />;
}

function HourlyExposureBars({ data }: { data: readonly number[] }) {
  const width = 980;
  const height = 112;
  const padL = 28;
  const padR = 8;
  const padT = 12;
  const padB = 22;
  const max = Math.max(...data, 1);
  const cw = (width - padL - padR) / 24;
  const barMaxH = height - padT - padB;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-[112px] w-full font-mono"
      aria-hidden="true"
    >
      {data.slice(0, 24).map((value, index) => {
        const barHeight = (value / max) * barMaxH;
        const peak = (index >= 7 && index <= 9) || (index >= 16 && index <= 19);
        return (
          <rect
            key={`${index}-${value}`}
            x={padL + index * cw + 1.5}
            width={cw - 3}
            y={height - padB - barHeight}
            height={barHeight}
            fill={peak ? "var(--bp-color-bad)" : "var(--bp-color-ink-40)"}
            opacity={peak ? 0.72 : 0.42}
          />
        );
      })}
      {[0, 6, 12, 18].map((hour) => (
        <text
          key={hour}
          x={padL + hour * cw + cw / 2}
          y={height - 8}
          fontSize="10"
          textAnchor="middle"
          fill="var(--bp-color-ink-55)"
        >
          {hour}:00
        </text>
      ))}
    </svg>
  );
}

function averageHourlySeverity(segments: readonly StudioSegment[]): number[] {
  if (segments.length === 0) return Array.from({ length: 24 }, () => 0);
  return Array.from({ length: 24 }, (_, hour) => {
    const total = segments.reduce((sum, segment) => sum + (segment.hours[hour] ?? 0), 0);
    return total / segments.length;
  });
}

function averageHourlySpeed(
  route: StudioRouteDetailResponse["route"],
  segments: readonly StudioSegment[],
): number[] {
  const severity = averageHourlySeverity(segments);
  return severity.map((value) => Math.max(2, route.scheduledMph - value * 4.2));
}

function formatCompact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 0)}K`;
  return String(Math.round(value));
}

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"] as const;
  const v = n % 100;
  const suffix = suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0];
  return `${n}${suffix}`;
}
