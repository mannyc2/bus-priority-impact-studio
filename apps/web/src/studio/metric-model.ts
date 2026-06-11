import type { StudioRoute } from "./api-contract.js";

/**
 * Single source of truth for the five route KPI metrics shared by the
 * single-route detail strip (RouteMetricStrip) and the A->B compare strip
 * (RouteDeltaStrip). Keep this file data-only (no JSX / chart imports) so the
 * route loaders that pull it in don't leak chart code into the initial bundle.
 */

export type MetricTone = "ink" | "good" | "bad";

export type RouteMetric = {
  key: string;
  /** Long label used by the single-route detail strip. */
  label: string;
  /** Compact label used by the dense compare delta strip. */
  compareLabel: string;
  /** Unit rendered next to the value (small). */
  unit?: string;
  /** Whether a higher value is the better outcome. Omitted = not comparable. */
  higherIsBetter?: boolean;
  /** Numeric basis for delta math. `null` marks a non-comparable metric (ACE). */
  numeric: ((route: StudioRoute) => number) | null;
  /** Bare display value for one route (no unit). */
  value: (route: StudioRoute) => string;
  /** Format a numeric delta for the compare strip. Absent when not comparable. */
  formatDelta?: (delta: number) => string;
  /** Sub-label shown under the value in the detail strip. */
  sub: (route: StudioRoute) => string;
  /** Value tone in the detail strip. Defaults to "ink". */
  tone?: (route: StudioRoute) => MetricTone;
};

function compactThousands(n: number): string {
  return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"] as const;
  const v = n % 100;
  const suffix = suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0];
  return `${n}${suffix}`;
}

export const ROUTE_METRICS: RouteMetric[] = [
  {
    key: "speed",
    label: "Weighted avg speed",
    compareLabel: "Weighted speed",
    unit: "mph",
    higherIsBetter: true,
    numeric: (route) => route.weightedAvgSpeed,
    value: (route) => route.weightedAvgSpeed.toFixed(2),
    formatDelta: (delta) => delta.toFixed(2),
    sub: (route) => `${ordinal(route.speedPercentile)} percentile of NYC SBS routes`,
    tone: (route) => (route.weightedAvgSpeed < 6 ? "bad" : "ink"),
  },
  {
    key: "riders",
    label: "Daily riders",
    compareLabel: "Daily riders",
    higherIsBetter: true,
    numeric: (route) => route.dailyRiders,
    value: (route) => compactThousands(route.dailyRiders),
    formatDelta: (delta) => compactThousands(delta),
    sub: (route) => `${route.ridersYoyPct >= 0 ? "+" : ""}${route.ridersYoyPct.toFixed(1)}% YoY`,
  },
  {
    key: "rider-hours",
    label: "Rider-hours lost / day",
    compareLabel: "Rider-hours lost",
    higherIsBetter: false,
    numeric: (route) => route.riderHoursLost,
    value: (route) => route.riderHoursLost.toLocaleString(),
    formatDelta: (delta) => delta.toLocaleString(),
    sub: () => "vs. scheduled timepoints",
    tone: () => "bad",
  },
  {
    key: "lane",
    label: "Bus lane coverage",
    compareLabel: "Lane coverage",
    unit: "%",
    higherIsBetter: true,
    numeric: (route) => route.laneCoverage,
    value: (route) => String(route.laneCoverage),
    formatDelta: (delta) => String(delta),
    sub: () => "of route mileage",
  },
  {
    key: "ace",
    label: "ACE status",
    compareLabel: "ACE status",
    numeric: null,
    value: (route) => (route.aceStatus === "active" ? "Active" : "None"),
    sub: (route) => (route.aceSince ? `since ${route.aceSince}` : "no coverage"),
    tone: (route) => (route.aceStatus === "active" ? "good" : "ink"),
  },
];
