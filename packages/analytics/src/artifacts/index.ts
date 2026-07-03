import { join } from "node:path";
import { EXPRESS_ROUTE_ANALYSIS_STATIC_PERIOD } from "../feature-history/index.js";

export function contextEventRouteTouchAuditPath(artifactRoot: string): string {
  return join(artifactRoot, "context-events", "route-touch-audit.json");
}

export function expressBusCapacityContextPath(input: { artifactRoot: string }): string {
  return join(
    input.artifactRoot,
    "express-bus-capacity",
    `route-hour-summary-${EXPRESS_ROUTE_ANALYSIS_STATIC_PERIOD}.json`,
  );
}

export function expressRouteAnalysisPath(input: { artifactRoot: string }): string {
  return join(
    input.artifactRoot,
    "express-route-analysis",
    `load-speed-context-${EXPRESS_ROUTE_ANALYSIS_STATIC_PERIOD}.json`,
  );
}

export function expressRouteAnalysisAuditPath(input: { artifactRoot: string }): string {
  return join(
    input.artifactRoot,
    "express-route-analysis",
    `audit-${EXPRESS_ROUTE_ANALYSIS_STATIC_PERIOD}.json`,
  );
}

export function mapArtifactKey(...parts: string[]): string {
  return join("map", ...parts);
}

export function mapArtifactPath(artifactRoot: string, ...parts: string[]): string {
  return join(artifactRoot, mapArtifactKey(...parts));
}

export function mapArtifactManifestPath(artifactRoot: string, month: string): string {
  return mapArtifactPath(artifactRoot, month, "manifest.json");
}

export function parkingViolationMatchAuditPath(artifactRoot: string): string {
  return join(artifactRoot, "context-events", "parking-violation-match-audit.json");
}

export function routeHourlyProfileArtifactPath(input: {
  readonly artifactRoot: string;
  readonly startMonth: string;
  readonly endMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-feature-history",
    `${input.startMonth}_to_${input.endMonth}`,
    "route-hourly-profile.json",
  );
}

export function routeHourlyProfileRouteArtifactPath(input: {
  readonly artifactRoot: string;
  readonly routeSlug: string;
}): string {
  return join(input.artifactRoot, "studio", "v2", "routes", input.routeSlug, "hourly-profile.json");
}

export function routeSegmentMapArtifactKey(routeId: string, month: string): string {
  return mapArtifactKey("route-segments", routeId.toLowerCase(), month, "all-day.geojson");
}

export function routeSourceReconciliationPath(input: {
  artifactRoot: string;
  historyStartMonth: string;
  releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "route-source-reconciliation",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    "route-source-reconciliation.json",
  );
}

export function routeSpeedAvailabilityArtifactPath(artifactRoot: string): string {
  return join(artifactRoot, "source-availability", "route-speed-availability.json");
}

export function routeSpeedHistoryArtifactPath(input: {
  artifactRoot: string;
  routeSlug: string;
}): string {
  return join(input.artifactRoot, "studio", "v2", "routes", input.routeSlug, "speed-history.json");
}

export function routeSpeedHistoryManifestPath(input: {
  artifactRoot: string;
  startMonth: string;
  endMonth: string | null;
}): string {
  return join(
    input.artifactRoot,
    "studio",
    "v2",
    "speed-histories",
    `${input.startMonth}_to_${input.endMonth ?? "latest"}`,
    "manifest.json",
  );
}

export function routeSpeedSpineArtifactPath(input: {
  artifactRoot: string;
  routeSlug: string;
}): string {
  return join(input.artifactRoot, "studio", "v2", "routes", input.routeSlug, "speed-spine.json");
}

export function routeSpeedSpineManifestPath(input: {
  artifactRoot: string;
  startMonth: string;
  endMonth: string | null;
}): string {
  return join(
    input.artifactRoot,
    "studio",
    "v2",
    "speed-spines",
    `${input.startMonth}_to_${input.endMonth ?? "latest"}`,
    "manifest.json",
  );
}

export function routeTreatmentSummaryArtifactPath(input: {
  artifactRoot: string;
  month: string;
}): string {
  return join(
    input.artifactRoot,
    "studio",
    "v2",
    "route-treatment-summary",
    input.month,
    "route-treatment-summary.json",
  );
}

export function routeTreatmentSummaryMarkdownPath(input: {
  artifactRoot: string;
  month: string;
}): string {
  return join(
    input.artifactRoot,
    "studio",
    "v2",
    "route-treatment-summary",
    input.month,
    "route-treatment-summary.md",
  );
}

export function segmentDaypartPanelArtifactPath(input: {
  readonly artifactRoot: string;
  readonly startMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "feature-history",
    `${input.startMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "segment-daypart-panel.json",
  );
}

export function segmentDaypartResidualsArtifactPath(input: {
  readonly artifactRoot: string;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-models",
    "segment-daypart-residuals-v1",
    `${input.startMonth}_to_${input.endMonth}`,
    input.releaseMonth,
    "segment-daypart-residuals.json",
  );
}

export function segmentDaypartHistoryArtifactPath(input: {
  readonly artifactRoot: string;
  readonly startMonth: string;
  readonly endMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-feature-history",
    `${input.startMonth}_to_${input.endMonth}`,
    "segment-daypart-history.json",
  );
}

export function sourceCoverageLedgerPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "source-coverage", month, "ledger.json");
}

export function stopDirectionHourEwtFeatureArtifactPath(input: {
  readonly artifactRoot: string;
  readonly month: string;
  readonly runId: string;
  readonly routeId: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-stop-direction-hour-ewt",
    input.month,
    input.runId,
    input.routeId.toLowerCase(),
    "stop-direction-hour-ewt-features.json",
  );
}
