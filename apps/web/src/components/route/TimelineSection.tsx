import type { ReactNode } from "react";
import { BeforeAfter } from "@/components/BeforeAfter";
import { ChartFrame } from "@/components/ChartFrame";
import { InterventionTimeline } from "@/components/InterventionTimeline";
import { routeHistorySpeedSeries, routeHistoryWindow } from "@/components/route/route-derived";
import { SectionHeader } from "@/components/SectionHeader";
import { SpeedTrend } from "@/components/SpeedTrend";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteDetailResponse, StudioRouteHistoryResponse } from "@/studio/api-contract";

export function TimelineSection({
  data,
  history,
}: {
  data: StudioRouteDetailResponse;
  history: StudioRouteHistoryResponse | null;
}) {
  const { route } = data;
  const historySpeeds = routeHistorySpeedSeries(history);
  const hasSpeedHistory = historySpeeds.length > 0;
  const speedTrendData = hasSpeedHistory ? historySpeeds : route.spark;
  return (
    <div className="flex flex-col gap-7">
      <InterventionHistory
        events={route.interventions}
        title="The corridor's history"
        sub={`${route.interventions.length} recorded changes on ${route.label}${route.sbs ? " SBS" : ""}. Read them in order alongside the speed trend.`}
        right={<TimelineLegend />}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_420px] items-start gap-6 max-xl:grid-cols-1">
        <ChartFrame
          title={hasSpeedHistory ? "Route speed history" : "Speed since recent changes"}
          source={
            hasSpeedHistory
              ? `Monthly average speed${routeHistoryWindow(history) ? `, ${routeHistoryWindow(history)}` : ""}.`
              : "Recent trend estimate; the dashed line is the schedule."
          }
          height={196}
          right={
            <Badge variant={route.weightedAvgSpeed < 6 ? "bad" : "warn"}>
              {hasSpeedHistory
                ? `${history?.coverage.speedMonthCount ?? speedTrendData.length} months`
                : `${route.weightedAvgSpeed.toFixed(1)} mph now`}
            </Badge>
          }
        >
          <SpeedTrend data={speedTrendData} scheduled={route.scheduledMph} height={196} />
        </ChartFrame>
        {route.slug === "m15-sbs" ? <BeforeAfterSection /> : <TimelineCaveat route={route} />}
      </div>
    </div>
  );
}

function InterventionHistory({
  events,
  title = "Intervention timeline",
  sub = "Major changes to this route that affect what its current speed numbers mean.",
  right,
}: {
  events: StudioRouteDetailResponse["route"]["interventions"];
  title?: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <section>
      <SectionHeader title={title} sub={sub} right={right} />
      <InterventionTimeline events={events} />
    </section>
  );
}

function TimelineLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--bp-color-ink-70)]">
      {[
        ["var(--bp-color-accent)", "Service / enforcement"],
        ["var(--bp-color-good)", "Measured improvement"],
        ["var(--bp-color-warn)", "Attribution caution"],
      ].map(([color, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
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

function TimelineCaveat({ route }: { route: StudioRouteDetailResponse["route"] }) {
  return (
    <Alert variant="info">
      <AlertTitle variant="info">Timeline interpretation</AlertTitle>
      <AlertDescription>
        {route.label} has {route.interventions.length} recorded changes. Read them as background,
        not proof that any single change moved the numbers, until before-and-after speeds are
        compared.
      </AlertDescription>
    </Alert>
  );
}
