import { ChartFrame } from "@/components/ChartFrame";
import { HourExposure } from "@/components/HourExposure";
import { riderImpactSummary } from "@/components/route/rider-impact-summary";
import {
  averageHourlySeverity,
  dossierMetricMonthCount,
  dossierMetricWindow,
  dossierRidershipSeries,
  formatCompact,
} from "@/components/route/route-derived";
import { SectionCard } from "@/components/SectionCard";
import { SourceNote, type SourceNoteEntry } from "@/components/SourceNote";
import { SpeedTrend } from "@/components/SpeedTrend";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";

const KPI_GRID_COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
};

export function RidersSection({ data }: { data: StudioRouteDetailResponse }) {
  const { route, segments } = data;
  // biome-ignore lint/complexity/useLiteralKeys: surfaces is index-signature typed.
  const capability = data.capability?.surfaces["ridership"] ?? null;
  const summary = riderImpactSummary({ route, segments, dossier: data.dossier, capability });
  const topSegments = summary.topSegments;
  const topSegment = topSegments[0] ?? null;
  const maxRiderHours = Math.max(...topSegments.map((s) => s.riderHours), 1);
  const hourlyExposure = averageHourlySeverity(segments);
  const ridershipHistory = dossierRidershipSeries(data.dossier);
  const hasRidershipHistory = ridershipHistory.length > 0;
  const equityItems = routeEquityContextItems(data.equityContext);
  const showEquity = equityItems.length >= 2 && data.equityContext !== null;

  const aboutEntries: SourceNoteEntry[] = [
    summary.historyLabel === "current"
      ? { label: "Ridership shown from the current projection", detail: summary.historyDetail }
      : { label: `${summary.historyLabel} of monthly ridership`, detail: summary.historyDetail },
  ];
  if (showEquity && data.equityContext !== null) {
    aboutEntries.push({
      label: `ACS ${data.equityContext.acsYear} five-year estimates${
        data.equityContext.assignedCountyName ? `, ${data.equityContext.assignedCountyName}` : ""
      }`,
      detail: "County-level census context, not route-level.",
    });
  }
  if (route.riderHoursLost !== null) {
    aboutEntries.push({
      label: "Rider-hours: a 1-minute delay for 1,000 riders is 16.7 rider-hours.",
      detail: `This route loses ${route.riderHoursLost.toLocaleString()} rider-hours per weekday, so this tab ranks rider burden rather than bus slowness alone.`,
    });
  }

  const kpiTiles = [
    {
      label: "Daily riders",
      value: summary.dailyRidersLabel,
      sub:
        summary.trendLabel === "not measured"
          ? "average weekday boardings"
          : summary.dailyRidersDetail,
      tone: "neutral" as const,
    },
    route.riderHoursLost !== null
      ? {
          label: "Rider-hour burden",
          value: summary.burdenLabel,
          sub: summary.burdenDetail,
          tone: route.riderHoursLost > 0 ? ("bad" as const) : ("neutral" as const),
        }
      : null,
    {
      label: "Highest-impact segment",
      value: topSegment === null ? "n/a" : `${topSegment.from} to ${topSegment.to}`,
      sub: topSegment === null ? "no segment data" : "riders here lose the most time per weekday",
      tone: topSegment === null ? ("neutral" as const) : ("bad" as const),
      compact: true,
    },
  ].filter((tile) => tile !== null);

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Riders"
        sub="Who this route carries and where they lose time."
        right={<SourceNote label="About this data" entries={aboutEntries} />}
      >
        <div
          className={`grid ${KPI_GRID_COLS[kpiTiles.length] ?? "grid-cols-3"} rounded-[3px] shadow-[0_0_0_1px_var(--bp-color-rule)] max-lg:grid-cols-1`}
        >
          {kpiTiles.map((tile) => (
            <RiderKpi key={tile.label} {...tile} />
          ))}
        </div>
      </SectionCard>

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
          {hasRidershipHistory ? (
            <RouteBoardingsTrend data={ridershipHistory} dailyRiders={route.dailyRiders} />
          ) : (
            <div className="flex h-full min-h-[148px] items-center justify-center rounded-[3px] bg-[var(--bp-color-paper-deep)] px-4 text-center text-[12.5px] text-[var(--bp-color-ink-55)]">
              Monthly ridership history is not attached yet.
            </div>
          )}
        </ChartFrame>
        <SectionCard
          title="Top burden segments"
          sub="Where riders lose the most time."
          bodyClassName="min-w-0 -mx-[18px] -mb-[18px]"
        >
          {topSegments.length > 0 ? (
            topSegments.map((segment) => (
              <div
                key={segment.id}
                className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-4 px-[18px] py-3 shadow-[inset_0_1px_0_var(--bp-color-rule)]"
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
            <div className="px-[18px] py-3 text-[12.5px] text-[var(--bp-color-ink-55)]">
              No segment rider-hour burden is attached.
            </div>
          )}
        </SectionCard>
      </div>

      <ChartFrame
        title="Rider exposure by hour"
        source="Delay exposure by hour; red marks rush periods."
        height={112}
      >
        <HourExposure data={hourlyExposure} />
      </ChartFrame>

      {showEquity ? (
        <SectionCard
          title="Who rides here"
          sub="Census context for the neighborhoods this route serves."
        >
          <div className="flex flex-wrap border-y border-[var(--bp-color-rule)] py-3">
            {equityItems.map((item) => (
              <div
                key={item.label}
                className="min-w-[160px] flex-1 border-l border-[var(--bp-color-rule)] px-4 first:border-l-0 first:pl-0 max-md:basis-1/2 max-md:[&:nth-child(odd)]:border-l-0 max-md:[&:nth-child(odd)]:pl-0"
              >
                <div className="font-mono text-[10px] font-semibold uppercase tracking-normal text-[var(--bp-color-ink-55)]">
                  {item.label}
                </div>
                <div className="mt-1 font-mono text-[21px] font-semibold leading-none tabular-nums">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

type RouteEquityContextItem = {
  label: string;
  value: string;
};

export function routeEquityContextItems(
  equityContext: StudioRouteDetailResponse["equityContext"],
): RouteEquityContextItem[] {
  if (equityContext === null) return [];
  return [
    equityContext.noVehicleHouseholdShare === null
      ? null
      : {
          label: "No-vehicle households",
          value: formatShare(equityContext.noVehicleHouseholdShare),
        },
    equityContext.medianHouseholdIncome === null
      ? null
      : {
          label: "Median HH income",
          value: `$${formatCompact(equityContext.medianHouseholdIncome)}`,
        },
    equityContext.povertyRate === null
      ? null
      : {
          label: "Poverty rate",
          value: formatShare(equityContext.povertyRate),
        },
    equityContext.publicTransitCommuterShare === null
      ? null
      : {
          label: "Transit commuters",
          value: formatShare(equityContext.publicTransitCommuterShare),
        },
  ].filter((item): item is RouteEquityContextItem => item !== null);
}

function formatShare(value: number): string {
  const percent = value <= 1 ? value * 100 : value;
  return `${Math.round(percent)}%`;
}

function RiderKpi({
  label,
  value,
  sub,
  tone = "neutral",
  compact = false,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "bad";
  compact?: boolean;
}) {
  return (
    <div className="p-5 shadow-[inset_-1px_0_0_var(--bp-color-rule)] last:shadow-none max-lg:shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
      <div className="mb-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink-70)]">
        {label}
      </div>
      <div
        className={`font-mono font-semibold ${compact ? "text-[17px] leading-tight" : "text-[30px] leading-none"}`}
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
}: {
  data: readonly number[];
  dailyRiders: number;
}) {
  return (
    <SpeedTrend
      data={data}
      scheduled={dailyRiders / 1000}
      height={148}
      seriesLabel="Monthly riders (K)"
      scheduledLabel="baseline"
      tone="var(--bp-color-accent)"
    />
  );
}
