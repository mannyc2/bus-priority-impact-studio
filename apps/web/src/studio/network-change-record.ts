/**
 * The network change record: what `/interventions` says at network scale.
 *
 * Everything here is a pure reduction of payloads the interventions loader
 * already fetches — the route projection, the reviewed corpus and the published
 * study index. No count, year or family name on the page is authored; each one
 * falls out of these functions, so the page moves on its own when the served
 * release advances.
 *
 * Wording rule (Plan 104, load-bearing): `bus_lane_infrastructure` records are
 * route shape against the city's published DOT bus-lane centreline geometry and
 * are not audited regulatory mileage. Every string this module produces says a
 * route "runs on a street with a bus lane"; none claims the route owns the lane
 * and none carries a mileage figure.
 */

import type { StudioRoute } from "./api-contract.js";
import { parseChangeDate } from "./change-date.js";

/** Records earlier than this fold into the opening value rather than stretching
 *  the axis; the nine 1963 bus-lane rows would otherwise own half the width. */
export const BUILDOUT_FIRST_YEAR = 2007;

/** A family must stand still this many complete years to read as stopped. */
const STALLED_YEARS = 5;

/** The recency window the second reading measures. */
const RECENT_YEARS = 3;

/** Bars in a route row's changes-per-year sparkline. */

export type BuildoutFamilyKey =
  | "bus_lane"
  | "camera_enforcement"
  | "select_bus_service"
  | "signal_priority"
  | "busway"
  | "other";

/**
 * Every `interventionType` the serving projection publishes. The projection
 * types the field as an open string, so the closed set lives here and
 * `FAMILY_BY_TYPE` is checked against it — a new type added to this list
 * without a family fails to compile.
 */
export const BUILDOUT_INTERVENTION_TYPES = [
  "bus_lane_infrastructure",
  "automated_bus_lane_enforcement",
  "select_bus_service",
  "transit_signal_priority",
  "busway",
  "stop_consolidation",
  "queue_jump",
  "documented_bus_priority_intervention",
] as const;

export type BuildoutInterventionType = (typeof BUILDOUT_INTERVENTION_TYPES)[number];

const FAMILY_BY_TYPE = {
  bus_lane_infrastructure: "bus_lane",
  automated_bus_lane_enforcement: "camera_enforcement",
  select_bus_service: "select_bus_service",
  transit_signal_priority: "signal_priority",
  busway: "busway",
  stop_consolidation: "other",
  queue_jump: "other",
  documented_bus_priority_intervention: "other",
} satisfies Record<BuildoutInterventionType, BuildoutFamilyKey>;

type BuildoutFamilyDefinition = {
  key: BuildoutFamilyKey;
  /** Chart series name. */
  label: string;
  /** Right-end label beside the current value. */
  endLabel: string;
  /** Sentence subject, e.g. "Bus lanes have not reached a new route since 2019". */
  subject: string;
  subjectIsPlural: boolean;
  /** Completes "Routes that …", e.g. "run on a street with a bus lane". */
  reach: string;
  /** Completes a route row headline, e.g. "Bus lane opened October 2025". */
  color: string;
};

/**
 * Series order, top to bottom. Colours are the product's own route roundel
 * hues; signal priority takes the muted ink the comp gives it because a sixth
 * saturated line at the axis floor reads as noise.
 */
export const BUILDOUT_FAMILIES: readonly BuildoutFamilyDefinition[] = [
  {
    key: "bus_lane",
    label: "Bus lane",
    endLabel: "bus lane",
    subject: "Bus lanes",
    subjectIsPlural: true,
    reach: "run on a street with a bus lane",
    color: "var(--bp-color-accent)",
  },
  {
    key: "camera_enforcement",
    label: "Camera enforcement",
    endLabel: "camera enforcement",
    subject: "Camera enforcement",
    subjectIsPlural: false,
    reach: "have camera enforcement",
    color: "var(--bp-route-queens)",
  },
  {
    key: "select_bus_service",
    label: "Select Bus Service",
    endLabel: "Select Bus Service",
    subject: "Select Bus Service",
    subjectIsPlural: false,
    reach: "run Select Bus Service",
    color: "var(--bp-route-si)",
  },
  {
    key: "signal_priority",
    label: "Signal priority",
    endLabel: "signal priority",
    subject: "Signal priority",
    subjectIsPlural: false,
    reach: "have signal priority",
    color: "var(--bp-color-ink-55)",
  },
  {
    key: "busway",
    label: "Busway",
    endLabel: "busway",
    subject: "Busways",
    subjectIsPlural: true,
    reach: "run on a busway",
    color: "var(--bp-route-express)",
  },
  {
    key: "other",
    label: "Other documented",
    endLabel: "other documented",
    subject: "Other documented changes",
    subjectIsPlural: true,
    reach: "carry another documented change",
    color: "var(--bp-route-bronx)",
  },
];

const FAMILY_BY_KEY = new Map(BUILDOUT_FAMILIES.map((family) => [family.key, family]));

export type BuildoutSeries = {
  familyKey: BuildoutFamilyKey;
  label: string;
  endLabel: string;
  color: string;
  values: readonly { year: number; routes: number }[];
  endValue: number;
};

export type BuildoutReading = { heading: string; sentence: string };

export type NetworkBuildout = {
  series: readonly BuildoutSeries[];
  firstYear: number;
  lastYear: number;
  /** The last year the whole of which the served release has published. */
  lastCompleteYear: number;
  partialFinalYear: boolean;
  readings: readonly BuildoutReading[];
  routesWithAnyChange: number;
  routesWithNoChange: number;
};

type DatedChange = { year: number; month: number | null; familyKey: BuildoutFamilyKey };

/** Display family for a published `interventionType`; anything unrecognised
 *  falls to "Other documented" rather than vanishing from the chart. */
export function buildoutFamilyForType(interventionType: string | undefined): BuildoutFamilyKey {
  if (interventionType === undefined) return "other";
  const mapped = (FAMILY_BY_TYPE as Record<string, BuildoutFamilyKey | undefined>)[
    interventionType
  ];
  return mapped ?? "other";
}

/** Calendar year of a record's source date, folded to the window opening. */
function windowYear(rawYear: string): number | null {
  const parsed = parseChangeDate(rawYear);
  if (parsed.precision === "unknown") return null;
  return Math.max(BUILDOUT_FIRST_YEAR, Number(parsed.start.slice(0, 4)));
}

/** Month a record was published at, or null when the source states only a year. */
function recordMonth(rawYear: string): number | null {
  const trimmed = rawYear.trim();
  return /^\d{4}-\d{2}(-\d{2})?$/u.test(trimmed) ? Number(trimmed.slice(5, 7)) : null;
}

function datedChanges(route: StudioRoute): DatedChange[] {
  return route.interventions.flatMap((event) => {
    const year = windowYear(event.year);
    if (year === null) return [];
    return [
      {
        year,
        month: recordMonth(event.year),
        familyKey: buildoutFamilyForType(event.interventionType),
      },
    ];
  });
}

/**
 * Cumulative routes reached by each treatment family, plus the three derived
 * readings beneath the chart. A route counts in every year from the first year
 * a family reached it onward; a second bus lane on the same route is not a
 * second route.
 */
export function networkBuildout(routes: readonly StudioRoute[]): NetworkBuildout {
  const firstYearByFamilyRoute = new Map<BuildoutFamilyKey, Map<string, number>>();
  for (const family of BUILDOUT_FAMILIES) firstYearByFamilyRoute.set(family.key, new Map());

  let lastYear = BUILDOUT_FIRST_YEAR;
  // The publication frontier: the latest dated record in the release.
  let frontierYear = BUILDOUT_FIRST_YEAR;
  let frontierMonth: number | null = null;
  let routesWithAnyChange = 0;

  for (const route of routes) {
    const changes = datedChanges(route);
    if (route.interventions.length > 0) routesWithAnyChange += 1;
    for (const change of changes) {
      lastYear = Math.max(lastYear, change.year);
      if (change.year > frontierYear) {
        frontierYear = change.year;
        frontierMonth = change.month;
      } else if (change.year === frontierYear && change.month !== null) {
        frontierMonth = Math.max(frontierMonth ?? 0, change.month);
      }
      // Exact identity: B44 and B44+ are different services and never merge.
      const seen = firstYearByFamilyRoute.get(change.familyKey);
      if (seen === undefined) continue;
      const known = seen.get(route.routeId);
      if (known === undefined || change.year < known) seen.set(route.routeId, change.year);
    }
  }

  const years: number[] = [];
  for (let year = BUILDOUT_FIRST_YEAR; year <= lastYear; year += 1) years.push(year);

  const series: BuildoutSeries[] = BUILDOUT_FAMILIES.map((family) => {
    const firstYears = [...(firstYearByFamilyRoute.get(family.key)?.values() ?? [])];
    const values = years.map((year) => ({
      year,
      routes: firstYears.filter((first) => first <= year).length,
    }));
    return {
      familyKey: family.key,
      label: family.label,
      endLabel: family.endLabel,
      color: family.color,
      values,
      endValue: values.at(-1)?.routes ?? 0,
    };
  });

  // The release is frozen mid-year, so its frontier year has not been published
  // to completion. A frontier stated only as a year cannot be proven partial.
  const partialFinalYear =
    lastYear === frontierYear && frontierMonth !== null && frontierMonth < 12;
  const lastCompleteYear = partialFinalYear ? lastYear - 1 : lastYear;

  return {
    series,
    firstYear: BUILDOUT_FIRST_YEAR,
    lastYear,
    lastCompleteYear,
    partialFinalYear,
    readings: buildoutReadings(series, BUILDOUT_FIRST_YEAR, lastYear, lastCompleteYear),
    routesWithAnyChange,
    routesWithNoChange: routes.length - routesWithAnyChange,
  };
}

function valueAt(series: BuildoutSeries, year: number): number {
  return series.values.find((point) => point.year === year)?.routes ?? 0;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

/**
 * The three readings, in the fixed order of the target contract. Each is
 * computed from `series` alone; a rule with no qualifying family drops its
 * reading rather than emitting a weakened one.
 */
export function buildoutReadings(
  series: readonly BuildoutSeries[],
  firstYear: number,
  lastYear: number,
  lastCompleteYear: number,
): BuildoutReading[] {
  const readings: BuildoutReading[] = [];

  // 1. Largest absolute growth across the whole window.
  const grown = [...series]
    .map((entry) => ({ entry, growth: entry.endValue - valueAt(entry, firstYear) }))
    .filter((candidate) => candidate.growth > 0)
    .sort((left, right) => right.growth - left.growth);
  const largest = grown[0];
  if (largest !== undefined) {
    const family = FAMILY_BY_KEY.get(largest.entry.familyKey);
    // The opening year folds in every pre-window record, and the frontier year
    // is incomplete; neither is a fair candidate for "biggest single year".
    let peakYear = 0;
    let peakDelta = 0;
    for (const point of largest.entry.values) {
      if (point.year <= firstYear || point.year > lastCompleteYear) continue;
      const delta = point.routes - valueAt(largest.entry, point.year - 1);
      if (delta > peakDelta) {
        peakDelta = delta;
        peakYear = point.year;
      }
    }
    if (family !== undefined) {
      const opening = valueAt(largest.entry, firstYear);
      const peak =
        peakDelta > 0
          ? ` The biggest single year was ${peakYear}, which added ${peakDelta} ${plural(peakDelta, "route", "routes")}.`
          : "";
      readings.push({
        heading: `${family.subject} grew the most`,
        sentence: `Routes that ${family.reach} went from ${opening} in ${firstYear} to ${largest.entry.endValue} in ${lastYear}.${peak}`,
      });
    }
  }

  // 2. Largest growth across the most recent complete years. The family the
  //    first reading already named is excluded, so the two readings never tell
  //    the same story twice.
  const recentBase = Math.max(firstYear, lastCompleteYear - RECENT_YEARS);
  const recent = series
    .filter((entry) => entry.familyKey !== largest?.entry.familyKey)
    .map((entry) => ({
      entry,
      growth: valueAt(entry, lastCompleteYear) - valueAt(entry, recentBase),
    }))
    .filter((candidate) => candidate.growth > 0 && recentBase < lastCompleteYear)
    .sort((left, right) => right.growth - left.growth);
  const fastest = recent[0];
  const fastestFamily =
    fastest === undefined ? undefined : FAMILY_BY_KEY.get(fastest.entry.familyKey);
  if (fastest !== undefined && fastestFamily !== undefined) {
    readings.push({
      heading: `${fastestFamily.subject} ${fastestFamily.subjectIsPlural ? "are" : "is"} the recent growth`,
      sentence: `${fastestFamily.subject} reached ${fastest.growth} more ${plural(fastest.growth, "route", "routes")} from ${recentBase + 1} to ${lastCompleteYear}, more than any other treatment in those years.`,
    });
  }

  // 3. Families that have stood still for five or more complete years.
  const stalled = series.flatMap((entry) => {
    // A family that has not reached anything inside the complete years has not
    // stopped spreading; it has not started.
    if (valueAt(entry, lastCompleteYear) === 0) return [];
    let lastMoved = firstYear;
    for (const point of entry.values) {
      if (point.year > lastCompleteYear) continue;
      const previous = point.year === firstYear ? 0 : valueAt(entry, point.year - 1);
      if (point.routes !== previous) lastMoved = point.year;
    }
    if (lastCompleteYear - lastMoved < STALLED_YEARS) return [];
    const family = FAMILY_BY_KEY.get(entry.familyKey);
    return family === undefined ? [] : [{ family, lastMoved }];
  });
  if (stalled.length > 0) {
    readings.push({
      heading: `${stalled.length} ${plural(stalled.length, "treatment has", "treatments have")} stopped spreading`,
      sentence: stalled
        .map(
          ({ family, lastMoved }) =>
            `${family.subject} ${family.subjectIsPlural ? "have" : "has"} not reached a new route since ${lastMoved}.`,
        )
        .join(" "),
    });
  }

  return readings;
}

/** Axis ceiling: the next round number above the tallest series. */
export function buildoutAxisMax(series: readonly BuildoutSeries[]): number {
  const peak = Math.max(1, ...series.map((entry) => entry.endValue));
  const step = peak <= 20 ? 5 : peak <= 100 ? 10 : peak <= 500 ? 50 : 100;
  return Math.ceil(peak / step) * step;
}

export type BuildoutEndLabel = {
  familyKey: BuildoutFamilyKey;
  endLabel: string;
  color: string;
  value: number;
  /** Vertical position in the plot box, 0 at the top. */
  topPercent: number;
};

/**
 * Right-end labels are the chart's legend, so they must stay readable when the
 * small families pile up on the axis floor. Positions start at each series'
 * true height, then a push-down/push-up pass opens a minimum gap without
 * letting the stack leave the plot box.
 */
export function buildoutEndLabels(
  series: readonly BuildoutSeries[],
  options: { axisMax: number; minGapPercent?: number },
): BuildoutEndLabel[] {
  const minGap = options.minGapPercent ?? 8;
  const familyOrder = new Map(BUILDOUT_FAMILIES.map((family, index) => [family.key, index]));
  const ordered = [...series].sort(
    (left, right) =>
      right.endValue - left.endValue ||
      (familyOrder.get(left.familyKey) ?? 0) - (familyOrder.get(right.familyKey) ?? 0),
  );
  const labels = ordered.map((entry) => ({
    familyKey: entry.familyKey,
    endLabel: entry.endLabel,
    color: entry.color,
    value: entry.endValue,
    topPercent: (1 - entry.endValue / Math.max(1, options.axisMax)) * 100,
  }));
  for (let index = 1; index < labels.length; index += 1) {
    const previous = labels[index - 1];
    const current = labels[index];
    if (previous === undefined || current === undefined) continue;
    current.topPercent = Math.max(current.topPercent, previous.topPercent + minGap);
  }
  for (let index = labels.length - 1; index >= 0; index -= 1) {
    const current = labels[index];
    const next = labels[index + 1];
    if (current === undefined) continue;
    const ceiling = next === undefined ? 100 : next.topPercent - minGap;
    current.topPercent = Math.max(0, Math.min(current.topPercent, ceiling));
  }
  return labels;
}

/**
 * Axis ticks on a regular stride from the opening year, always closing on the
 * frontier year so the reader can see where publication stops. Ticks are placed
 * by their true position on the span, not spread evenly across the row.
 */
export function buildoutAxisTicks(
  buildout: Pick<NetworkBuildout, "firstYear" | "lastYear" | "partialFinalYear">,
  tickCount = 6,
): { year: number; label: string; leftPercent: number; keepWhenNarrow: boolean }[] {
  const span = buildout.lastYear - buildout.firstYear;
  if (span <= 0) {
    return [
      {
        year: buildout.firstYear,
        label: String(buildout.firstYear),
        leftPercent: 0,
        keepWhenNarrow: true,
      },
    ];
  }
  const stride = Math.max(1, Math.ceil(span / Math.max(1, tickCount - 1)));
  const years = new Set<number>();
  for (let year = buildout.firstYear; year < buildout.lastYear; year += stride) years.add(year);
  years.add(buildout.lastYear);
  const ordered = [...years].sort((left, right) => left - right);
  // A phone cannot fit six of these without the last two colliding, so the
  // narrow axis keeps the opening year, the closing year and the one nearest
  // the midpoint.
  const midpoint = buildout.firstYear + span / 2;
  const middle = ordered
    .slice(1, -1)
    .reduce<number | null>(
      (best, year) =>
        best === null || Math.abs(year - midpoint) < Math.abs(best - midpoint) ? year : best,
      null,
    );
  return ordered.map((year, index) => ({
    year,
    label:
      year === buildout.lastYear && buildout.partialFinalYear ? `${year} so far` : String(year),
    leftPercent: ((year - buildout.firstYear) / span) * 100,
    keepWhenNarrow: index === 0 || index === ordered.length - 1 || year === middle,
  }));
}

/** Accessible description of the whole chart, naming every series end value. */
export function buildoutDescription(buildout: NetworkBuildout): string {
  const span = buildout.partialFinalYear
    ? `${buildout.firstYear} to ${buildout.lastYear} so far`
    : `${buildout.firstYear} to ${buildout.lastYear}`;
  const parts = buildout.series.map(
    (entry) =>
      `${entry.label} reaches ${entry.endValue} ${plural(entry.endValue, "route", "routes")}`,
  );
  return `Routes reached by each treatment, ${span}. ${parts.join(". ")}.`;
}
