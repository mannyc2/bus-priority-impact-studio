import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { FilterChips } from "@/components/FilterChips";
import { HourBars } from "@/components/HourBars";
import { averageHourlySpeed } from "@/components/route/route-derived";
import {
  chartHoursFromHourlyProfile,
  hourProfileSource,
  type RouteSpeedHistoryState,
  useRouteHourlyProfile,
  useRouteSpeedHistory,
} from "@/components/route/route-detail-data";
import type { RouteFactEvidenceState } from "@/components/route/route-fact-evidence";
import {
  canonicalizeRouteDetailSearch,
  coverageThroughLabel,
  deltaBarShare,
  directionOptions,
  EXPLORER_COLLAPSED_ROW_COUNT,
  type ExplorerDaypart,
  type ExplorerDirection,
  latestSlowestWindow,
  type RouteDetailSearch,
  rankSegmentsSlowestFirst,
  resolvePinnedSegment,
  routeDetailSearchEquals,
  SEGMENT_LANE_TAG,
  segmentCarriesLaneTag,
  visibleSegments,
} from "@/components/route/route-segment-explorer";
import { formatMonthLabel, historicalSegmentValues } from "@/components/route/segment-history-data";
import { useRouteFactEvidence } from "@/components/route/use-route-fact-evidence";
import { SectionCard } from "@/components/SectionCard";
import { SourceNote, type SourceNoteEntry } from "@/components/SourceNote";
import type { StudioRouteDetailResponse, StudioSegment } from "@/studio/api-contract";

const SPEED_BAND = (mph: number | null): string =>
  mph === null
    ? "var(--bp-color-ink-40)"
    : mph < 5
      ? "var(--bp-color-bad)"
      : mph < 6.5
        ? "var(--bp-color-warn)"
        : "var(--bp-color-ink)";

type SegmentDisplayRow = {
  id: string;
  direction: StudioSegment["direction"];
  speedMph: number | null;
  displayOrder: number;
  spineSegmentId: string | null;
  segment: StudioSegment;
};

export function SegmentExplorerSection({
  data,
  search,
  onSearchChange,
}: {
  data: StudioRouteDetailResponse;
  search: RouteDetailSearch;
  onSearchChange: (search: RouteDetailSearch, replace: boolean) => void;
}) {
  const { route, segments } = data;
  const [showAll, setShowAll] = useState(false);
  // Segments without a stable spine id pin locally only (no shareable URL).
  const [localPinId, setLocalPinId] = useState<string | null>(null);

  const speedHistory = useRouteSpeedHistory(route.slug);
  const hourlyProfile = useRouteHourlyProfile(route.slug);
  const routeFact = useRouteFactEvidence(data);

  const canonical = canonicalizeRouteDetailSearch(search, {
    segments,
    history:
      speedHistory.status === "loading"
        ? { status: "pending" }
        : speedHistory.status === "ready"
          ? { status: "ready", data: speedHistory.data }
          : { status: "unavailable" },
  });
  const explorerSearch = canonical.search;
  const direction: ExplorerDirection = explorerSearch.direction ?? "all";

  useEffect(() => {
    if (!routeDetailSearchEquals(search, explorerSearch)) onSearchChange(explorerSearch, true);
  }, [explorerSearch, onSearchChange, search]);

  const historicalValues = useMemo(() => {
    if (
      canonical.historicalState !== "ready" ||
      speedHistory.status !== "ready" ||
      explorerSearch.month === undefined
    )
      return null;
    return historicalSegmentValues(speedHistory.data, segments, {
      month: explorerSearch.month,
      ...(explorerSearch.daypart === undefined ? {} : { daypart: explorerSearch.daypart }),
    });
  }, [
    canonical.historicalState,
    explorerSearch.daypart,
    explorerSearch.month,
    segments,
    speedHistory,
  ]);
  const historicalActive =
    historicalValues !== null && historicalValues.readiness !== "unavailable";
  const displaySpeeds = useMemo(
    () =>
      new Map(
        segments.map((segment) => [
          segment.id,
          historicalActive ? (historicalValues.speeds.get(segment.id) ?? null) : segment.speedMph,
        ]),
      ),
    [historicalActive, historicalValues, segments],
  );
  const activePeriodLabel =
    historicalActive && explorerSearch.month !== undefined
      ? `${formatMonthLabel(explorerSearch.month)}, ${daypartLabel(explorerSearch.daypart)}`
      : "current all-day";

  const urlPinned = resolvePinnedSegment(segments, explorerSearch.segment ?? null);
  const pinned = urlPinned ?? segments.find((segment) => segment.id === localPinId) ?? null;
  /* A shared `?segment=` used to pin the retired readout. With the readout gone
     the row IS the selection, so bring it on screen — the collapsed slice
     already expands to keep a pinned row visible. */
  const pinnedRowRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (urlPinned === null) return;
    pinnedRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [urlPinned]);

  const directions = useMemo(() => directionOptions(segments), [segments]);
  const ranked = useMemo(() => {
    const rows: SegmentDisplayRow[] = segments.map((segment, index) => ({
      id: segment.id,
      direction: segment.direction,
      speedMph: displaySpeeds.get(segment.id) ?? null,
      displayOrder: historicalValues?.displayOrders.get(segment.id) ?? index,
      spineSegmentId: segment.spineSegmentId,
      segment,
    }));
    return rankSegmentsSlowestFirst(rows, direction);
  }, [direction, displaySpeeds, historicalValues, segments]);
  const { rows, expanded } = visibleSegments(ranked, showAll, pinned?.id ?? null);
  const allRankedSpeedsMissing = ranked.length > 0 && ranked.every((row) => row.speedMph === null);

  const delayEvidenceAvailable =
    routeFact.status === "available" && routeFact.fact.delayExposure.status === "available";
  const delayCoverageEnd =
    routeFact.status === "available" ? routeFact.fact.delayExposure.coverage?.end : undefined;

  const pin = (segment: StudioSegment | null) => {
    const nextSearch = { ...explorerSearch, tab: "segments" as const };
    if (segment === null) {
      setLocalPinId(null);
      delete nextSearch.segment;
      onSearchChange(nextSearch, false);
      return;
    }
    if (segment.spineSegmentId !== null) {
      setLocalPinId(null);
      nextSearch.segment = segment.spineSegmentId;
      onSearchChange(nextSearch, false);
    } else {
      setLocalPinId(segment.id);
      delete nextSearch.segment;
      onSearchChange(nextSearch, false);
    }
  };
  const togglePin = (segment: StudioSegment) => {
    if (pinned?.id === segment.id) pin(null);
    else pin(segment);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (explorerSearch.segment === undefined && localPinId === null))
        return;
      setLocalPinId(null);
      const nextSearch = { ...explorerSearch };
      delete nextSearch.segment;
      onSearchChange(nextSearch, false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [explorerSearch, localPinId, onSearchChange]);

  const onDirectionChange = (next: ExplorerDirection) => {
    const nextSearch = { ...explorerSearch };
    delete nextSearch.segment;
    if (next === "all") delete nextSearch.direction;
    else nextSearch.direction = next;
    setLocalPinId(null);
    setShowAll(false);
    onSearchChange(nextSearch, true);
  };

  const onMonthChange = (month: string) => {
    const nextSearch = { ...explorerSearch };
    if (month === "") {
      delete nextSearch.month;
      delete nextSearch.daypart;
    } else {
      nextSearch.month = month;
      delete nextSearch.daypart;
    }
    onSearchChange(nextSearch, true);
  };

  const onDaypartChange = (daypart: string) => {
    const nextSearch = { ...explorerSearch };
    if (daypart === "") delete nextSearch.daypart;
    else nextSearch.daypart = daypart as ExplorerDaypart;
    onSearchChange(nextSearch, true);
  };

  const coverage = coverageThroughLabel(speedHistory.data, hourlyProfile.data);
  const aboutEntries: SourceNoteEntry[] = [
    { label: `${segments.length} timepoint ${segments.length === 1 ? "segment" : "segments"}` },
    ...(speedHistory.status === "ready"
      ? [
          {
            label: `${speedHistory.data.dimensions.months.length} months of segment speed history`,
          },
        ]
      : []),
    ...(delayEvidenceAvailable
      ? [
          {
            label: "Rider-hrs/wkdy = current route-slice observed-vs-scheduled delay exposure.",
            detail: routeDelayEvidenceNote(routeFact),
          },
        ]
      : [
          {
            label: "Route-slice rider-hour delay exposure is unavailable.",
            detail: routeFactUnavailableReason(routeFact),
          },
        ]),
  ];

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Slowest segments"
        sub={
          allRankedSpeedsMissing
            ? `Route order — no ranked speed evidence, ${activePeriodLabel}`
            : `Slowest first — ${activePeriodLabel}${coverage === null || historicalActive ? "" : `, ${coverage}`}`
        }
        right={
          <div className="flex flex-wrap items-center gap-3">
            <FilterChips
              ariaLabel="Direction"
              value={direction}
              onChange={onDirectionChange}
              options={directions.map((value) => ({
                id: value,
                label: value === "all" ? "All" : value,
              }))}
            />
            <PeriodControls
              history={speedHistory}
              month={explorerSearch.month}
              daypart={explorerSearch.daypart}
              onMonthChange={onMonthChange}
              onDaypartChange={onDaypartChange}
            />
            <SourceNote label="About this data" entries={aboutEntries} />
          </div>
        }
      >
        <HistoricalStatus
          state={canonical.historicalState}
          history={speedHistory}
          active={historicalActive}
          month={explorerSearch.month}
          missingSegmentCount={historicalValues?.missingSegmentCount ?? 0}
          segmentCount={segments.length}
        />
        {/* The ranked list is what this tab is for, so it takes the full card
            width. The route's one map is the Overview card (plan 126). */}
        <SegmentTable
          rows={rows}
          periodLabel={activePeriodLabel}
          historicalActive={historicalActive}
          delayEvidenceAvailable={delayEvidenceAvailable}
          delayCoverageEnd={delayCoverageEnd}
          pinnedId={pinned?.id ?? null}
          pinnedRowRef={pinnedRowRef}
          onTogglePin={togglePin}
        />
        {ranked.length > EXPLORER_COLLAPSED_ROW_COUNT ? (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="mt-1 w-full rounded-[3px] px-3 py-2.5 text-[12px] font-semibold text-[var(--bp-color-ink-55)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)] transition-colors hover:text-[var(--bp-color-ink)]"
          >
            {expanded ? "Show fewer segments" : `Show all ${ranked.length} segments`}
          </button>
        ) : null}
      </SectionCard>

      <SpeedByHourCard data={data} />
    </div>
  );
}

function daypartLabel(daypart: ExplorerDaypart | undefined): string {
  switch (daypart) {
    case "am_peak":
      return "AM peak";
    case "midday":
      return "midday";
    case "pm_peak":
      return "PM peak";
    case "off_peak":
      return "off-peak";
    default:
      return "all day";
  }
}

function routeFactUnavailableReason(state: RouteFactEvidenceState): string {
  switch (state.status) {
    case "pending":
      return "Verified route facts are loading.";
    case "available":
      return (
        state.fact.delayExposure.unavailableReason ?? "Delay-exposure provenance is unavailable."
      );
    case "unavailable":
    case "error":
    case "mismatch":
      return state.reason;
  }
}

function routeDelayEvidenceNote(
  state: Extract<RouteFactEvidenceState, { status: "available" }>,
): string {
  const exposure = state.fact.delayExposure;
  if (exposure.status !== "available" || exposure.coverage === null) {
    return exposure.unavailableReason ?? "Delay-exposure provenance is unavailable.";
  }
  return `Current all-day, ${exposure.coverage.start}–${exposure.coverage.end}; ${exposure.segmentCount} observed timepoint segments; average-service-day route-hourly ridership denominator. It colors nothing and controls no rank.`;
}

function PeriodControls({
  history,
  month,
  daypart,
  onMonthChange,
  onDaypartChange,
}: {
  history: RouteSpeedHistoryState;
  month: string | undefined;
  daypart: ExplorerDaypart | undefined;
  onMonthChange: (month: string) => void;
  onDaypartChange: (daypart: string) => void;
}) {
  const eligible =
    history.status === "ready" &&
    (history.data.spineReadiness === "series_ready" ||
      history.data.spineReadiness === "series_ready_with_gaps");
  const months =
    history.status === "ready"
      ? [...history.data.dimensions.months].reverse()
      : month === undefined
        ? []
        : [month];
  const dayparts = history.status === "ready" ? history.data.dimensions.dayparts : [];

  return (
    <div className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor="segment-period-month">
        Segment speed period
      </label>
      <select
        id="segment-period-month"
        value={month ?? ""}
        disabled={!eligible}
        onChange={(event) => onMonthChange(event.currentTarget.value)}
        className="min-h-9 rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card)] px-2 text-[11.5px] font-semibold text-[var(--bp-color-ink)] disabled:text-[var(--bp-color-ink-40)]"
      >
        <option value="">Current all-day</option>
        {months.map((value) => (
          <option key={value} value={value}>
            {formatMonthLabel(value)}
          </option>
        ))}
      </select>
      {month === undefined ? null : (
        <>
          <label className="sr-only" htmlFor="segment-period-daypart">
            Segment speed daypart
          </label>
          <select
            id="segment-period-daypart"
            value={daypart ?? ""}
            disabled={!eligible}
            onChange={(event) => onDaypartChange(event.currentTarget.value)}
            className="min-h-9 rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card)] px-2 text-[11.5px] font-semibold text-[var(--bp-color-ink)] disabled:text-[var(--bp-color-ink-40)]"
          >
            <option value="">All day</option>
            {dayparts.map((value) => (
              <option key={value} value={value}>
                {daypartLabel(value)}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

function HistoricalStatus({
  state,
  history,
  active,
  month,
  missingSegmentCount,
  segmentCount,
}: {
  state: ReturnType<typeof canonicalizeRouteDetailSearch>["historicalState"];
  history: RouteSpeedHistoryState;
  active: boolean;
  month: string | undefined;
  missingSegmentCount: number;
  segmentCount: number;
}) {
  let message: string | null = null;
  if (month !== undefined && state === "pending") {
    message = "Loading saved historical view; showing current all-day speed meanwhile.";
  } else if (month !== undefined && state === "unavailable") {
    message =
      "The saved historical selection cannot be validated right now; showing current all-day speed without changing the link.";
  } else if (
    history.status === "ready" &&
    (history.data.spineReadiness === "needs_pattern_review" ||
      history.data.spineReadiness === "failed")
  ) {
    message =
      "Historical segment coloring is unavailable because this route's geographic speed spine needs review. Current all-day evidence remains available.";
  } else if (history.status === "error") {
    message =
      "Historical segment coloring is unavailable because the speed history could not be loaded. Current all-day evidence remains available.";
  } else if (history.status === "ready" && history.data.spineReadiness === null) {
    /* The months are in the payload; this client cannot join them yet. Say so,
       rather than leaving disabled controls with no explanation. */
    message =
      "Historical segment coloring is unavailable because this route's published speed history predates the current segment matching and needs a rebuild. Current all-day evidence remains available.";
  } else if (active) {
    const gap =
      missingSegmentCount > 0
        ? ` ${missingSegmentCount} of ${segmentCount} segments have no observation for this selection and remain neutral.`
        : "";
    const sourceGap =
      history.status === "ready" && history.data.spineReadiness === "series_ready_with_gaps"
        ? ` The published history reports ${history.data.summary.missingExpectedCellCount ?? history.data.summary.missingCellCount} missing expected cells across ${formatMonthLabel(history.data.source.startMonth)}–${formatMonthLabel(history.data.source.endMonth)}.`
        : "";
    message = `Current route shape; historical speed is joined by geographic segment spine.${gap}${sourceGap}`;
  }
  if (message === null) return null;
  return (
    <p
      className="m-0 mb-3 rounded-[3px] bg-[var(--bp-color-paper-deep)] px-3 py-2 text-[11.5px] leading-normal text-[var(--bp-color-ink-70)]"
      role={state === "pending" ? "status" : undefined}
    >
      {message}
    </p>
  );
}

function SegmentTable({
  rows,
  periodLabel,
  historicalActive,
  delayEvidenceAvailable,
  delayCoverageEnd,
  pinnedId,
  pinnedRowRef,
  onTogglePin,
}: {
  rows: readonly SegmentDisplayRow[];
  periodLabel: string;
  historicalActive: boolean;
  delayEvidenceAvailable: boolean;
  delayCoverageEnd: string | undefined;
  pinnedId: string | null;
  pinnedRowRef: RefObject<HTMLButtonElement | null>;
  onTogglePin: (segment: StudioSegment) => void;
}) {
  return (
    <div className="mt-4">
      <div className="grid grid-cols-[26px_40px_minmax(0,1fr)_64px_120px_110px] items-center gap-3 px-2 pb-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)] shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:hidden">
        <span />
        <span />
        <span className="font-sans">Segment</span>
        <span className="text-right" title={periodLabel}>
          MPH
        </span>
        <span>vs sched</span>
        <span
          className="text-right"
          title={
            historicalActive && delayCoverageEnd !== undefined
              ? `Current route-slice delay exposure — ${delayCoverageEnd}, all-day`
              : undefined
          }
        >
          {historicalActive ? "Current rider-hrs" : "Rider-hrs/wkdy"}
        </span>
      </div>
      {rows.map((row, index) => {
        const { segment } = row;
        const delta =
          segment.scheduledMph === null || row.speedMph === null
            ? null
            : row.speedMph - segment.scheduledMph;
        const pinnedRow = segment.id === pinnedId;
        return (
          <button
            key={segment.id}
            type="button"
            ref={pinnedRow ? pinnedRowRef : undefined}
            onClick={() => onTogglePin(segment)}
            className={`grid w-full grid-cols-[26px_40px_minmax(0,1fr)_64px_120px_110px] items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-[var(--bp-color-ink-06)] max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-1 ${
              pinnedRow
                ? "bg-[var(--bp-color-accent-bg)] shadow-[inset_2px_0_0_var(--bp-color-accent)]"
                : "shadow-[inset_0_-1px_0_var(--bp-color-ink-06)]"
            }`}
          >
            <span className="font-mono text-[10.5px] text-[var(--bp-color-ink-40)] max-md:hidden">
              {index + 1}
            </span>
            <span className="max-md:hidden">
              <span className="rounded-[2px] bg-[var(--bp-color-ink-06)] px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-[var(--bp-color-ink-55)]">
                {segment.direction}
              </span>
            </span>
            <span className="min-w-0 truncate text-[13px] font-medium">
              {segment.from} <span className="text-[var(--bp-color-ink-40)]">→</span> {segment.to}
              <span className="ml-2 hidden rounded-[2px] bg-[var(--bp-color-ink-06)] px-1 py-0.5 font-mono text-[9px] font-bold text-[var(--bp-color-ink-55)] max-md:inline">
                {segment.direction}
              </span>
              {segmentCarriesLaneTag(segment.lane) ? (
                <span className="ml-2 text-[11px] font-normal text-[var(--bp-color-ink-55)]">
                  {SEGMENT_LANE_TAG}
                </span>
              ) : null}
            </span>
            <span
              className="text-right font-mono text-[13.5px] font-bold tabular-nums"
              style={{ color: SPEED_BAND(row.speedMph) }}
            >
              {row.speedMph === null ? "—" : row.speedMph.toFixed(1)}
            </span>
            <span className="flex items-center gap-2 max-md:hidden">
              <span className="relative h-[5px] w-[64px] overflow-hidden rounded-[2px] bg-[var(--bp-color-ink-06)]">
                <i className="absolute bottom-0 left-1/2 top-0 w-px bg-[var(--bp-color-ink-20)]" />
                {delta !== null ? (
                  <i
                    className="absolute bottom-0 top-0"
                    style={
                      delta < 0
                        ? {
                            right: "50%",
                            width: `${deltaBarShare(delta) * 30}px`,
                            background: "var(--bp-color-bad)",
                          }
                        : {
                            left: "50%",
                            width: `${deltaBarShare(delta) * 30}px`,
                            background: "var(--bp-color-ink-20)",
                          }
                    }
                  />
                ) : null}
              </span>
              <span className="w-[34px] font-mono text-[10.5px] tabular-nums text-[var(--bp-color-ink-55)]">
                {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
              </span>
            </span>
            <span
              className={`text-right font-mono text-[12.5px] tabular-nums ${
                !delayEvidenceAvailable || segment.riderHours === 0
                  ? "font-normal text-[var(--bp-color-ink-40)]"
                  : "font-semibold"
              }`}
            >
              {!delayEvidenceAvailable
                ? "—"
                : segment.riderHours === 0
                  ? "0"
                  : formatRiderHoursCompact(segment.riderHours)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function formatRiderHoursCompact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(Math.round(value));
}

function SpeedByHourCard({ data }: { data: StudioRouteDetailResponse }) {
  const { route, segments } = data;
  const hourlyProfile = useRouteHourlyProfile(route.slug);
  const segmentHourProfile = averageHourlySpeed(route, segments);
  const hourProfile = useMemo(
    () => chartHoursFromHourlyProfile(hourlyProfile.data, segmentHourProfile),
    [hourlyProfile.data, segmentHourProfile],
  );
  const slowestWindow = latestSlowestWindow(hourlyProfile.data);

  return (
    <SectionCard title="Speed by hour" sub={hourProfileSource(hourlyProfile)}>
      {hourProfile === null ? (
        <div className="flex h-[164px] items-center justify-center rounded-[3px] bg-[var(--bp-color-paper-deep)] px-4 text-center text-[12.5px] text-[var(--bp-color-ink-55)]">
          Route hourly profile is not attached yet.
        </div>
      ) : (
        <HourBars
          data={hourProfile}
          {...(route.scheduledMph === null ? {} : { sched: route.scheduledMph })}
          {...(slowestWindow === null ? {} : { marker: slowestWindow })}
          height={164}
          min={Math.max(0, Math.floor(Math.min(...hourProfile) - 1))}
          max={Math.ceil(
            Math.max(...(route.scheduledMph === null ? [] : [route.scheduledMph]), ...hourProfile) +
              1,
          )}
          legend
        />
      )}
    </SectionCard>
  );
}
