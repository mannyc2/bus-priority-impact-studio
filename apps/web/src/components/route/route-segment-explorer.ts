import { formatMonthLabel } from "@/components/route/segment-history-data";
import type {
  StudioRouteHourlyProfileResponse,
  StudioRouteSpeedHistoryResponse,
  StudioSegment,
} from "@/studio/api-contract";

/** Pure display model for the Segments-tab explorer (plan 081, comp r4).
 * Ranking, direction options, collapsed-slice, and pin resolution live here so
 * the table, readout, and map stay one deterministic contract. */

export type ExplorerDirection = "all" | "NB" | "SB" | "EB" | "WB";

const DIRECTION_ORDER: readonly ExplorerDirection[] = ["NB", "SB", "EB", "WB"];

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
  T extends { id: string; direction: string; speedMph: number | null },
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
  left: { id: string; direction: string },
  right: { id: string; direction: string },
): number {
  if (left.direction !== right.direction) return left.direction < right.direction ? -1 : 1;
  return left.id < right.id ? -1 : 1;
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
  if (lane === "none") return "No DOT bus lane along this stretch";
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
