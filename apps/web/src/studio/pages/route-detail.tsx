import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { AIDiagnosisStrip } from "@/components/AIDiagnosisStrip";
import { BeforeAfter } from "@/components/BeforeAfter";
import { FilterChips } from "@/components/FilterChips";
import { InterventionTimeline } from "@/components/InterventionTimeline";
import { RouteBadge } from "@/components/RouteBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { SegmentRow, SegmentRowHeader } from "@/components/SegmentRow";
import { Spark } from "@/components/Spark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
            <TabsContent value="overview" className="text-[var(--bp-color-ink-70)]">
              <p className="m-0 max-w-[760px] text-[13.5px] leading-[1.6]">{route.diagnosis}</p>
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
            <TabsContent value="riders" className="text-[var(--bp-color-ink-70)]">
              <p className="m-0 max-w-[760px] text-[13.5px] leading-[1.6]">
                Hourly ridership and segment-level rider-hour shares appear in the brief composer
                when this route is opened from a finding.
              </p>
            </TabsContent>
            <TabsContent value="interventions">
              <InterventionsSection events={route.interventions} />
            </TabsContent>
            <TabsContent value="data-notes" className="text-[var(--bp-color-ink-70)]">
              <p className="m-0 max-w-[760px] text-[13.5px] leading-[1.6]">
                Numbers on this page derive from public MTA segment speeds, NYC DOT lane geometry,
                and the MTA ACE program record. Full sourcing lives on the{" "}
                <Link to="/methods" className="text-[var(--bp-color-accent)] no-underline">
                  Methodology page
                </Link>
                .
              </p>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </StudioPage>
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

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"] as const;
  const v = n % 100;
  const suffix = suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0];
  return `${n}${suffix}`;
}
