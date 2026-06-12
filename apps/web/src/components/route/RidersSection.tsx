import { ChartFrame } from "@/components/ChartFrame";
import { HourExposure } from "@/components/HourExposure";
import {
  riderImpactInsightRows,
  riderImpactSummary,
} from "@/components/route/rider-impact-summary";
import {
  averageHourlySeverity,
  dossierMetricMonthCount,
  dossierMetricWindow,
  dossierRidershipSeries,
  formatCompact,
} from "@/components/route/route-derived";
import { safeInsightCaveats } from "@/components/route/route-insight-placement";
import { routeSectionQuestion } from "@/components/route/section-registry";
import { SectionHeader } from "@/components/SectionHeader";
import { SpeedTrend } from "@/components/SpeedTrend";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";

export function RidersSection({ data }: { data: StudioRouteDetailResponse }) {
  const { route, segments } = data;
  const capability = data.capability?.surfaces["ridership"] ?? null;
  const summary = riderImpactSummary({ route, segments, dossier: data.dossier, capability });
  const riderInsights = riderImpactInsightRows(data.insights);
  const topSegments = summary.topSegments;
  const maxRiderHours = Math.max(...topSegments.map((s) => s.riderHours), 1);
  const hourlyExposure = averageHourlySeverity(segments);
  const ridershipHistory = dossierRidershipSeries(data.dossier);
  const hasRidershipHistory = ridershipHistory.length > 0;

  return (
    <div className="flex flex-col gap-7">
      <SectionHeader title={routeSectionQuestion("riders")} sub={summary.sectionSubtitle} />
      <div className="grid grid-cols-3 rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)] max-lg:grid-cols-1">
        <RiderKpi
          label="Daily riders"
          value={summary.dailyRidersLabel}
          sub={summary.dailyRidersDetail}
        />
        <RiderKpi
          label="Rider-hour burden"
          value={summary.burdenLabel}
          sub={summary.burdenDetail}
          tone={route.riderHoursLost > 0 ? "bad" : "neutral"}
        />
        <RiderKpi
          label="Highest-impact segment"
          value={summary.topSegmentLabel}
          sub={summary.topSegmentDetail}
          tone={topSegments.length > 0 ? "bad" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-3 rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)] max-lg:grid-cols-1">
        <RiderEvidence
          label="Ridership evidence"
          value={summary.historyLabel}
          sub={summary.historyDetail}
        />
        <RiderEvidence label="Route trend" value={summary.trendLabel} sub={summary.trendDetail} />
        <RiderEvidence
          label="Top segment context"
          value={summary.topSegmentShareLabel}
          sub={summary.topSegmentDetail}
        />
      </div>

      <div className="grid grid-cols-2 items-start gap-5 max-xl:grid-cols-1">
        <ChartFrame
          title={hasRidershipHistory ? "Monthly ridership" : "Estimated daily riders"}
          source={
            hasRidershipHistory
              ? `Monthly riders${dossierMetricWindow(data.dossier?.ridership) ? `, ${dossierMetricWindow(data.dossier?.ridership)}` : ""}.`
              : "Estimated until monthly ridership is available."
          }
          height={148}
          right={
            hasRidershipHistory ? (
              <Badge variant="neutral">
                {dossierMetricMonthCount(data.dossier?.ridership)} months
              </Badge>
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
          <SectionHeader title="Top burden segments" sub="Where riders lose the most time." />
          <div className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
            {topSegments.length > 0 ? (
              topSegments.map((segment) => (
                <div
                  key={segment.id}
                  className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-4 px-4 py-3 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-[12.5px] font-medium">
                        {segment.from} to {segment.to}
                      </div>
                      {segment.flagged ? <Badge variant="bad">flagged</Badge> : null}
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
              ))
            ) : (
              <div className="px-4 py-3 text-[12.5px] text-[var(--bp-color-ink-55)]">
                No segment rider-hour burden is attached.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)] gap-5 max-xl:grid-cols-1">
        <ChartFrame
          title="Rider exposure by hour"
          source="Delay exposure by hour; red marks rush periods."
          height={112}
        >
          <HourExposure data={hourlyExposure} />
        </ChartFrame>
        <RiderInsightPanel insights={riderInsights} />
      </div>

      <Alert variant="info">
        <AlertTitle variant="info">Rider-hours</AlertTitle>
        <AlertDescription>
          A 1-minute delay for 1,000 riders is 16.7 rider-hours. This route loses{" "}
          {route.riderHoursLost.toLocaleString()} per weekday, so this tab ranks rider burden rather
          than bus slowness alone.
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
        className="font-mono text-[30px] font-semibold leading-none"
        style={{ color: tone === "bad" ? "var(--bp-color-bad)" : "var(--bp-color-ink)" }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-[var(--bp-color-ink-55)]">{sub}</div>
    </div>
  );
}

function RiderEvidence({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="p-4 shadow-[inset_-1px_0_0_var(--bp-color-rule)] last:shadow-none max-lg:shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
      <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
      <div className="font-mono text-[20px] font-semibold leading-none">{value}</div>
      <div className="mt-1.5 text-[11px] leading-[1.35] text-[var(--bp-color-ink-55)]">{sub}</div>
    </div>
  );
}

function RiderInsightPanel({ insights }: { insights: StudioRouteDetailResponse["insights"] }) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <SectionHeader
        title="Rider signals"
        sub={
          insights.length > 0
            ? "Public customer-journey context for this route."
            : "No public rider-impact insight yet."
        }
      />
      {insights.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          {insights.map((insight) => {
            const caveats = safeInsightCaveats(insight, 1);
            return (
              <div
                key={`${insight.detectorId}:${insight.scopeId ?? insight.title}`}
                className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-3 shadow-[0_0_0_1px_var(--bp-color-rule)]"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Badge variant={insight.severity === "high" ? "bad" : "neutral"}>
                    {insight.severity}
                  </Badge>
                </div>
                <div className="text-[12.5px] font-semibold">{insight.title}</div>
                <div className="mt-1 text-[11.5px] leading-[1.45] text-[var(--bp-color-ink-55)]">
                  {insight.shortText}
                </div>
                {caveats[0] ? (
                  <div className="mt-1.5 text-[11px] leading-[1.4] text-[var(--bp-color-ink-40)]">
                    {caveats[0]}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-[3px] bg-[var(--bp-color-paper-deep)] px-3 py-2.5 text-[12px] leading-[1.45] text-[var(--bp-color-ink-55)]">
          The rider-hour projection can be cited, but no customer-journey card has cleared the
          public gate.
        </div>
      )}
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
