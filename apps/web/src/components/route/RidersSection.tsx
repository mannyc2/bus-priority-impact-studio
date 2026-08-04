import type { ReactNode } from "react";
import { ChartFrame } from "@/components/ChartFrame";
import { riderImpactSummary } from "@/components/route/rider-impact-summary";
import {
  dossierMetricMonthCount,
  dossierMetricWindow,
  dossierRidershipSeries,
  formatCompact,
} from "@/components/route/route-derived";
import { useRouteHourlyProfile } from "@/components/route/route-detail-data";
import { latestPeakWindow } from "@/components/route/route-segment-explorer";
import { SectionCard } from "@/components/SectionCard";
import { SourceNote, type SourceNoteEntry } from "@/components/SourceNote";
import { SpeedTrend } from "@/components/SpeedTrend";
import { Badge } from "@/components/ui/badge";
import { WhenRidersRide } from "@/components/WhenRidersRide";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";

const KPI_GRID_COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
};

export function RidersSection({
  data,
  onOpenSegment,
}: {
  data: StudioRouteDetailResponse;
  /** Deep-links the KPI's segment into the Segments explorer (pins it). */
  onOpenSegment?: ((spineSegmentId: string | null) => void) | undefined;
}) {
  const { route, segments } = data;
  const summary = riderImpactSummary({ route, segments, dossier: data.dossier });
  const topSegment = summary.topSegment;
  const hourlyProfile = useRouteHourlyProfile(route.slug);
  const ridershipHistory = dossierRidershipSeries(data.dossier);
  const hasRidershipHistory = ridershipHistory.length > 0;
  const equityItems = routeEquityContextItems(data.equityContext);
  const showEquity = equityItems.length >= 2 && data.equityContext !== null;

  const aboutEntries: SourceNoteEntry[] = [
    summary.historyLabel === "current"
      ? { label: "Ridership shown from the current projection", detail: summary.historyDetail }
      : { label: `${summary.historyLabel} of monthly ridership`, detail: summary.historyDetail },
  ];
  if (hourlyProfile.status === "ready" && hourlyProfile.data.summary.latestMonth !== null) {
    aboutEntries.push({
      label: `Hourly boardings from the ${hourlyProfile.data.summary.latestMonth} route-hour profile.`,
    });
  }
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
    topSegment !== null
      ? {
          label: "Highest-impact segment",
          value: `${topSegment.from} to ${topSegment.to}`,
          sub: (
            <>
              {formatCompact(topSegment.riderHours)} rider-hrs/wkdy
              {onOpenSegment === undefined ? null : (
                <>
                  {" — "}
                  <button
                    type="button"
                    onClick={() => onOpenSegment(topSegment.spineSegmentId)}
                    className="font-semibold text-[var(--bp-color-accent)]"
                  >
                    Map ›
                  </button>
                </>
              )}
            </>
          ),
          tone: "neutral" as const,
          compact: true,
        }
      : null,
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
        <WhenRidersRideCard hourlyProfile={hourlyProfile} />
      </div>

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

/** Rider-grain replacement for the deleted "Top burden segments" duplicate
 * (plan 081 amendment item 2 / comp D7): real boardings by hour with the
 * busiest window flagged on the chart itself. On the sanctioned Recharts pair
 * since plan 126 — the hand-rolled divs carried browser-`title` tooltips no
 * other chart in the app uses. */
function WhenRidersRideCard({
  hourlyProfile,
}: {
  hourlyProfile: ReturnType<typeof useRouteHourlyProfile>;
}) {
  const hours = hourlyProfile.data?.hours ?? null;
  const boardings = hours?.map((hour) => hour.ridership ?? 0) ?? null;
  const hasBoardings = boardings?.some((value) => value > 0) ?? false;
  const peak = latestPeakWindow(hourlyProfile.data);
  const profileMonth = hourlyProfile.data?.summary.latestMonth ?? null;

  return (
    <ChartFrame
      title="When riders ride"
      source={`Boardings by hour${profileMonth === null ? "" : `, ${profileMonth}`}.`}
      height={148}
    >
      {hasBoardings && boardings !== null ? (
        <WhenRidersRide boardings={boardings} height={148} {...(peak === null ? {} : { peak })} />
      ) : (
        <div className="flex h-full min-h-[148px] items-center justify-center rounded-[3px] bg-[var(--bp-color-paper-deep)] px-4 text-center text-[12.5px] text-[var(--bp-color-ink-55)]">
          {hourlyProfile.status === "loading"
            ? "Loading hourly boardings."
            : "Hourly boardings are not attached yet."}
        </div>
      )}
    </ChartFrame>
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
  sub: ReactNode;
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
