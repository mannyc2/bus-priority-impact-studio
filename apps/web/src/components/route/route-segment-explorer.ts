import { formatMonthLabel } from "@/components/route/segment-history-data";
import type {
  StudioRouteHourlyProfileResponse,
  StudioRouteSpeedHistoryResponse,
  StudioSegment,
} from "@/studio/api-contract";

/** Pure display model for the Segments-tab explorer (plan 081, comp r4).
 * Ranking, direction options, collapsed-slice, and pin resolution live here so
 * the table, readout, and map stay one deterministic contract. */

export const ROUTE_DETAIL_TABS = ["segments", "riders", "history"] as const;
export type RouteDetailTabSearch = (typeof ROUTE_DETAIL_TABS)[number];

export const EXPLORER_DIRECTIONS = ["NB", "SB", "EB", "WB"] as const;
export type SegmentDirection = (typeof EXPLORER_DIRECTIONS)[number];
export type ExplorerDirection = "all" | SegmentDirection;

export const EXPLORER_DAYPARTS = ["am_peak", "midday", "pm_peak", "off_peak"] as const;
export type ExplorerDaypart = (typeof EXPLORER_DAYPARTS)[number];

/** Canonical public search surface for the route detail page. Defaults are
 * omitted so Overview and current all-day remain short, stable URLs. */
export type RouteDetailSearch = {
  tab?: RouteDetailTabSearch;
  study?: string;
  segment?: string;
  direction?: SegmentDirection;
  month?: string;
  daypart?: ExplorerDaypart;
  lanes?: true;
};

const SEARCH_TOKEN_MAX_LENGTH = 256;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function isMember<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isBoundedSearchToken(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > SEARCH_TOKEN_MAX_LENGTH ||
    value.trim() !== value
  )
    return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return false;
  }
  return true;
}

/** Router-stage validation. Route/history evidence is deliberately handled
 * later so a loading or transiently unavailable artifact never destroys a
 * structurally valid shared historical URL. */
export function validateRouteDetailSearch(search: Record<string, unknown>): RouteDetailSearch {
  const tab = isMember(ROUTE_DETAIL_TABS, search["tab"]) ? search["tab"] : undefined;
  if (tab === undefined) return {};
  if (tab === "history") {
    const study = isBoundedSearchToken(search["study"]) ? search["study"] : undefined;
    return { tab, ...(study === undefined ? {} : { study }) };
  }
  if (tab !== "segments") return { tab };

  const segment = isBoundedSearchToken(search["segment"]) ? search["segment"] : undefined;
  const direction = isMember(EXPLORER_DIRECTIONS, search["direction"])
    ? search["direction"]
    : undefined;
  const month = typeof search["month"] === "string" && ISO_MONTH.test(search["month"])
    ? search["month"]
    : undefined;
  const daypart = month !== undefined && isMember(EXPLORER_DAYPARTS, search["daypart"])
    ? search["daypart"]
    : undefined;

  return {
    tab,
    ...(segment === undefined ? {} : { segment }),
    ...(direction === undefined ? {} : { direction }),
    ...(month === undefined ? {} : { month }),
    ...(daypart === undefined ? {} : { daypart }),
    ...(search["lanes"] === true ? { lanes: true as const } : {}),
  };
}

export type RouteHistoryValidation =
  | { status: "pending" }
  | { status: "ready"; data: StudioRouteSpeedHistoryResponse }
  | { status: "unavailable" };

export type RouteLaneValidation = "pending" | "ready" | "unavailable";

export type RouteDetailCanonicalization = {
  search: RouteDetailSearch;
  segmentState: "none" | "valid" | "invalid";
  historicalState: "current" | "pending" | "ready" | "blocked" | "unavailable";
};

/** Evidence-stage normalization. A ready response may prove a route-specific
 * value invalid; pending and request-error states preserve saved URLs. */
export function canonicalizeRouteDetailSearch(
  incoming: RouteDetailSearch,
  evidence: {
    segments: readonly Pick<StudioSegment, "direction" | "spineSegmentId">[];
    history: RouteHistoryValidation;
    lanes?: RouteLaneValidation;
  },
): RouteDetailCanonicalization {
  const search = validateRouteDetailSearch({ ...incoming });
  if (search.tab !== "segments") {
    return { search, segmentState: "none", historicalState: "current" };
  }

  let segmentState: RouteDetailCanonicalization["segmentState"] = "none";
  if (search.segment !== undefined) {
    const matches = evidence.segments.filter(
      (segment) => segment.spineSegmentId === search.segment,
    );
    const match = matches.length === 1 ? matches[0] : undefined;
    if (match === undefined) {
      delete search.segment;
      segmentState = "invalid";
    } else {
      segmentState = "valid";
      if (search.direction !== undefined && search.direction !== match.direction) {
        search.direction = match.direction;
      }
    }
  }

  const availableDirections = directionOptions(evidence.segments).filter(
    (direction): direction is SegmentDirection => direction !== "all",
  );
  if (search.direction !== undefined && !availableDirections.includes(search.direction)) {
    delete search.direction;
  }

  let historicalState: RouteDetailCanonicalization["historicalState"] = "current";
  if (search.month !== undefined) {
    if (evidence.history.status === "pending") {
      historicalState = "pending";
    } else if (evidence.history.status === "unavailable") {
      historicalState = "unavailable";
    } else {
      const history = evidence.history.data;
      const historicalReady =
        history.spineReadiness === "series_ready" ||
        history.spineReadiness === "series_ready_with_gaps";
      if (!historicalReady) {
        delete search.month;
        delete search.daypart;
        historicalState = "blocked";
      } else if (!history.dimensions.months.includes(search.month)) {
        delete search.month;
        delete search.daypart;
        historicalState = "current";
      } else {
        historicalState = "ready";
        if (
          search.daypart !== undefined &&
          !history.dimensions.dayparts.includes(search.daypart)
        ) {
          delete search.daypart;
        }
      }
    }
  }

  if (search.lanes === true && evidence.lanes === "unavailable") delete search.lanes;
  return { search, segmentState, historicalState };
}

export function routeDetailSearchEquals(
  left: RouteDetailSearch,
  right: RouteDetailSearch,
): boolean {
  return (
    left.tab === right.tab &&
    left.study === right.study &&
    left.segment === right.segment &&
    left.direction === right.direction &&
    left.month === right.month &&
    left.daypart === right.daypart &&
    left.lanes === right.lanes
  );
}

const DIRECTION_ORDER: readonly SegmentDirection[] = EXPLORER_DIRECTIONS;

/** Direction chips derive from the served segments — never hardcode NB/SB. */
export function directionOptions(segments: readonly { direction: string }[]): ExplorerDirection[] {
  const present = new Set(segments.map((segment) => segment.direction));
  const options = DIRECTION_ORDER.filter((direction) => present.has(direction));
  return options.length > 1 ? ["all", ...options] : ["all"];
}

/** One deterministic ranking contract (plan 081 step 1): active displayed
 * speed ascending; null/unavailable last; then direction, then stable id.
 * Rider-hours never controls rank. */
export function rankSegmentsSlowestFirst<
  T extends {
    id: string;
    direction: string;
    speedMph: number | null;
    displayOrder?: number;
    spineSegmentId?: string | null;
  },
>(segments: readonly T[], direction: ExplorerDirection): T[] {
  const filtered =
    direction === "all"
      ? [...segments]
      : segments.filter((segment) => segment.direction === direction);
  return filtered.sort((left, right) => {
    const l = left.speedMph;
    const r = right.speedMph;
    if (l === null && r === null) return tieBreak(left, right);
    if (l === null) return 1;
    if (r === null) return -1;
    if (l !== r) return l - r;
    return tieBreak(left, right);
  });
}

function tieBreak(
  left: { id: string; direction: string; displayOrder?: number; spineSegmentId?: string | null },
  right: { id: string; direction: string; displayOrder?: number; spineSegmentId?: string | null },
): number {
  if (left.direction !== right.direction) return left.direction < right.direction ? -1 : 1;
  const leftOrder = left.displayOrder ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.displayOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  const leftStableId = left.spineSegmentId ?? left.id;
  const rightStableId = right.spineSegmentId ?? right.id;
  if (leftStableId === rightStableId) return left.id.localeCompare(right.id);
  return leftStableId.localeCompare(rightStableId);
}

export const EXPLORER_COLLAPSED_ROW_COUNT = 8;

/** Collapsed by default; "Show fewer" exists only after expanding. Pinning a
 * segment below the fold auto-expands rather than hiding the pinned row. */
export function visibleSegments<T extends { id: string }>(
  ranked: readonly T[],
  showAll: boolean,
  pinnedId: string | null,
): { rows: T[]; expanded: boolean } {
  const pinnedIndex = pinnedId === null ? -1 : ranked.findIndex((row) => row.id === pinnedId);
  const expanded = showAll || pinnedIndex >= EXPLORER_COLLAPSED_ROW_COUNT;
  return {
    rows: expanded ? [...ranked] : ranked.slice(0, EXPLORER_COLLAPSED_ROW_COUNT),
    expanded,
  };
}

/** A shared `?segment=` value is a stable spine id; an unknown one is dropped
 * (never resolved by position, never replaced with the flagged segment). */
export function resolvePinnedSegment<T extends { id: string; spineSegmentId: string | null }>(
  segments: readonly T[],
  spineSegmentId: string | null,
): T | null {
  if (spineSegmentId === null) return null;
  return segments.find((segment) => segment.spineSegmentId === spineSegmentId) ?? null;
}

/** Delta-bar display clamps at ±2.5 mph so one outlier schedule doesn't
 * flatten every other bar; the printed number always carries the truth. */
export const DELTA_BAR_CLAMP_MPH = 2.5;

export function deltaBarShare(deltaMph: number): number {
  return Math.min(1, Math.abs(deltaMph) / DELTA_BAR_CLAMP_MPH);
}

const LANE_PHRASE: Record<Exclude<StudioSegment["lane"], "none">, string> = {
  yes: "most of this stretch",
  partial: "part of this stretch",
  minimal: "a little of this stretch",
};

/** One plain readout line instead of the retired lane column/chips. */
export function laneReadoutLine(lane: StudioSegment["lane"]): string {
  if (lane === "none") return "No DOT bus-lane proximity signal for this stretch";
  return `Along a DOT bus-lane street — ${LANE_PHRASE[lane]} (proximity)`;
}

/** De-month captions (ADR-0022): identity is coverage, so the section sub
 * reads "coverage through <Month YYYY>" from the latest covered month of the
 * serving responses. One call site per surface. */
export function coverageThroughLabel(
  speedHistory: StudioRouteSpeedHistoryResponse | null,
  hourlyProfile: StudioRouteHourlyProfileResponse | null,
): string | null {
  const historyMonth = speedHistory?.dimensions.months.at(-1) ?? null;
  const profileMonth = hourlyProfile?.summary.latestMonth ?? null;
  const month = historyMonth ?? profileMonth;
  return month === null ? null : `coverage through ${formatMonthLabel(month)}`;
}

/** Latest slowest window (by month) for the on-chart Speed-by-hour marker. */
export function latestSlowestWindow(profile: StudioRouteHourlyProfileResponse | null): {
  hourOfDay: number;
  label: string;
} | null {
  const windows = profile?.slowestWindows ?? [];
  const latest = [...windows].sort((left, right) => left.month.localeCompare(right.month)).at(-1);
  if (latest === undefined) return null;
  const speed =
    latest.weightedAverageSpeedMph === null
      ? ""
      : ` — ${latest.weightedAverageSpeedMph.toFixed(1)} mph`;
  return {
    hourOfDay: latest.hourOfDay,
    label: `slowest ${latest.dayOfWeek.slice(0, 3)} ${formatHourShort(latest.hourOfDay)}${speed}`,
  };
}

/** Latest peak-ridership window for the Riders "When riders ride" card. */
export function latestPeakWindow(profile: StudioRouteHourlyProfileResponse | null): {
  hourOfDay: number;
  label: string;
} | null {
  const windows = profile?.peakWindows ?? [];
  const latest = [...windows].sort((left, right) => left.month.localeCompare(right.month)).at(-1);
  if (latest === undefined) return null;
  const riders =
    latest.ridership === null ? "" : ` — ${formatCompactCount(latest.ridership)} riders`;
  return {
    hourOfDay: latest.hourOfDay,
    label: `busiest ${latest.dayOfWeek.slice(0, 3)} ${formatHourShort(latest.hourOfDay)}${riders}`,
  };
}

export function formatHourShort(hour: number): string {
  const suffix = hour < 12 ? "A" : "P";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}

export function formatCompactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}
