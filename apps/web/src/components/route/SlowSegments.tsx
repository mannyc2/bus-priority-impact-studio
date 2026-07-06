import { useEffect, useMemo, useState } from "react";
import { ChartFrame } from "@/components/ChartFrame";
import { CorridorProfile } from "@/components/CorridorProfile";
import { FilterChips } from "@/components/FilterChips";
import { HourBars } from "@/components/HourBars";
import { RPubSlowCard } from "@/components/route/RoutePublicAtoms";
import { averageHourlySpeed } from "@/components/route/route-derived";
import {
  insightTargetsSegment,
  routeInsightPlacements,
  safeInsightCaveats,
} from "@/components/route/route-insight-placement";
import { SegmentCarpet } from "@/components/route/SegmentCarpet";
import { routeSectionTitle } from "@/components/route/section-registry";
import { buildSegmentCarpetModel } from "@/components/route/segment-carpet-data";
import {
  type WhereWhenSummary,
  whereWhenSegmentBadge,
  whereWhenSummary,
} from "@/components/route/where-when-summary";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/ui/badge";
import { fetchStudioRouteHourlyProfile, fetchStudioRouteSpeedHistory } from "@/studio/api-client";
import type {
  RouteDossierSummaryForDetail,
  StudioRouteDetailResponse,
  StudioRouteHourlyProfilePeakWindow,
  StudioRouteHourlyProfileResponse,
  StudioRouteHourlyProfileSlowestWindow,
  StudioRouteInsight,
  StudioRouteSpeedHistoryResponse,
  StudioSegment,
} from "@/studio/api-contract";

type SegmentIdentity = {
  id: string;
};

type RouteSpeedHistoryState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: StudioRouteSpeedHistoryResponse }
  | { status: "unavailable"; data: null };

type RouteHourlyProfileState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: StudioRouteHourlyProfileResponse }
  | { status: "unavailable"; data: null };

export function prioritizeWhereWhenSegments<T extends SegmentIdentity>(
  insightSegments: readonly T[],
  fallbackSegments: readonly T[],
): T[] {
  return [
    ...new Map(
      [...insightSegments, ...fallbackSegments].map((segment) => [segment.id, segment] as const),
    ).values(),
  ];
}

export function SlowSegmentsSection({
  route,
  segments,
  insights,
  flaggedId,
  dossier,
  peakWindows,
  slowestWindows,
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
  insights: readonly StudioRouteInsight[];
  flaggedId?: string;
  dossier?: RouteDossierSummaryForDetail | null;
  peakWindows?: readonly StudioRouteHourlyProfilePeakWindow[];
  slowestWindows?: readonly StudioRouteHourlyProfileSlowestWindow[];
}) {
  const [direction, setDirection] = useState<"all" | "NB" | "SB" | "EB" | "WB">("all");
  const segmentHourProfile = averageHourlySpeed(route, segments);
  const summary = whereWhenSummary({ route, segments, dossier: dossier ?? null });
  const hourlyProfile = useRouteHourlyProfile(route.slug);
  const speedHistory = useRouteSpeedHistory(route.slug);
  const hourProfile = useMemo(
    () => chartHoursFromHourlyProfile(hourlyProfile.data, segmentHourProfile),
    [hourlyProfile.data, segmentHourProfile],
  );
  const carpetModel = useMemo(
    () => buildSegmentCarpetModel(speedHistory.data, segments),
    [speedHistory.data, segments],
  );
  const carpetSource = carpetSourceLabel(
    speedHistory,
    carpetModel.months.length,
    carpetModel.rows.length,
  );

  const mapInsights = routeInsightPlacements(insights).mapSegment;
  const segmentInsight = (segment: StudioSegment) =>
    mapInsights.find((insight) => insightTargetsSegment(insight, segment.id)) ?? null;
  const directionSegments =
    direction === "all" ? segments : segments.filter((segment) => segment.direction === direction);
  const topVisible = directionSegments.slice(0, 5);
  const matchedInsightSegments = directionSegments.filter((segment) => segmentInsight(segment));
  const visible = prioritizeWhereWhenSegments(
    [
      ...directionSegments.filter((segment) => segment.id === dossier?.worstSegment?.segmentId),
      ...matchedInsightSegments,
    ],
    topVisible,
  );
  const featured = visible.slice(0, 3);
  const routeMedianMph = medianSegmentSpeed(directionSegments);

  return (
    <section className="flex flex-col gap-5">
      <SectionHeader
        title={routeSectionTitle("where-when")}
        sub={summary.sectionSubtitle}
        right={
          <div className="flex items-center gap-2">
            <FilterChips
              ariaLabel="Direction"
              value={direction}
              onChange={setDirection}
              options={[
                { id: "all" as const, label: "All" },
                { id: "NB" as const, label: "NB" },
                { id: "SB" as const, label: "SB" },
              ]}
            />
          </div>
        }
      />
      {featured.length > 0 ? (
        <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-1">
          {featured.map((segment, index) => (
            <RPubSlowCard
              key={segment.id}
              segment={segment}
              routeMedianMph={routeMedianMph}
              badge={whereWhenSegmentBadge({ segment, dossier: dossier ?? null })}
              rank={index + 1}
              note={
                segmentInsight(segment) ? (
                  <SegmentInsightNote insight={segmentInsight(segment) as StudioRouteInsight} />
                ) : segment.aiNote ? (
                  <p className="m-0 text-[12px] leading-[1.55] text-[var(--bp-color-ink-70)]">
                    {segment.aiNote}
                  </p>
                ) : null
              }
            />
          ))}
        </div>
      ) : null}
      <WhereWhenSummaryCards summary={summary} />
      <WhereWhenWindowChips
        hourlyProfile={hourlyProfile.data}
        peakWindows={peakWindows ?? []}
        slowestWindows={slowestWindows ?? []}
      />
      <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(300px,0.8fr)] gap-5 max-xl:grid-cols-1">
        <div className="rounded-[3px] bg-[var(--bp-color-card)] px-5 py-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <SectionHeader title="Profile" />
          <CorridorProfile route={route} segments={segments} highlightId={flaggedId} />
        </div>
        <ChartFrame title="By hour" height={164} source={hourProfileSource(hourlyProfile)}>
          {hourProfile === null ? (
            <div className="flex h-full min-h-[164px] items-center justify-center rounded-[3px] bg-[var(--bp-color-paper-deep)] px-4 text-center text-[12.5px] text-[var(--bp-color-ink-55)]">
              Route hourly profile is not attached yet.
            </div>
          ) : (
            <HourBars
              data={hourProfile}
              {...(route.scheduledMph === null ? {} : { sched: route.scheduledMph })}
              height={164}
              min={Math.max(0, Math.floor(Math.min(...hourProfile) - 1))}
              max={Math.ceil(
                Math.max(
                  ...(route.scheduledMph === null ? [] : [route.scheduledMph]),
                  ...hourProfile,
                ) + 1,
              )}
              legend
            />
          )}
        </ChartFrame>
      </div>
      <ChartFrame
        title="Segment history"
        height={320}
        {...(carpetSource ? { source: carpetSource } : {})}
        right={
          <Badge variant={speedHistory.status === "ready" ? "neutral" : "warn"}>
            {speedHistory.status === "ready"
              ? (carpetModel.latestMonth ?? "ready")
              : speedHistory.status}
          </Badge>
        }
      >
        {speedHistory.status === "loading" ? (
          <div
            className="h-[300px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]"
            aria-hidden
          />
        ) : (
          <SegmentCarpet model={carpetModel} />
        )}
      </ChartFrame>
      <div className="mt-3 text-[11.5px] text-[var(--bp-color-ink-55)]">
        {featured.length} of {segments.length} segments highlighted.
      </div>
    </section>
  );
}

function useRouteHourlyProfile(routeSlug: string): RouteHourlyProfileState {
  const [state, setState] = useState<RouteHourlyProfileState>({ status: "loading", data: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", data: null });
    fetchStudioRouteHourlyProfile(routeSlug, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState(data === null ? { status: "unavailable", data: null } : { status: "ready", data });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: "unavailable", data: null });
      });

    return () => controller.abort();
  }, [routeSlug]);

  return state;
}

function useRouteSpeedHistory(routeSlug: string): RouteSpeedHistoryState {
  const [state, setState] = useState<RouteSpeedHistoryState>({ status: "loading", data: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", data: null });
    fetchStudioRouteSpeedHistory(routeSlug, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState(data === null ? { status: "unavailable", data: null } : { status: "ready", data });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: "unavailable", data: null });
      });

    return () => controller.abort();
  }, [routeSlug]);

  return state;
}

function chartHoursFromHourlyProfile(
  profile: StudioRouteHourlyProfileResponse | null,
  fallback: readonly number[] | null,
): number[] | null {
  if (profile === null) return fallback === null ? null : [...fallback];
  return profile.hours.map((hour, index) => hour.averageSpeedMph ?? fallback?.[index] ?? 0);
}

function hourProfileSource(state: RouteHourlyProfileState): string {
  if (state.status === "loading") return "Loading route hourly profile.";
  if (state.status === "unavailable") return "Route hourly profile unavailable.";
  return `${state.data.summary.latestMonth ?? "latest"} route-hour profile`;
}

function carpetSourceLabel(
  state: RouteSpeedHistoryState,
  monthCount: number,
  segmentCount: number,
): string | undefined {
  if (state.status === "loading") return "Loading speed history.";
  if (state.status === "unavailable") return "Speed history unavailable.";
  return `${monthCount} months / ${segmentCount} segments`;
}

function latestWindows<T extends { month: string }>(rows: readonly T[], limit = 3): T[] {
  return [...rows].sort((left, right) => right.month.localeCompare(left.month)).slice(0, limit);
}

function WhereWhenWindowChips({
  hourlyProfile,
  peakWindows,
  slowestWindows,
}: {
  hourlyProfile: StudioRouteHourlyProfileResponse | null;
  peakWindows: readonly StudioRouteHourlyProfilePeakWindow[];
  slowestWindows: readonly StudioRouteHourlyProfileSlowestWindow[];
}) {
  const peaks = latestWindows(
    hourlyProfile?.peakWindows.length ? hourlyProfile.peakWindows : peakWindows,
    2,
  );
  const slowest = latestWindows(
    hourlyProfile?.slowestWindows.length ? hourlyProfile.slowestWindows : slowestWindows,
    2,
  );
  const chips = [
    ...peaks.map((window) => ({
      id: `peak:${window.month}:${window.dayOfWeek}:${window.hourOfDay}`,
      label: "Peak",
      value: `${window.dayOfWeek} ${formatHour(window.hourOfDay)}`,
      sub:
        window.ridership === null
          ? window.month
          : `${compactWindowNumber(window.ridership)} riders`,
    })),
    ...slowest.map((window) => ({
      id: `slow:${window.month}:${window.dayOfWeek}:${window.hourOfDay}`,
      label: "Slowest",
      value: `${window.dayOfWeek} ${formatHour(window.hourOfDay)}`,
      sub:
        window.weightedAverageSpeedMph === null
          ? window.month
          : `${window.weightedAverageSpeedMph.toFixed(1)} mph`,
    })),
  ];
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <div
          key={chip.id}
          className="min-h-[34px] rounded-[3px] bg-[var(--bp-color-paper-deep)] px-3 py-2 shadow-[0_0_0_1px_var(--bp-color-rule)]"
        >
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            {chip.label}
          </span>
          <span className="ml-2 text-[12px] font-semibold text-[var(--bp-color-ink)]">
            {chip.value}
          </span>
          <span className="ml-2 text-[11px] text-[var(--bp-color-ink-55)]">{chip.sub}</span>
        </div>
      ))}
    </div>
  );
}

function formatHour(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}

function compactWindowNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function WhereWhenSummaryCards({ summary }: { summary: WhereWhenSummary }) {
  return (
    <div className="grid grid-cols-4 rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)] max-xl:grid-cols-2 max-sm:grid-cols-1">
      <WhereWhenStat label="Speed" value={summary.currentSpeedLabel} sub={summary.peerLabel} />
      <WhereWhenStat
        label="Trend"
        value={summary.movementLabel}
        sub={summary.movementDetail}
        tone={summary.movementTone}
      />
      <WhereWhenStat label="Window" value={summary.windowLabel} sub={summary.coverageLabel} />
      <WhereWhenStat
        label="Worst"
        value={summary.worstSegmentLabel}
        sub={summary.worstSegmentDetail}
      />
    </div>
  );
}

function WhereWhenStat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: WhereWhenSummary["movementTone"];
}) {
  const color =
    tone === "bad"
      ? "var(--bp-color-bad)"
      : tone === "good"
        ? "var(--bp-color-good)"
        : "var(--bp-color-ink)";
  return (
    <div className="min-w-0 p-4 shadow-[inset_-1px_0_0_var(--bp-color-rule)] last:shadow-none max-xl:nth-2:shadow-none max-sm:shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
        {label}
      </div>
      <div
        className="mt-1 truncate font-mono text-[20px] font-semibold leading-tight"
        style={{ color }}
      >
        {value}
      </div>
      <div className="mt-1 text-[11.5px] leading-[1.4] text-[var(--bp-color-ink-55)]">{sub}</div>
    </div>
  );
}

function SegmentInsightNote({ insight }: { insight: StudioRouteInsight }) {
  const caveats = safeInsightCaveats(insight, 2);
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-accent-bg)] px-3 py-2 text-[12px] leading-[1.5] text-[var(--bp-color-ink-70)]">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-accent)]">
        Note
      </span>
      <span className="mt-1 block">
        {insight.shortText}
        {caveats.length > 0 ? (
          <span className="text-[var(--bp-color-ink-55)]"> {caveats.slice(0, 2).join(" ")}</span>
        ) : null}
      </span>
    </div>
  );
}

function medianSegmentSpeed(segments: readonly StudioSegment[]): number | null {
  const speeds = segments
    .map((segment) => segment.speedMph)
    .filter((speed) => Number.isFinite(speed) && speed > 0)
    .toSorted((left, right) => left - right);
  if (speeds.length === 0) return null;
  const mid = Math.floor(speeds.length / 2);
  if (speeds.length % 2 === 1) return speeds[mid] ?? null;
  const left = speeds[mid - 1];
  const right = speeds[mid];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}
