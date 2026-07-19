import {
  type createD1ServingDb,
  type RouteObservedReliabilitySummary as D1RouteObservedReliabilitySummary,
  listStudioRouteIndexSourceRows,
  type StudioRouteIndexSourceRow,
} from "@bp/db/d1";
import {
  assertInjectiveStudioRouteIdentityUniverse,
  type RouteSurfaceState,
  routeIdToStudioSlug,
  STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME,
  StudioCurrentBusRouteTypeSchema,
  StudioCurrentBusTripTypeSchema,
  type StudioRouteCapability,
  studioRouteServiceModesForOfficialTypes,
} from "@bp/domain/studio";
import type { StudioObservedReliability, StudioRoute } from "@bp/domain/studio/routes";
import type {
  StudioRouteFamily,
  StudioRouteIndex2Row,
  StudioRouteIndex3Row,
  StudioSnapshot2ProjectionRef,
} from "@bp/domain/studio/snapshots";
import { decodeSchemaStrict } from "../schema-decode.js";

function roundPct(value: number | null): number | null {
  return value === null ? null : Number((value * 100).toFixed(1));
}

export function realtimeSourceForRunId(
  runId: string | null,
): "official_self_collected" | "third_party_recovered" | "none" {
  if (runId === null) {
    return "none";
  }

  return runId.startsWith("bus-observatory-") ? "third_party_recovered" : "official_self_collected";
}

export { routeIdToStudioSlug } from "@bp/domain/studio";

export function boroughForRouteId(routeId: string): StudioRouteIndex2Row["borough"] {
  const upper = routeId.toUpperCase();
  if (upper.startsWith("BX")) return "Bronx";
  if (upper.startsWith("B")) return "Brooklyn";
  if (upper.startsWith("Q")) return "Queens";
  if (upper.startsWith("S")) return "Staten Island";
  return "Manhattan";
}

export type NormalizedStudioRouteIndexSourceRow = StudioRouteIndexSourceRow & {
  averageSpeedMph: number;
  busLaneMatchedLaneCount: number;
  effectiveStopCount: number;
  totalRidership: number;
  aceActive: boolean;
  readinessStatus: string;
  readinessScore: number | null;
  routeScoreSort: number;
  missingSpeedHistoryCellCount: number;
};

export function normalizeStudioRouteIndexSourceRow(
  row: StudioRouteIndexSourceRow,
): NormalizedStudioRouteIndexSourceRow {
  return {
    ...row,
    averageSpeedMph: row.summary?.averageSpeedMph ?? row.readiness?.averageSpeedMph ?? 0,
    busLaneMatchedLaneCount: row.summary?.busLaneMatchedLaneCount ?? 0,
    effectiveStopCount: row.readiness?.stopCount ?? row.stopCount,
    totalRidership: row.summary?.totalRidership ?? 0,
    aceActive: row.summary?.aceActive ?? false,
    readinessStatus: row.readiness?.status ?? "No readiness row",
    readinessScore: row.readiness?.score ?? null,
    routeScoreSort: row.summary?.routeScore ?? 101,
    missingSpeedHistoryCellCount: row.speedHistoryCoverage?.missingCellCount ?? 0,
  };
}

export async function listNormalizedStudioRouteIndexSourceRows(
  db: ReturnType<typeof createD1ServingDb>,
  month: string,
): Promise<NormalizedStudioRouteIndexSourceRow[]> {
  const rows = await listStudioRouteIndexSourceRows(db, month);
  const normalized = rows.map(normalizeStudioRouteIndexSourceRow);
  assertInjectiveStudioRouteIdentityUniverse(normalized, "D1 Studio route index");
  return normalized;
}

export function routeFamilyForIndexRow(
  row: NormalizedStudioRouteIndexSourceRow,
): StudioRouteFamily {
  const text = [row.routeId, row.routeShortName, row.routeLongName, ...row.routeTypes]
    .join(" ")
    .toLowerCase();
  if (text.includes("select bus service") || text.includes("sbs") || row.routeId.includes("+")) {
    return "select_bus_service";
  }
  if (text.includes("express") || row.routeId.toUpperCase().startsWith("SIM")) return "express";
  if (text.includes("limited") || text.includes("ltd")) return "limited";
  if (text.includes("shuttle")) return "shuttle";
  if (row.routeTypes.length > 0 || row.routeShortName.length > 0) return "local";
  return "unknown";
}

export function routeProjectionRef(
  ref: StudioSnapshot2ProjectionRef,
): StudioSnapshot2ProjectionRef {
  return ref;
}

export function hasRouteTimelineBundle(row: NormalizedStudioRouteIndexSourceRow): boolean {
  return row.artifactNames.includes(STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME);
}

// Capability now arrives pre-built from the pipeline `route_capability_manifest`
// (frontend §7.1 / C1). When a route is absent from the manifest, fall back to the
// honest empty state rather than computing surface states in the Worker.
export const FALLBACK_ROUTE_CAPABILITY: StudioRouteCapability = {
  overallState: "insufficient_data",
  surfaces: {},
  caveats: [],
};

// The legacy four-tier support level survives only as a derived label on the
// "needs attention" section rows. The mapping is exact: the manifest `overallState`
// was rolled up from the same summary/artifact/finding signals the old tiers used.
export const SUPPORT_LEVEL_BY_OVERALL_STATE: Record<
  RouteSurfaceState,
  "index_only" | "summary_ready" | "artifact_ready" | "evidence_ready"
> = {
  insufficient_data: "index_only",
  blocked: "index_only",
  building: "summary_ready",
  partial: "artifact_ready",
  checked_clean: "artifact_ready",
  not_applicable: "artifact_ready",
  ready: "evidence_ready",
};

export function supportLevelLabel(
  capability: StudioRouteCapability,
): "index_only" | "summary_ready" | "artifact_ready" | "evidence_ready" {
  return SUPPORT_LEVEL_BY_OVERALL_STATE[capability.overallState];
}

// Core surfaces whose gaps drive the data-coverage ranking. A surface is a "gap"
// when it is neither serving (`ready`) nor honestly empty after looking
// (`checked_clean` / `not_applicable`).
export const CORE_COVERAGE_SURFACES: readonly { key: string; label: string }[] = [
  { key: "condition", label: "summary" },
  { key: "detectorFindings", label: "detector findings" },
  { key: "speedHistory", label: "speed history" },
  { key: "ridership", label: "ridership history" },
  { key: "scheduleBaseline", label: "schedule baseline" },
];

export function isCoverageGap(
  state: RouteSurfaceState | undefined,
): state is Exclude<RouteSurfaceState, "ready" | "checked_clean" | "not_applicable"> {
  return (
    state !== undefined &&
    state !== "ready" &&
    state !== "checked_clean" &&
    state !== "not_applicable"
  );
}

export function coverageGaps(
  capability: StudioRouteCapability,
): { label: string; state: string }[] {
  return CORE_COVERAGE_SURFACES.flatMap(({ key, label }) => {
    const state = capability.surfaces[key]?.state;
    return isCoverageGap(state) ? [{ label, state }] : [];
  });
}

export function routeIndexCaveats(row: NormalizedStudioRouteIndexSourceRow): string[] {
  const caveats: string[] = [];
  if (row.summary === null) {
    caveats.push("No rich route summary is available for the baseline month.");
  } else if (!row.summary.publicVisible) {
    caveats.push("A baseline summary exists, but the rich public artifact gate is not satisfied.");
  }
  if (row.artifactNames.length === 0) {
    caveats.push("No route artifact bundle is indexed for this route in D1.");
  }
  if (row.historyCoverage.speedMonthCount === 0) {
    caveats.push("No monthly public speed history rows are available for this route.");
  }
  if (row.historyCoverage.speedMonthCount > 0 && row.speedHistoryCoverage === null) {
    caveats.push("Monthly speed rows exist, but no route speed-history R2 artifact is indexed.");
  }
  if (row.missingSpeedHistoryCellCount > 0) {
    caveats.push(
      `Route speed-history artifact has ${row.missingSpeedHistoryCellCount} missing cells.`,
    );
  }
  if (row.readiness === null) {
    caveats.push("No baseline route-readiness row is available for this route.");
  }
  return caveats;
}

export function routeProjectionRefs(input: {
  row: NormalizedStudioRouteIndexSourceRow;
  lastBuiltSpeedMonth: string | undefined;
}): StudioSnapshot2ProjectionRef[] {
  const { row } = input;
  const refs: StudioSnapshot2ProjectionRef[] = [];
  if (row.historyCoverage.pointCount > 0) {
    refs.push(
      routeProjectionRef({
        id: "route_history_summary",
        status: "available",
        schemaVersion: 1,
        grain: "route_month",
        storage: "d1",
        path: `/api/v1/studio/routes/${routeIdToStudioSlug(row.routeId)}/history`,
        months: {
          start: row.historyCoverage.startMonth,
          end: row.historyCoverage.endMonth,
        },
      }),
    );
  }
  if (row.speedHistoryCoverage !== null) {
    const speedHistoryStatus = (() => {
      switch (row.speedHistoryCoverage.spineReadiness) {
        case "series_ready":
          return row.speedHistoryCoverage.missingCellCount > 0 ? "partial" : "available";
        case "series_ready_with_gaps":
        case "needs_pattern_review":
          return "partial";
        case "failed":
          return "downstream_blocked";
        case null:
          return "partial";
      }
    })();
    refs.push(
      routeProjectionRef({
        id: "route_speed_history",
        status: speedHistoryStatus,
        schemaVersion: 1,
        grain: "route_segment_month_daypart",
        storage: "r2",
        path: `/api/v1/studio/routes/${routeIdToStudioSlug(row.routeId)}/speed-history`,
        months: {
          start: row.speedHistoryCoverage.startMonth,
          end: input.lastBuiltSpeedMonth ?? row.speedHistoryCoverage.endMonth,
        },
      }),
    );
  }
  if (row.summary !== null) {
    refs.push(
      routeProjectionRef({
        id: "route_summary",
        status: row.summary.publicVisible ? "available" : "partial",
        schemaVersion: 1,
        grain: "route_month",
        storage: "d1",
        path: "d1:route_brief_summary",
        months: null,
      }),
    );
  }
  if (row.artifactNames.length > 0) {
    refs.push(
      routeProjectionRef({
        id: "route_artifacts",
        status: "available",
        schemaVersion: 1,
        grain: "route_month_artifact",
        storage: "d1",
        path: "d1:route_artifact",
        months: null,
      }),
    );
  }
  if (hasRouteTimelineBundle(row)) {
    refs.push(
      routeProjectionRef({
        id: "route_timeline",
        status: "available",
        schemaVersion: 1,
        grain: "route_evidence",
        storage: "r2",
        path: `/api/v1/studio/routes/${routeIdToStudioSlug(row.routeId)}/timeline`,
        months: null,
      }),
    );
  }
  return refs;
}

export function exactRoutePresentationForIndexRow(row: NormalizedStudioRouteIndexSourceRow) {
  const routeTypes = [...new Set(row.routeTypes)]
    .map((routeType) => decodeSchemaStrict(StudioCurrentBusRouteTypeSchema, routeType))
    .toSorted();
  const tripTypes = [...new Set(row.tripTypes)]
    .map((tripType) => decodeSchemaStrict(StudioCurrentBusTripTypeSchema, tripType))
    .toSorted((left, right) => String(left).localeCompare(String(right)));
  const serviceModes = studioRouteServiceModesForOfficialTypes(routeTypes, tripTypes);
  const designationLiterals = [
    ...new Set([
      ...routeTypes.map((routeType) => `route_type:${routeType}`),
      ...tripTypes.map((tripType) => `trip_type:${String(tripType)}`),
    ]),
  ].toSorted();
  return {
    routeId: row.routeId,
    routeFamilyId: row.routeId.endsWith("+") ? row.routeId.slice(0, -1) : row.routeId,
    displayLabel: row.routeShortName,
    officialLongName: row.routeLongName,
    designationLiterals,
    serviceModes,
    routeTypes,
    tripTypes,
  };
}

export function buildStudioRouteIndex2Row(input: {
  releaseId: string;
  baselineMonth: string;
  generatedAt: string;
  lastBuiltSpeedMonth: string | undefined;
  row: NormalizedStudioRouteIndexSourceRow;
  capability: StudioRouteCapability;
}): StudioRouteIndex2Row {
  const slug = routeIdToStudioSlug(input.row.routeId);
  return {
    releaseId: input.releaseId,
    baselineMonth: input.baselineMonth,
    routeId: input.row.routeId,
    slug,
    label: input.row.routeShortName,
    longName: input.row.routeLongName,
    borough: boroughForRouteId(input.row.routeId),
    routeFamily: routeFamilyForIndexRow(input.row),
    publicUrl: `/routes/${slug}`,
    capability: input.capability,
    historyCoverage: input.row.historyCoverage,
    caveats: routeIndexCaveats(input.row),
    projectionRefs: routeProjectionRefs({
      row: input.row,
      lastBuiltSpeedMonth: input.lastBuiltSpeedMonth,
    }),
    updatedAt: input.generatedAt,
  };
}

export function buildStudioRouteIndex3Row(
  input: Parameters<typeof buildStudioRouteIndex2Row>[0],
): StudioRouteIndex3Row {
  const legacy = buildStudioRouteIndex2Row(input);
  const presentation = exactRoutePresentationForIndexRow(input.row);
  return {
    ...legacy,
    ...presentation,
    routeSchemaVersion: 2,
    label: presentation.displayLabel,
    longName: presentation.officialLongName,
  };
}

export function buildObservedReliabilityFromD1(
  row: D1RouteObservedReliabilitySummary | undefined,
): StudioObservedReliability | null {
  if (row === undefined) return null;
  const source = realtimeSourceForRunId(row.runId);
  if (source === "none") return null;
  const caveats =
    source === "third_party_recovered"
      ? [
          "Observed reliability is recovered from the third-party Bus Observatory archive, not official MTA historical replay.",
          "Monthly public speed evidence remains official MTA Open Data; realtime evidence has separate provenance.",
        ]
      : ["Observed reliability comes from self-collected MTA Bus Time GTFS-RT snapshots."];
  if (row.reliabilityStatus === "insufficient_gtfs_rt_samples") {
    caveats.push(
      `Sample count (${row.sampleCount}) is below the minimum threshold (${row.minSampleThreshold}); headway statistics are not reported.`,
    );
  }
  return {
    month: row.month,
    runId: row.runId,
    source,
    releaseLayer: "observed_release",
    reliabilityStatus: row.reliabilityStatus,
    sampleCount: row.sampleCount,
    medianObservedHeadwayMinutes: row.medianObservedHeadwayMinutes,
    p90ObservedHeadwayMinutes: row.p90ObservedHeadwayMinutes,
    observedBunchingShare: row.observedBunchingShare,
    observedLongGapShare: row.observedLongGapShare,
    excessWaitMinutes: row.excessWaitMinutes,
    caveats,
  };
}

export function routeTerminiForIndexRow(row: NormalizedStudioRouteIndexSourceRow): {
  north: string;
  south: string;
} {
  const longName = row.routeLongName ?? row.routeShortName;
  const [north, south] = longName.split(" - ");
  return {
    north: north?.trim() || row.routeShortName,
    south: south?.trim() || "Terminal",
  };
}

export function routeLabelForIndexRow(row: NormalizedStudioRouteIndexSourceRow): string {
  return row.routeShortName;
}

export function routeSpeedMphForIndexRow(row: NormalizedStudioRouteIndexSourceRow): number {
  return Number(row.averageSpeedMph.toFixed(1));
}

export function routeLaneCoverageForIndexRow(row: NormalizedStudioRouteIndexSourceRow): number {
  if (row.effectiveStopCount === 0) return 0;
  return Math.min(100, Math.round((row.busLaneMatchedLaneCount / row.effectiveStopCount) * 100));
}

export function routeReliabilityLabelForIndexRow(row: NormalizedStudioRouteIndexSourceRow): string {
  if (row.summary === null) return "Indexed route";
  if (row.summary.routeScore >= 70) return "High attention route";
  if (row.summary.routeScore >= 40) return "Watch list route";
  return "Lower-risk route";
}

export function routeDiagnosisForIndexRow(
  row: NormalizedStudioRouteIndexSourceRow,
  speedMph: number,
  coverage: number,
): string {
  const month = row.summary === null ? "the baseline month" : "the baseline serving export";
  if (row.summary !== null) {
    return `${row.routeShortName} has a route score of ${row.summary.routeScore}, ${row.summary.hotspotCount} slow segment hotspots, ${speedMph} mph observed speed, and ${coverage}% lane coverage in ${month}.`;
  }
  if (row.readiness !== null) {
    return `${row.routeShortName} is indexed from the route catalog with baseline readiness status ${row.readiness.status}, but no rich route summary is available for ${month}.`;
  }
  return `${row.routeShortName} is indexed from the route catalog, but no baseline readiness or rich route summary is available yet.`;
}

export function routeFlagsForIndexRow(row: NormalizedStudioRouteIndexSourceRow): string[] {
  return [
    row.aceActive ? "ACE active" : "ACE inactive",
    row.artifactNames.length > 0 ? "Rich artifact indexed" : "No rich artifact",
    row.summary === null
      ? "No baseline summary"
      : row.summary.publicVisible
        ? "Public summary"
        : "Summary gated",
    row.readinessStatus,
    row.historyCoverage.pointCount > 0
      ? `${row.historyCoverage.pointCount} history months`
      : "No history rows",
  ];
}

export function buildStudioRouteCardFromIndexRow(
  row: NormalizedStudioRouteIndexSourceRow,
  observed: D1RouteObservedReliabilitySummary | undefined,
  speedPercentile: number | null,
): StudioRoute {
  const slug = routeIdToStudioSlug(row.routeId);
  const speedMph = routeSpeedMphForIndexRow(row);
  const coverage = routeLaneCoverageForIndexRow(row);
  const presentation = exactRoutePresentationForIndexRow(row);
  const corridor = presentation.officialLongName ?? presentation.displayLabel;
  return {
    slug,
    routeId: presentation.routeId,
    label: presentation.displayLabel,
    routeSchemaVersion: 2,
    routeFamilyId: presentation.routeFamilyId,
    displayLabel: presentation.displayLabel,
    officialLongName: presentation.officialLongName,
    designationLiterals: presentation.designationLiterals,
    serviceModes: presentation.serviceModes,
    routeTypes: presentation.routeTypes,
    tripTypes: presentation.tripTypes,
    corridor,
    corridorFull: corridor,
    borough: boroughForRouteId(row.routeId),
    sbs: presentation.serviceModes.includes("sbs"),
    speedMph,
    scheduledMph: null,
    weightedAvgSpeed: speedMph,
    speedPercentile,
    dailyRiders: Math.round(row.totalRidership / 30),
    ridersYoyPct: null,
    riderHoursLost: null,
    laneCoverage: coverage,
    aceStatus: row.aceActive ? "active" : "none",
    aceSince: null,
    tspCoverage: "none",
    reliability: routeReliabilityLabelForIndexRow(row),
    observedReliability: buildObservedReliabilityFromD1(observed),
    diagnosis: routeDiagnosisForIndexRow(row, speedMph, coverage),
    spark: null,
    termini: routeTerminiForIndexRow(row),
    miles: null,
    stops: row.effectiveStopCount,
    flags: routeFlagsForIndexRow(row),
    peerSlug: null,
    movement6mPct: roundPct(row.historyStats.speedMovement6mPct),
    context12mPct: roundPct(row.historyStats.speedMovement12mPct),
    interventions: [],
  };
}

export function speedPercentilesForRouteIndexRows(
  rows: readonly NormalizedStudioRouteIndexSourceRow[],
): Map<string, number> {
  const ranked = rows
    .filter((row) => row.summary !== null)
    .map((row) => ({
      routeId: row.routeId,
      speedMph: routeSpeedMphForIndexRow(row),
    }))
    .toSorted(
      (left, right) => left.speedMph - right.speedMph || left.routeId.localeCompare(right.routeId),
    );
  const denominator = ranked.length - 1 || 1;
  return new Map(
    ranked.map((row, index) => [row.routeId, Math.round((index / denominator) * 98) + 1]),
  );
}
