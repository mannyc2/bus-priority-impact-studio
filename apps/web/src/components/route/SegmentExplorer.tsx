import type { MapBusLaneFeatureCollection, MapManifestResponse } from "@bp/domain/maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { FilterChips } from "@/components/FilterChips";
import { HourBars } from "@/components/HourBars";
import { BUS_LANE_COLOR } from "@/components/route/network-map-model";
import { RouteMapLibre } from "@/components/route/RouteMapLibre";
import { averageHourlySpeed } from "@/components/route/route-derived";
import {
  chartHoursFromHourlyProfile,
  hourProfileSource,
  type RouteSpeedHistoryState,
  useRouteHourlyProfile,
  useRouteSegmentsGeo,
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
  laneReadoutLine,
  latestSlowestWindow,
  type RouteDetailSearch,
  rankSegmentsSlowestFirst,
  resolvePinnedSegment,
  routeDetailSearchEquals,
  visibleSegments,
} from "@/components/route/route-segment-explorer";
import {
  formatMonthLabel,
  historicalSegmentValues,
  type SegmentHistorySeries,
  segmentHistorySeries,
} from "@/components/route/segment-history-data";
import { useRouteFactEvidence } from "@/components/route/use-route-fact-evidence";
import { SectionCard } from "@/components/SectionCard";
import { SourceNote, type SourceNoteEntry } from "@/components/SourceNote";
import { Spark } from "@/components/Spark";
import { currentMapBusLaneArtifact, fetchMapBusLanes, fetchMapManifest } from "@/studio/api-client";
import type { StudioRouteDetailResponse, StudioSegment } from "@/studio/api-contract";

const SPEED_BAND = (mph: number | null): string =>
  mph === null
    ? "var(--bp-color-ink-40)"
    : mph < 5
      ? "var(--bp-color-bad)"
      : mph < 6.5
        ? "var(--bp-color-warn)"
        : "var(--bp-color-ink)";

type LanesState =
  | { eligibility: "pending"; status: "idle"; reason: null; collection: null }
  | { eligibility: "ready"; status: "idle" | "loading"; reason: null; collection: null }
  | {
      eligibility: "ready";
      status: "ready";
      reason: null;
      collection: MapBusLaneFeatureCollection;
    }
  | { eligibility: "unavailable"; status: "unavailable"; reason: string; collection: null };

/** Check the manifest immediately, then fetch the verified DOT geometry only
 * after opt-in. The unavailable reason is evidence, not a failed spatial join. */
function useBusLanes(enabled: boolean): LanesState {
  const [manifest, setManifest] = useState<
    | { status: "pending" }
    | { status: "ready"; data: MapManifestResponse }
    | { status: "unavailable"; reason: string }
  >({ status: "pending" });
  const [collection, setCollection] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; data: MapBusLaneFeatureCollection }
    | { status: "unavailable"; reason: string }
  >({ status: "idle" });
  const laneLoadStarted = useRef(false);
  const laneCollectionStatus = useRef(collection.status);
  laneCollectionStatus.current = collection.status;

  useEffect(() => {
    const controller = new AbortController();
    fetchMapManifest({ signal: controller.signal })
      .then((loaded) => {
        if (controller.signal.aborted) return;
        if (loaded === null) {
          setManifest({ status: "unavailable", reason: "Map manifest is unavailable." });
          return;
        }
        if (currentMapBusLaneArtifact(loaded) === null) {
          const layer = loaded.layers.find((candidate) => candidate.layerId === "bus_lanes");
          setManifest({
            status: "unavailable",
            reason:
              layer === undefined
                ? "The published bus-lane layer is not declared."
                : `The published bus-lane layer is ${layer.readiness.replaceAll("_", " ")}.`,
          });
          return;
        }
        setManifest({ status: "ready", data: loaded });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setManifest({ status: "unavailable", reason: "Map manifest could not be loaded." });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (
      !enabled ||
      manifest.status !== "ready" ||
      laneLoadStarted.current ||
      laneCollectionStatus.current === "ready" ||
      laneCollectionStatus.current === "unavailable"
    )
      return;
    laneLoadStarted.current = true;
    const controller = new AbortController();
    setCollection({ status: "loading" });
    fetchMapBusLanes(manifest.data, { signal: controller.signal })
      .then((load) => {
        if (controller.signal.aborted) return;
        setCollection(
          load.status === "ready"
            ? { status: "ready", data: load.data }
            : {
                status: "unavailable",
                reason:
                  load.status === "unavailable"
                    ? load.reason
                    : "Published DOT lane geometry failed its verified artifact check.",
              },
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCollection({ status: "unavailable", reason: "Published DOT lane geometry failed." });
      });
    return () => {
      controller.abort();
      laneLoadStarted.current = false;
    };
  }, [enabled, manifest]);

  if (manifest.status === "pending") {
    return { eligibility: "pending", status: "idle", reason: null, collection: null };
  }
  if (manifest.status === "unavailable") {
    return {
      eligibility: "unavailable",
      status: "unavailable",
      reason: manifest.reason,
      collection: null,
    };
  }
  if (collection.status === "unavailable") {
    return {
      eligibility: "unavailable",
      status: "unavailable",
      reason: collection.reason,
      collection: null,
    };
  }
  if (collection.status === "ready") {
    return {
      eligibility: "ready",
      status: "ready",
      reason: null,
      collection: collection.data,
    };
  }
  return {
    eligibility: "ready",
    status: collection.status,
    reason: null,
    collection: null,
  };
}

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
  mapOnly = false,
}: {
  data: StudioRouteDetailResponse;
  search: RouteDetailSearch;
  onSearchChange: (search: RouteDetailSearch, replace: boolean) => void;
  mapOnly?: boolean;
}) {
  const { route, segments } = data;
  const [showAll, setShowAll] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Segments without a stable spine id pin locally only (no shareable URL).
  const [localPinId, setLocalPinId] = useState<string | null>(null);

  const speedHistory = useRouteSpeedHistory(route.slug);
  const hourlyProfile = useRouteHourlyProfile(route.slug);
  const geo = useRouteSegmentsGeo(route.routeId);
  const routeFact = useRouteFactEvidence(data);
  const routeLaneEligibility =
    routeFact.status === "pending"
      ? "pending"
      : routeFact.status === "available" &&
          routeFact.fact.provenance.lane.status === "available" &&
          (routeFact.fact.provenance.lane.valuePct ?? 0) > 0
        ? "ready"
        : "unavailable";
  const lanes = useBusLanes(search.lanes === true && routeLaneEligibility === "ready");
  const laneValidation =
    routeLaneEligibility === "unavailable" || lanes.eligibility === "unavailable"
      ? "unavailable"
      : routeLaneEligibility === "pending" || lanes.eligibility === "pending"
        ? "pending"
        : "ready";

  const canonical = canonicalizeRouteDetailSearch(search, {
    segments,
    history:
      speedHistory.status === "loading"
        ? { status: "pending" }
        : speedHistory.status === "ready"
          ? { status: "ready", data: speedHistory.data }
          : { status: "unavailable" },
    lanes: laneValidation,
  });
  const explorerSearch = canonical.search;
  const direction: ExplorerDirection = explorerSearch.direction ?? "all";
  const showLanes = explorerSearch.lanes === true;

  useEffect(() => {
    if (!routeDetailSearchEquals(search, explorerSearch)) onSearchChange(explorerSearch, true);
  }, [explorerSearch, onSearchChange, search]);

  const historySeries = useMemo(
    () => segmentHistorySeries(speedHistory.data, segments),
    [speedHistory.data, segments],
  );

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
  const hovered =
    hoverId === null ? null : (segments.find((segment) => segment.id === hoverId) ?? null);

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

  // Any route has some lane-proximate segment iff DOT geometry can be near it;
  // 34/350 routes have none — those never see the toggle (comp r3/D12).
  const hasLaneEvidence = routeLaneEligibility === "ready";
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

  const onLanesChange = (enabled: boolean) => {
    const nextSearch = { ...explorerSearch };
    if (enabled) nextSearch.lanes = true;
    else delete nextSearch.lanes;
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
    ...(showLanes
      ? [
          {
            label: "Painted bus lanes are NYC DOT published centerline geometry.",
            detail: "Street inventory, not proof a segment is treated.",
          },
        ]
      : []),
  ];

  const mapBlock =
    geo.status === "loading" ? (
      <div
        className="h-[460px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)] motion-reduce:animate-none max-md:h-[320px]"
        aria-hidden
      />
    ) : geo.status === "ready" ? (
      <RouteMapLibre
        collection={geo.collection}
        context={geo.context}
        route={route}
        segments={segments}
        hoveredSegmentId={hoverId}
        setHoveredSegmentId={setHoverId}
        pinnedSegmentId={pinned?.id ?? null}
        onSegmentSelect={(segmentId) => {
          const segment = segments.find((candidate) => candidate.id === segmentId);
          if (segment !== undefined) togglePin(segment);
        }}
        activeDirection={direction}
        displaySpeeds={displaySpeeds}
        showLanes={showLanes && lanes.status === "ready"}
        busLanes={lanes.collection}
      />
    ) : (
      <p className="m-0 px-4 py-6 text-center text-[12.5px] text-[var(--bp-color-ink-55)]">
        {geo.reason} The segment list below carries the same evidence without a geographic claim.
      </p>
    );

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
            {hasLaneEvidence && lanes.eligibility !== "unavailable" ? (
              <label className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2.5 py-2 text-[12px] font-semibold shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
                <input
                  type="checkbox"
                  checked={showLanes}
                  disabled={lanes.eligibility === "pending"}
                  onChange={(event) => onLanesChange(event.currentTarget.checked)}
                  className="size-3.5 accent-[var(--bp-color-ink)]"
                />
                <span>Painted bus lanes (DOT)</span>
              </label>
            ) : null}
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
        <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(300px,0.8fr)] items-stretch gap-4 max-xl:grid-cols-1">
          <div className="min-w-0 overflow-hidden rounded-[3px] bg-[var(--bp-color-paper-deep)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
            {mapBlock}
            <p className="m-0 border-t border-[var(--bp-color-rule)] px-3 pt-2 text-[10.5px] text-[var(--bp-color-ink-55)]">
              Interactive route segment map; use the segment list for the same values and selection.
            </p>
            <SegmentSpeedLegend periodLabel={activePeriodLabel} showLanes={showLanes} />
            {lanes.status === "unavailable" && hasLaneEvidence ? (
              <p className="m-0 px-3 py-2 text-[11px] text-[var(--bp-color-ink-55)]">
                {lanes.reason}
              </p>
            ) : null}
          </div>
          <SegmentReadout
            route={route}
            segments={segments}
            pinned={pinned}
            pinnedIsShareable={urlPinned !== null}
            hovered={hovered}
            historySeries={historySeries}
            historyStatus={speedHistory.status}
            displaySpeeds={displaySpeeds}
            periodLabel={activePeriodLabel}
            historicalActive={historicalActive}
            routeFact={routeFact}
            onClear={() => pin(null)}
          />
        </div>

        {mapOnly ? null : (
          <>
            <SegmentTable
              rows={rows}
              periodLabel={activePeriodLabel}
              historicalActive={historicalActive}
              delayEvidenceAvailable={delayEvidenceAvailable}
              delayCoverageEnd={delayCoverageEnd}
              pinnedId={pinned?.id ?? null}
              onHover={setHoverId}
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
          </>
        )}
      </SectionCard>

      {mapOnly ? null : <SpeedByHourCard data={data} />}
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

function SegmentSpeedLegend({
  periodLabel,
  showLanes,
}: {
  periodLabel: string;
  showLanes: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 font-mono text-[9.5px] text-[var(--bp-color-ink-55)]">
      <span className="font-sans font-semibold text-[var(--bp-color-ink-70)]">{periodLabel}</span>
      {[
        ["under 5 mph", "var(--bp-color-bad)"],
        ["5–6.5 mph", "var(--bp-color-warn)"],
        ["over 6.5 mph", "var(--bp-color-good)"],
      ].map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-1">
          <i className="h-[3px] w-4" style={{ background: color }} aria-hidden />
          {label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <i
          className="h-[5px] w-4 border-y border-dashed border-[var(--bp-color-ink-40)]"
          aria-hidden
        />
        no data
      </span>
      {showLanes ? (
        <span className="inline-flex items-center gap-1">
          <i className="h-[4px] w-4" style={{ background: BUS_LANE_COLOR }} aria-hidden />
          NYC DOT published bus-lane geometry
        </span>
      ) : null}
    </div>
  );
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

function SegmentReadout({
  route,
  segments,
  pinned,
  pinnedIsShareable,
  hovered,
  historySeries,
  historyStatus,
  displaySpeeds,
  periodLabel,
  historicalActive,
  routeFact,
  onClear,
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
  pinned: StudioSegment | null;
  pinnedIsShareable: boolean;
  hovered: StudioSegment | null;
  historySeries: ReturnType<typeof segmentHistorySeries>;
  historyStatus: RouteSpeedHistoryState["status"];
  displaySpeeds: ReadonlyMap<string, number | null>;
  periodLabel: string;
  historicalActive: boolean;
  routeFact: RouteFactEvidenceState;
  onClear: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const active = hovered ?? pinned;
  const isPinned = active !== null && active.id === pinned?.id;
  const totalRiderHours = segments.reduce((sum, segment) => sum + segment.riderHours, 0);
  const delayEvidenceAvailable =
    routeFact.status === "available" && routeFact.fact.delayExposure.status === "available";
  const delayCoverageEnd =
    routeFact.status === "available" ? routeFact.fact.delayExposure.coverage?.end : undefined;

  // Fixed slots (comp D10): identical anatomy for overview / preview / pinned.
  const title =
    active === null ? (
      route.label
    ) : (
      <>
        {active.from} <span className="text-[var(--bp-color-ink-40)]">→</span> {active.to}{" "}
        <span className="rounded-[2px] bg-[var(--bp-color-ink-06)] px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-[var(--bp-color-ink-55)]">
          {active.direction}
        </span>
      </>
    );
  const sub = isPinned
    ? pinnedIsShareable
      ? "Pinned — Esc or Clear selection to release."
      : "Current segment; stable history/share link unavailable."
    : active !== null
      ? "Previewing — click to pin."
      : "Pin a segment for its 36-month speed history.";
  const contextLine =
    active === null
      ? `${segments.length} timepoint segments, all directions`
      : laneReadoutLine(active.lane);

  const availableRouteSpeeds = [...displaySpeeds.values()].filter(
    (speed): speed is number => speed !== null,
  );
  const routeDisplaySpeed =
    availableRouteSpeeds.length === 0
      ? null
      : availableRouteSpeeds.reduce((sum, speed) => sum + speed, 0) / availableRouteSpeeds.length;
  const mph =
    active === null
      ? historicalActive
        ? routeDisplaySpeed
        : route.weightedAvgSpeed
      : (displaySpeeds.get(active.id) ?? null);
  const sched = active === null ? route.scheduledMph : active.scheduledMph;
  const delta = sched === null || mph === null ? null : mph - sched;
  const riderHours = delayEvidenceAvailable
    ? active === null
      ? route.riderHoursLost
      : active.riderHours
    : null;
  const riderHoursSub = !delayEvidenceAvailable
    ? "verified exposure unavailable"
    : historicalActive
      ? "current route slice"
      : active === null
        ? "route total"
        : active.riderHours === 0
          ? "beats its schedule"
          : totalRiderHours > 0
            ? `${Math.round((active.riderHours / totalRiderHours) * 100)}% of route burden`
            : "per weekday";

  const hours = active?.hours ?? averageHourlySeverityAcross(segments);
  const series = active === null ? null : (historySeries.series.get(active.id) ?? null);

  return (
    <aside className="flex min-w-0 flex-col rounded-[3px] bg-[var(--bp-color-paper-deep)] p-4 shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
      <div className="min-h-[38px] text-[14px] font-semibold leading-snug">{title}</div>
      <div className="mt-0.5 min-h-[17px] text-[11.5px] text-[var(--bp-color-ink-55)]">{sub}</div>

      <div className="mt-3.5 grid grid-cols-3 gap-2.5 border-t border-[var(--bp-color-rule)] pt-3">
        <ReadoutStat
          label="Speed"
          value={mph === null ? "—" : mph.toFixed(1)}
          valueColor={SPEED_BAND(mph)}
          sub={mph === null ? `no data, ${periodLabel}` : `mph, ${periodLabel}`}
        />
        <ReadoutStat
          label="vs sched"
          value={delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
          sub={sched === null ? "no schedule" : `sched ${sched.toFixed(1)}`}
        />
        <ReadoutStat
          label={historicalActive ? "Current delay" : "Rider-hrs"}
          value={riderHours === null ? "—" : formatRiderHoursCompact(riderHours)}
          sub={
            historicalActive && delayCoverageEnd !== undefined
              ? `rider-hrs, ${delayCoverageEnd}, all-day`
              : riderHoursSub
          }
        />
      </div>

      <div className="mt-2 min-h-[17px] text-[11px] text-[var(--bp-color-ink-55)]">
        {contextLine}
      </div>
      <div className="mt-3 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)]">
        Severity by hour{historicalActive ? " — current" : ""}
      </div>
      <div className="mt-1.5 flex h-[28px] items-end gap-px" title="Taller = slower vs schedule">
        {hours.map((value, hour) => (
          <i
            key={hour}
            className="min-h-[2px] flex-1 rounded-t-[1px]"
            style={{
              height: `${Math.max(6, value * 100)}%`,
              background:
                value > 0.66
                  ? "var(--bp-color-bad)"
                  : value > 0.4
                    ? "var(--bp-color-warn)"
                    : "var(--bp-color-ink-20)",
            }}
          />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-[9.5px] text-[var(--bp-color-ink-40)]">
        <span>12A</span>
        <span>12P</span>
        <span>11P</span>
      </div>

      <div className="mt-3 min-h-[56px]">
        <SegmentSparkline segment={active} series={series} historyStatus={historyStatus} />
      </div>

      <div className="mt-auto flex min-h-[44px] items-center gap-2 pt-3">
        {isPinned && pinned !== null ? (
          <>
            <button
              type="button"
              disabled={!pinnedIsShareable}
              title={
                pinnedIsShareable
                  ? "Copy a shareable link to this segment"
                  : "No stable link for this segment"
              }
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href).catch(() => {});
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              }}
              className="rounded-[3px] bg-[var(--bp-color-ink)] px-2.5 py-1.5 text-[11.5px] font-semibold text-white disabled:bg-[var(--bp-color-ink-06)] disabled:text-[var(--bp-color-ink-40)]"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-[3px] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]"
            >
              Clear ✕
            </button>
          </>
        ) : null}
      </div>
    </aside>
  );
}

function ReadoutStat({
  label,
  value,
  valueColor,
  sub,
}: {
  label: string;
  value: string;
  valueColor?: string;
  sub: string;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)]">
        {label}
      </div>
      <div
        className="mt-0.5 font-mono text-[19px] font-semibold leading-tight tabular-nums"
        style={valueColor === undefined ? {} : { color: valueColor }}
      >
        {value}
      </div>
      <div className="mt-0.5 min-h-[15px] text-[10px] leading-tight text-[var(--bp-color-ink-55)]">
        {sub}
      </div>
    </div>
  );
}

function averageHourlySeverityAcross(segments: readonly StudioSegment[]): number[] {
  if (segments.length === 0) return Array.from({ length: 24 }, () => 0);
  return Array.from(
    { length: 24 },
    (_, hour) =>
      segments.reduce((sum, segment) => sum + (segment.hours[hour] ?? 0), 0) / segments.length,
  );
}

function SegmentSparkline({
  segment,
  series,
  historyStatus,
}: {
  segment: StudioSegment | null;
  series: SegmentHistorySeries | null;
  historyStatus: RouteSpeedHistoryState["status"];
}) {
  if (segment === null) return null;
  if (historyStatus === "loading") {
    return (
      <div
        className="h-[36px] w-[220px] animate-pulse rounded-[2px] bg-[var(--bp-color-ink-06)] motion-reduce:animate-none"
        aria-hidden
      />
    );
  }
  const points = series?.speeds.filter((speed): speed is number => speed !== null) ?? [];
  if (series === null || points.length < 2) {
    return (
      <p className="m-0 text-[11px] text-[var(--bp-color-ink-55)]">
        No month history for this segment.
      </p>
    );
  }
  const first = series.months[0];
  const last = series.months.at(-1);
  return (
    <div>
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-40)]">
        Speed history
      </div>
      <div className="mt-1 flex items-center gap-3">
        <Spark data={points} width={200} height={32} fill />
        {first !== undefined && last !== undefined ? (
          <span className="font-mono text-[10px] text-[var(--bp-color-ink-55)]">
            {formatMonthLabel(first)} – {formatMonthLabel(last)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SegmentTable({
  rows,
  periodLabel,
  historicalActive,
  delayEvidenceAvailable,
  delayCoverageEnd,
  pinnedId,
  onHover,
  onTogglePin,
}: {
  rows: readonly SegmentDisplayRow[];
  periodLabel: string;
  historicalActive: boolean;
  delayEvidenceAvailable: boolean;
  delayCoverageEnd: string | undefined;
  pinnedId: string | null;
  onHover: (segmentId: string | null) => void;
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
            onMouseEnter={() => onHover(segment.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(segment.id)}
            onBlur={() => onHover(null)}
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
