import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { FilterChips } from "@/components/FilterChips";
import { HourBars } from "@/components/HourBars";
import { averageHourlySpeed } from "@/components/route/route-derived";
import {
  insightTargetsSegment,
  routeInsightPlacements,
  safeInsightCaveats,
} from "@/components/route/route-insight-placement";
import {
  formatMonthLabel,
  type SegmentHistorySeries,
  segmentHistorySeries,
} from "@/components/route/segment-history-data";
import { whereWhenSegmentBadge } from "@/components/route/where-when-summary";
import { SectionCard } from "@/components/SectionCard";
import { SegmentRow, SegmentRowHeader } from "@/components/SegmentRow";
import { SourceNote, type SourceNoteEntry } from "@/components/SourceNote";
import { Spark } from "@/components/Spark";
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

type DirectionFilter = "all" | "NB" | "SB" | "EB" | "WB";

type RouteSpeedHistoryState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: StudioRouteSpeedHistoryResponse }
  | { status: "unavailable"; data: null };

type RouteHourlyProfileState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: StudioRouteHourlyProfileResponse }
  | { status: "unavailable"; data: null };

/** Ranked slow-segment ordering: rider-hours lost per weekday, desc, within the
 * active direction filter. Exported so the ordering is unit-tested directly. */
export function rankSlowSegments<T extends { id: string; direction: string; riderHours: number }>(
  segments: readonly T[],
  direction: DirectionFilter,
): T[] {
  const filtered =
    direction === "all" ? segments : segments.filter((segment) => segment.direction === direction);
  return [...filtered].sort((left, right) => right.riderHours - left.riderHours);
}

export function SlowSegmentsSection({
  route,
  segments,
  insights,
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
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const segmentHourProfile = averageHourlySpeed(route, segments);
  const hourlyProfile = useRouteHourlyProfile(route.slug);
  const speedHistory = useRouteSpeedHistory(route.slug);
  const hourProfile = useMemo(
    () => chartHoursFromHourlyProfile(hourlyProfile.data, segmentHourProfile),
    [hourlyProfile.data, segmentHourProfile],
  );
  const historySeries = useMemo(
    () => segmentHistorySeries(speedHistory.data, segments),
    [speedHistory.data, segments],
  );

  const mapInsights = routeInsightPlacements(insights).mapSegment;
  const segmentInsight = (segment: StudioSegment) =>
    mapInsights.find((insight) => insightTargetsSegment(insight, segment.id)) ?? null;

  const ranked = rankSlowSegments(segments, direction);
  const topId = ranked[0]?.id ?? null;
  const visible = showAll ? ranked : ranked.slice(0, 8);
  const aboutEntries = slowSegmentsAboutEntries(segments.length, speedHistory, hourlyProfile);

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Where the route loses time"
        sub="Timepoint segments ranked by rider-hours lost per weekday."
        right={
          <div className="flex items-center gap-3">
            <FilterChips
              ariaLabel="Direction"
              value={direction}
              onChange={(next) => {
                setDirection(next);
                setShowAll(false);
                setOpenId(null);
              }}
              options={[
                { id: "all" as const, label: "All" },
                { id: "NB" as const, label: "NB" },
                { id: "SB" as const, label: "SB" },
              ]}
            />
            <SourceNote label="About this data" entries={aboutEntries} />
          </div>
        }
      >
        {ranked.length === 0 ? (
          <p className="m-0 py-6 text-center text-[12.5px] text-[var(--bp-color-ink-55)]">
            No timepoint segments match this direction.
          </p>
        ) : (
          <>
            <SegmentRowHeader />
            {visible.map((segment) => {
              const insight = segmentInsight(segment);
              const badge = whereWhenSegmentBadge({ segment, dossier: dossier ?? null });
              const note = insight ? (
                <SegmentInsightNote insight={insight} />
              ) : segment.aiNote ? (
                <p className="m-0 text-[12px] leading-[1.55] text-[var(--bp-color-ink-70)]">
                  {segment.aiNote}
                </p>
              ) : null;
              const open = openId === segment.id;
              return (
                <Fragment key={segment.id}>
                  <SegmentRow
                    dir={segment.direction}
                    from={segment.from}
                    to={segment.to}
                    mph={segment.speedMph}
                    {...(segment.scheduledMph === null ? {} : { sched: segment.scheduledMph })}
                    riderHours={Math.round(segment.riderHours)}
                    hours={segment.hours}
                    lane={segment.lane}
                    ace={segment.ace}
                    tsp={segment.tsp}
                    {...(segment.id === topId ? { flag: "top" as const } : {})}
                    hasNote={note !== null || badge !== null}
                    noteOpen={open}
                    onClick={() => setOpenId(open ? null : segment.id)}
                  />
                  {open ? (
                    <SegmentDetail
                      badge={badge}
                      note={note}
                      series={historySeries.get(segment.id) ?? null}
                      historyStatus={speedHistory.status}
                    />
                  ) : null}
                </Fragment>
              );
            })}
            {ranked.length > 8 ? (
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                className="mt-1 w-full rounded-[3px] px-3 py-2.5 text-[12px] font-semibold text-[var(--bp-color-ink-55)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)] transition-colors hover:text-[var(--bp-color-ink)]"
              >
                {showAll ? "Show fewer segments" : `Show all ${ranked.length} segments`}
              </button>
            ) : null}
          </>
        )}
      </SectionCard>

      <SectionCard title="Speed by hour" sub={hourProfileSource(hourlyProfile)}>
        <div className="flex flex-col gap-3">
          <WhereWhenWindowChips
            hourlyProfile={hourlyProfile.data}
            peakWindows={peakWindows ?? []}
            slowestWindows={slowestWindows ?? []}
          />
          {hourProfile === null ? (
            <div className="flex h-[164px] items-center justify-center rounded-[3px] bg-[var(--bp-color-paper-deep)] px-4 text-center text-[12.5px] text-[var(--bp-color-ink-55)]">
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
        </div>
      </SectionCard>
    </div>
  );
}

function SegmentDetail({
  badge,
  note,
  series,
  historyStatus,
}: {
  badge: string | null;
  note: ReactNode;
  series: SegmentHistorySeries | null;
  historyStatus: RouteSpeedHistoryState["status"];
}) {
  return (
    <div className="bg-[var(--bp-color-accent-bg)] px-3 pb-4 pt-2 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
      <div className="flex flex-col gap-3 md:ml-7">
        {badge ? (
          <div>
            <Badge variant="bad">{badge}</Badge>
          </div>
        ) : null}
        {note}
        <SegmentSparkline series={series} historyStatus={historyStatus} />
      </div>
    </div>
  );
}

function SegmentSparkline({
  series,
  historyStatus,
}: {
  series: SegmentHistorySeries | null;
  historyStatus: RouteSpeedHistoryState["status"];
}) {
  if (historyStatus === "loading") {
    return (
      <div
        className="h-[36px] w-[220px] animate-pulse rounded-[2px] bg-[var(--bp-color-ink-06)]"
        aria-hidden
      />
    );
  }
  const points = series?.speeds.filter((speed): speed is number => speed !== null) ?? [];
  if (series === null || points.length < 2) {
    return (
      <p className="m-0 text-[11.5px] text-[var(--bp-color-ink-55)]">
        No month history for this segment.
      </p>
    );
  }
  const first = series.months[0];
  const last = series.months.at(-1);
  const label =
    first !== undefined && last !== undefined
      ? `${formatMonthLabel(first)} – ${formatMonthLabel(last)}`
      : null;
  return (
    <div className="flex items-center gap-3">
      <Spark data={points} width={220} height={36} fill />
      {label ? (
        <span className="font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">{label}</span>
      ) : null}
    </div>
  );
}

function slowSegmentsAboutEntries(
  segmentCount: number,
  speedHistory: RouteSpeedHistoryState,
  hourlyProfile: RouteHourlyProfileState,
): SourceNoteEntry[] {
  const entries: SourceNoteEntry[] = [
    { label: `${segmentCount} timepoint ${segmentCount === 1 ? "segment" : "segments"}` },
  ];
  if (speedHistory.status === "ready") {
    const months = speedHistory.data.dimensions.months;
    const first = months[0];
    const last = months.at(-1);
    const window =
      first !== undefined && last !== undefined
        ? ` (${formatMonthLabel(first)}–${formatMonthLabel(last)})`
        : "";
    entries.push({
      label: `${months.length} ${months.length === 1 ? "month" : "months"} of segment speed history${window}`,
    });
  }
  if (hourlyProfile.status === "ready" && hourlyProfile.data.summary.latestMonth !== null) {
    entries.push({
      label: `${formatMonthLabel(hourlyProfile.data.summary.latestMonth)} hourly profile`,
    });
  }
  return entries;
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
