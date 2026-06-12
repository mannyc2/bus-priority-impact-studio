import type { RouteSurfaceCapability, StudioRouteCapability } from "@/studio/api-contract";

export type CoverageTone = "good" | "warn" | "bad" | "neutral" | "accent";

export type CoverageRow = {
  key: string;
  label: string;
  state: RouteSurfaceCapability["state"];
  stateLabel: string;
  tone: CoverageTone;
  reason: string | null;
  dataAsOf: string | null;
  depthLabel: string;
};

export type CheckedCleanCoverageChip = {
  key: string;
  label: string;
  checkedThroughLabel: string;
  dataAsOf: string | null;
  depthLabel: string;
  reason: string | null;
};

const SURFACE_LABELS: Record<string, string> = {
  condition: "Condition",
  detectorFindings: "Detector findings",
  geometry: "Route geometry",
  map: "Map",
  materializationCoverage: "Materialization coverage",
  reliability: "Reliability",
  ridership: "Ridership",
  routeGeometry: "Route geometry",
  scheduleBaseline: "Schedule baseline",
  speedHistory: "Speed history",
  treatment: "Treatments",
  trend: "Trend",
};

const STATE_LABELS: Record<RouteSurfaceCapability["state"], string> = {
  ready: "Ready",
  partial: "Partial",
  building: "Building",
  insufficient_data: "Insufficient data",
  checked_clean: "Checked clean",
  not_applicable: "Not applicable",
  blocked: "Blocked",
};

const STATE_TONES: Record<RouteSurfaceCapability["state"], CoverageTone> = {
  ready: "good",
  partial: "warn",
  building: "accent",
  insufficient_data: "neutral",
  checked_clean: "good",
  not_applicable: "neutral",
  blocked: "bad",
};

const STATE_ORDER: Record<RouteSurfaceCapability["state"], number> = {
  ready: 0,
  checked_clean: 1,
  partial: 2,
  building: 3,
  insufficient_data: 4,
  blocked: 5,
  not_applicable: 6,
};

export function coverageRows(capability: StudioRouteCapability | null): CoverageRow[] {
  if (capability === null) return [];
  return Object.entries(capability.surfaces)
    .map(([key, surface]) => ({
      key,
      label: SURFACE_LABELS[key] ?? labelFromKey(key),
      state: surface.state,
      stateLabel: STATE_LABELS[surface.state],
      tone: STATE_TONES[surface.state],
      reason: surface.reason,
      dataAsOf: surface.dataAsOf,
      depthLabel: depthLabel(surface.depth),
    }))
    .sort(
      (left, right) =>
        STATE_ORDER[left.state] - STATE_ORDER[right.state] || left.label.localeCompare(right.label),
    );
}

export function coverageSummary(rows: readonly CoverageRow[]): string {
  if (rows.length === 0) return "No manifest surfaces published";

  const checkedClean = rows.filter((row) => row.state === "checked_clean").length;
  const ready = rows.filter((row) => row.state === "ready").length;
  const partial = rows.filter((row) => row.state === "partial").length;
  const building = rows.filter((row) => row.state === "building").length;
  const insufficient = rows.filter((row) => row.state === "insufficient_data").length;
  const blocked = rows.filter((row) => row.state === "blocked").length;
  const notApplicable = rows.filter((row) => row.state === "not_applicable").length;
  const parts = [
    `${ready} ready`,
    checkedClean > 0 ? `${checkedClean} checked clean` : null,
    partial > 0 ? `${partial} partial` : null,
    building > 0 ? `${building} building` : null,
    insufficient > 0 ? `${insufficient} insufficient` : null,
    blocked > 0 ? `${blocked} blocked` : null,
    notApplicable > 0 ? `${notApplicable} not applicable` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "No manifest surfaces published";
}

export function checkedCleanCoverageChips(
  rows: readonly CoverageRow[],
): CheckedCleanCoverageChip[] {
  return rows
    .filter((row) => row.state === "checked_clean")
    .map((row) => ({
      key: row.key,
      label: row.label,
      checkedThroughLabel: row.dataAsOf ? `through ${row.dataAsOf}` : "through unknown",
      dataAsOf: row.dataAsOf,
      depthLabel: row.depthLabel,
      reason: row.reason,
    }));
}

export function coverageLatestDataAsOf(rows: readonly CoverageRow[]): string | null {
  return latestDataAsOf(rows.map((row) => row.dataAsOf));
}

export function coverageLatestSurfaceDataAsOf(
  capability: StudioRouteCapability | null,
  surfaceKeys: readonly string[],
): string | null {
  if (capability === null) return null;
  return latestDataAsOf(surfaceKeys.map((key) => capability.surfaces[key]?.dataAsOf ?? null));
}

function latestDataAsOf(values: readonly (string | null)[]): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (value !== null && (latest === null || value > latest)) latest = value;
  }
  return latest;
}

function depthLabel(depth: RouteSurfaceCapability["depth"]): string {
  if (depth === null) return "depth not published";
  const months =
    depth.monthsCovered === 1 ? "1 month" : `${depth.monthsCovered.toLocaleString()} months`;
  return depth.grains.length > 0 ? `${months} / ${depth.grains.join(", ")}` : months;
}

function labelFromKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
