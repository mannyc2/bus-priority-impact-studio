import { ChartFrame } from "@/components/ChartFrame";
import { HourExposure } from "@/components/HourExposure";
import {
  averageHourlySeverity,
  formatCompact,
  routeHistoryRidershipSeries,
  routeHistoryWindow,
} from "@/components/route/route-derived";
import { SectionHeader } from "@/components/SectionHeader";
import { SpeedTrend } from "@/components/SpeedTrend";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteDetailResponse, StudioRouteHistoryResponse } from "@/studio/api-contract";

export function RidersSection({
  data,
  history,
}: {
  data: StudioRouteDetailResponse;
  history: StudioRouteHistoryResponse | null;
}) {
  const { route, segments } = data;
  const topSegments = [...segments].sort((a, b) => b.riderHours - a.riderHours).slice(0, 6);
  const maxRiderHours = Math.max(...topSegments.map((s) => s.riderHours), 1);
  const hourlyExposure = averageHourlySeverity(segments);
  const ridershipHistory = routeHistoryRidershipSeries(history);
  const hasRidershipHistory = ridershipHistory.length > 0;

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

      <div className="grid grid-cols-2 items-start gap-5 max-xl:grid-cols-1">
        <ChartFrame
          title={hasRidershipHistory ? "Monthly ridership" : "Estimated daily riders"}
          source={
            hasRidershipHistory
              ? `Monthly ridership${routeHistoryWindow(history) ? `, ${routeHistoryWindow(history)}` : ""}.`
              : "Estimated from the route's current trend until monthly ridership is available."
          }
          height={148}
          right={
            hasRidershipHistory ? (
              <Badge variant="neutral">{history?.coverage.ridershipMonthCount ?? 0} months</Badge>
            ) : null
          }
        >
          <RouteBoardingsTrend
            data={hasRidershipHistory ? ridershipHistory : route.spark}
            dailyRiders={route.dailyRiders}
            mode={hasRidershipHistory ? "history" : "proxy"}
          />
        </ChartFrame>
        <div>
          <SectionHeader
            title="Top rider-impact segments"
            sub="Where riders lose the most time, by segment."
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
        source="When delays affect the most riders; red marks the AM and PM rush."
        height={112}
      >
        <HourExposure data={hourlyExposure} />
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

function RouteBoardingsTrend({
  data,
  dailyRiders,
  mode,
}: {
  data: readonly number[];
  dailyRiders: number;
  mode: "history" | "proxy";
}) {
  const base = dailyRiders / 1000;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const series =
    mode === "history"
      ? data
      : data.map((value) => base * (0.94 + ((value - min) / (max - min || 1)) * 0.12));
  return (
    <SpeedTrend
      data={series}
      scheduled={base}
      height={148}
      seriesLabel={mode === "history" ? "Monthly riders (K)" : "Riders (est. K)"}
      scheduledLabel="baseline"
      tone="var(--bp-color-accent)"
    />
  );
}
