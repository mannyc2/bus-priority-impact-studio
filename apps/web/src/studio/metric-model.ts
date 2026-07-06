import type { StudioRoute } from "./api-contract.js";

export type MetricTone = "ink" | "good" | "bad";

export type RouteMetric = {
  key: string;
  label: string;
  unit?: string;
  value: (route: StudioRoute) => string;
  sub: (route: StudioRoute) => string | null;
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
    unit: "mph",
    value: (route) => route.weightedAvgSpeed.toFixed(2),
    sub: (route) =>
      route.speedPercentile === null
        ? null
        : `${ordinal(route.speedPercentile)} percentile of NYC SBS routes`,
    tone: (route) => (route.weightedAvgSpeed < 6 ? "bad" : "ink"),
  },
  {
    key: "riders",
    label: "Daily riders",
    value: (route) => compactThousands(route.dailyRiders),
    sub: (route) =>
      route.ridersYoyPct === null
        ? null
        : `${route.ridersYoyPct >= 0 ? "+" : ""}${route.ridersYoyPct.toFixed(1)}% YoY`,
  },
  {
    key: "rider-hours",
    label: "Rider-hours lost / day",
    value: (route) => (route.riderHoursLost === null ? "—" : route.riderHoursLost.toLocaleString()),
    sub: (route) => (route.riderHoursLost === null ? null : "vs. scheduled timepoints"),
    tone: (route) => (route.riderHoursLost !== null && route.riderHoursLost > 0 ? "bad" : "ink"),
  },
  {
    key: "lane",
    label: "Bus lane coverage",
    unit: "%",
    value: (route) => String(route.laneCoverage),
    sub: () => "of route mileage",
  },
  {
    key: "ace",
    label: "ACE status",
    value: (route) => (route.aceStatus === "active" ? "Active" : "None"),
    sub: (route) => (route.aceSince ? `since ${route.aceSince}` : "no coverage"),
    tone: (route) => (route.aceStatus === "active" ? "good" : "ink"),
  },
];
