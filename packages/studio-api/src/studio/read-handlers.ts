import {
  createD1ServingDb,
  type RouteMonthTrend as D1RouteMonthTrend,
  type RouteObservedReliabilitySummary as D1RouteObservedReliabilitySummary,
  type SourceMonthCoverage as D1SourceMonthCoverage,
  findLatestSpeedTrendMonth,
  findLatestStudioServingMonth,
  findRouteEquityContext,
  listPublicSnapshotSourceMonthCoverage,
  listRouteMonthTrends,
  listRouteObservedReliabilitySummaries,
  listStudioRouteIndexSourceRows,
  type StudioRouteIndexSourceRow,
} from "@bp/db/d1";
import * as z from "@bp/domain/schema-compat";
import {
  buildRouteInsightsFromDetectorReadiness,
  type DetectorReadinessServingManifestForInsights,
  DetectorReadinessServingManifestForInsightsSchema,
  emptyStudioRouteEvidenceBundle,
  getStudioRoute,
  type RouteCapabilityManifestForIndex,
  RouteCapabilityManifestForIndexSchema,
  type RouteDossierSummaryForDetail,
  RouteDossierSummaryForDetailSchema,
  type RouteSurfaceState,
  routeDossierSummaryKey,
  STUDIO_ROUTE_CAPABILITY_MANIFEST_KEY,
  STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME,
  STUDIO_ROUTE_EVIDENCE_INDEX_KEY,
  type StudioInterventionsEvidenceBundle,
  StudioInterventionsEvidenceBundleSchema,
  type StudioInterventionsEvidenceCitation,
  StudioInterventionsEvidenceCitationSchema,
  type StudioInterventionsEvidenceResponse,
  StudioInterventionsEvidenceResponseSchema,
  type StudioRouteCapability,
  type StudioRouteEvidenceBundle,
  StudioRouteEvidenceBundleSchema,
  type StudioRouteEvidenceIndex,
  type StudioRouteEvidenceIndexRoute,
  StudioRouteEvidenceIndexSchema,
  studioRouteEvidenceBundleKey,
} from "@bp/domain/studio";
import {
  type StudioDocsResponse,
  StudioDocsResponseSchema,
  StudioMethodsResponseSchema,
} from "@bp/domain/studio/docs";
import {
  type StudioObservedReliability,
  type StudioRoute,
  type StudioRouteDetailResponse,
  StudioRouteDetailResponseSchema,
  type StudioRouteEquityContext,
  type StudioRouteHistoryResponse,
  StudioRouteHistoryResponseSchema,
  type StudioRouteHourlyProfileResponse,
  StudioRouteHourlyProfileResponseSchema,
  type StudioRouteSection,
  type StudioRouteSectionId,
  type StudioRouteSectionMetric,
  type StudioRouteSectionRow,
  type StudioRouteSectionsResponse,
  StudioRouteSectionsResponseSchema,
  type StudioRouteSpeedHistoryResponse,
  StudioRouteSpeedHistoryResponseSchema,
  type StudioRoutesResponse,
  StudioRoutesResponseSchema,
  type StudioSegment,
} from "@bp/domain/studio/routes";
import {
  STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY,
  STUDIO_ROUTE_DETECTOR_READINESS_MANIFEST_KEY,
  type StudioRouteFamily,
  type StudioRouteIndex2Response,
  StudioRouteIndex2ResponseSchema,
  type StudioRouteIndex2Row,
  type StudioSnapshot2,
  type StudioSnapshot2ProjectionRef,
  type StudioSnapshotProjection,
  StudioSnapshotResponseSchema,
  type StudioSourceMonthState,
} from "@bp/domain/studio/snapshots";
import { studioOpenApiDocument } from "../contracts/openapi.js";
import type { StudioApiEnv } from "../env.js";
import { errorResponse } from "../http/errors.js";
import {
  loadStudioProjection,
  maybeLoadStudioRouteDetailProjection,
  studioJsonResponse,
  studioProjectionKey,
  studioProjectionPrefix,
  studioReleaseKey,
} from "./projections.js";

// BASELINE_MONTH / LAST_BUILT_SPEED_MONTH are intentionally absent (hard-cutover C3):
// public read responses resolve their months internally from D1, never from env.
export type StudioReadEnv = Pick<StudioApiEnv, "ARTIFACTS" | "DB" | "STUDIO_RELEASE_KEY">;

const OPENAPI_DOC_METHODS = ["get", "post", "put", "patch", "delete"] as const;
const ARTIFACT_NOT_AVAILABLE_MESSAGE = "Artifact is not available.";
const SERVICE_DEPENDENCY_NOT_CONFIGURED_MESSAGE = "Service dependency is not configured.";
const SNAPSHOT_CONTRACT_VALIDATION_MESSAGE = "Studio snapshot failed contract validation.";
const SNAPSHOT_2_OMITTED_CAVEAT =
  "Snapshot 2.0 manifest failed contract validation and is temporarily omitted.";

function dependencyNotConfiguredResponse(dependency: string, context: string): Response {
  console.error("Service dependency is not configured.", { context, dependency });
  return errorResponse(503, SERVICE_DEPENDENCY_NOT_CONFIGURED_MESSAGE);
}

function artifactNotAvailableResponse(status: number, context: string, key: string): Response {
  console.error(context, { key });
  return errorResponse(status, ARTIFACT_NOT_AVAILABLE_MESSAGE);
}

function snapshotContractFailureResponse(details: unknown): Response {
  console.error(SNAPSHOT_CONTRACT_VALIDATION_MESSAGE, details);
  return errorResponse(502, SNAPSHOT_CONTRACT_VALIDATION_MESSAGE);
}

function snapshotQualityWithCaveat(
  quality: StudioRoutesResponse["quality"],
  caveat: string,
): StudioRoutesResponse["quality"] {
  return {
    ...quality,
    confidence: "low",
    caveats: [...quality.caveats, caveat],
  };
}

function studioDocsEndpointsFromOpenApi(): StudioDocsResponse["endpoints"] {
  return Object.entries(studioOpenApiDocument.paths).flatMap(([path, pathItem]) =>
    OPENAPI_DOC_METHODS.flatMap((method) => {
      const operation = pathItem[method];
      if (operation === undefined) return [];
      return [
        {
          method: method.toUpperCase(),
          path,
          body: operation.summary,
        },
      ];
    }),
  );
}

function withGeneratedDocsEndpoints(docs: StudioDocsResponse): StudioDocsResponse {
  return StudioDocsResponseSchema.parse({
    ...docs,
    endpoints: studioDocsEndpointsFromOpenApi(),
  });
}

type BuildStudioRoutesResponseResult =
  | {
      ok: true;
      routes: StudioRoute[];
      generatedAt: string;
      quality: StudioRoutesResponse["quality"];
      releaseLayer: string;
    }
  | { ok: false; response: Response };

type BuildStudioRouteDetailResponseResult =
  | { ok: true; routeDetail: StudioRouteDetailResponse }
  | { ok: false; response: Response };

type BuildStudioRouteHistoryResponseResult =
  | { ok: true; history: StudioRouteHistoryResponse }
  | { ok: false; response: Response };

type BuildStudioRouteHourlyProfileResponseResult =
  | { ok: true; hourlyProfile: StudioRouteHourlyProfileResponse }
  | { ok: false; response: Response };

type BuildStudioRouteSpeedHistoryResponseResult =
  | { ok: true; speedHistory: StudioRouteSpeedHistoryResponse }
  | { ok: false; response: Response };

type BuildStudioRouteTimelineResponseResult =
  | { ok: true; timeline: StudioRouteEvidenceBundle }
  | { ok: false; response: Response };

type BuildStudioInterventionsEvidenceResponseResult =
  | { ok: true; evidence: StudioInterventionsEvidenceResponse }
  | { ok: false; response: Response };

type BuildStudioRouteIndex2ResponseResult =
  | { ok: true; routeIndex: StudioRouteIndex2Response }
  | { ok: false; response: Response };

type BuildStudioRouteSectionsResponseResult =
  | { ok: true; routeSections: StudioRouteSectionsResponse }
  | { ok: false; response: Response };

const IsoMonthStringSchema = z.string().regex(/^\d{4}-\d{2}$/);

const ModelArtifactServingProjectionSchema = z
  .object({
    artifactKind: z.literal("model_artifact_serving_projection"),
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    releaseMonth: z.string(),
    historyWindow: z
      .object({
        startMonth: IsoMonthStringSchema,
        endMonth: IsoMonthStringSchema,
      })
      .strict(),
    summary: z
      .object({
        modelCount: z.number().int().nonnegative(),
        availableModelCount: z.number().int().nonnegative(),
        missingModelCount: z.number().int().nonnegative(),
        detectorConsumerCount: z.number().int().nonnegative(),
      })
      .strict(),
    models: z.array(
      z
        .object({
          modelId: z.string().min(1),
          status: z.enum(["available", "missing"]),
          panelId: z.string().nullable(),
          releaseMonth: z.string().nullable(),
          modeledReleaseRowCount: z.number().int().nonnegative(),
          routeCount: z.number().int().nonnegative(),
          segmentCount: z.number().int().nonnegative(),
          detectorConsumers: z.array(z.string()),
          limitations: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .passthrough();

type ModelArtifactServingProjection = z.output<typeof ModelArtifactServingProjectionSchema>;

const RouteSpeedSpineArtifactForSegmentsSchema = z
  .object({
    artifactKind: z.string(),
    routeId: z.string(),
    routeSlug: z.string(),
    segments: z.array(
      z
        .object({
          segmentId: z.string(),
          direction: z.string(),
          displayOrder: z.number(),
          label: z.string(),
          averageRoadDistanceMiles: z.number().nullable().optional(),
          averageSpeedMph: z.number().nullable().optional(),
          raw: z
            .object({
              sourceStopPairs: z.array(
                z
                  .object({
                    fromStopId: z.string(),
                    fromStopName: z.string(),
                    toStopId: z.string(),
                    toStopName: z.string(),
                    stopOrders: z.array(z.number()),
                  })
                  .passthrough(),
              ),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

type RouteSpeedSpineArtifactForSegments = z.output<typeof RouteSpeedSpineArtifactForSegmentsSchema>;

type RouteSpeedSpineSegmentForSegments = RouteSpeedSpineArtifactForSegments["segments"][number];

function realtimeSourceForRunId(
  runId: string | null,
): "official_self_collected" | "third_party_recovered" | "none" {
  if (runId === null) {
    return "none";
  }

  return runId.startsWith("bus-observatory-") ? "third_party_recovered" : "official_self_collected";
}

function routeIdToStudioSlug(routeId: string): string {
  return routeId
    .toLowerCase()
    .replace(/\+/g, "-sbs")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function boroughForRouteId(routeId: string): string {
  const upper = routeId.toUpperCase();
  if (upper.startsWith("BX")) return "Bronx";
  if (upper.startsWith("B")) return "Brooklyn";
  if (upper.startsWith("Q")) return "Queens";
  if (upper.startsWith("S")) return "Staten Island";
  return "Manhattan";
}

function routeFamilyForIndexRow(row: StudioRouteIndexSourceRow): StudioRouteFamily {
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

function routeProjectionRef(ref: StudioSnapshot2ProjectionRef): StudioSnapshot2ProjectionRef {
  return ref;
}

function hasRouteTimelineBundle(row: StudioRouteIndexSourceRow): boolean {
  return row.artifactNames.includes(STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME);
}

// Capability now arrives pre-built from the pipeline `route_capability_manifest`
// (frontend §7.1 / C1). When a route is absent from the manifest, fall back to the
// honest empty state rather than computing surface states in the Worker.
const FALLBACK_ROUTE_CAPABILITY: StudioRouteCapability = {
  overallState: "insufficient_data",
  surfaces: {},
  caveats: [],
};

// The legacy four-tier support level survives only as a derived label on the
// "needs attention" section rows. The mapping is exact: the manifest `overallState`
// was rolled up from the same summary/artifact/finding signals the old tiers used.
const SUPPORT_LEVEL_BY_OVERALL_STATE: Record<
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

function supportLevelLabel(
  capability: StudioRouteCapability,
): "index_only" | "summary_ready" | "artifact_ready" | "evidence_ready" {
  return SUPPORT_LEVEL_BY_OVERALL_STATE[capability.overallState];
}

// Core surfaces whose gaps drive the data-coverage ranking. A surface is a "gap"
// when it is neither serving (`ready`) nor honestly empty after looking
// (`checked_clean` / `not_applicable`).
const CORE_COVERAGE_SURFACES: readonly { key: string; label: string }[] = [
  { key: "condition", label: "summary" },
  { key: "detectorFindings", label: "detector findings" },
  { key: "speedHistory", label: "speed history" },
  { key: "ridership", label: "ridership history" },
  { key: "scheduleBaseline", label: "schedule baseline" },
];

function isCoverageGap(state: RouteSurfaceState | undefined): boolean {
  return (
    state !== undefined &&
    state !== "ready" &&
    state !== "checked_clean" &&
    state !== "not_applicable"
  );
}

function coverageGaps(capability: StudioRouteCapability): { label: string; state: string }[] {
  return CORE_COVERAGE_SURFACES.flatMap(({ key, label }) => {
    const state = capability.surfaces[key]?.state;
    return isCoverageGap(state) ? [{ label, state: state as string }] : [];
  });
}

function routeIndexCaveats(row: StudioRouteIndexSourceRow): string[] {
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
  if ((row.speedHistoryCoverage?.missingCellCount ?? 0) > 0) {
    caveats.push(
      `Route speed-history artifact has ${row.speedHistoryCoverage?.missingCellCount ?? 0} missing cells.`,
    );
  }
  if (row.readiness === null) {
    caveats.push("No baseline route-readiness row is available for this route.");
  }
  return caveats;
}

function routeProjectionRefs(input: {
  row: StudioRouteIndexSourceRow;
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
    refs.push(
      routeProjectionRef({
        id: "route_speed_history",
        status: row.speedHistoryCoverage.missingCellCount > 0 ? "partial" : "available",
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

function buildStudioRouteIndex2Row(input: {
  releaseId: string;
  baselineMonth: string;
  generatedAt: string;
  lastBuiltSpeedMonth: string | undefined;
  row: StudioRouteIndexSourceRow;
  capability: StudioRouteCapability;
}): StudioRouteIndex2Row {
  const slug = routeIdToStudioSlug(input.row.routeId);
  return {
    releaseId: input.releaseId,
    baselineMonth: input.baselineMonth,
    routeId: input.row.routeId,
    slug,
    label: input.row.routeShortName.replace("-SBS", " SBS"),
    longName: input.row.routeLongName,
    borough: boroughForRouteId(input.row.routeId) as StudioRouteIndex2Row["borough"],
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

function buildObservedReliabilityFromD1(
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

function routeTerminiForIndexRow(row: StudioRouteIndexSourceRow): { north: string; south: string } {
  const longName = row.routeLongName ?? row.routeShortName;
  const [north, south] = longName.split(" - ");
  return {
    north: north?.trim() || row.routeShortName,
    south: south?.trim() || "Terminal",
  };
}

function routeLabelForIndexRow(row: StudioRouteIndexSourceRow): string {
  return row.routeShortName.replace("-SBS", " SBS");
}

function routeSpeedMphForIndexRow(row: StudioRouteIndexSourceRow): number {
  return Number((row.summary?.averageSpeedMph ?? row.readiness?.averageSpeedMph ?? 0).toFixed(1));
}

function routeLaneCoverageForIndexRow(row: StudioRouteIndexSourceRow): number {
  const stopCount = row.readiness?.stopCount ?? row.stopCount;
  if (stopCount === 0) return 0;
  return Math.min(100, Math.round(((row.summary?.busLaneMatchedLaneCount ?? 0) / stopCount) * 100));
}

function routeReliabilityLabelForIndexRow(row: StudioRouteIndexSourceRow): string {
  if (row.summary === null) return "Indexed route";
  if (row.summary.routeScore >= 70) return "High attention route";
  if (row.summary.routeScore >= 40) return "Watch list route";
  return "Lower-risk route";
}

function routeDiagnosisForIndexRow(
  row: StudioRouteIndexSourceRow,
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

function routeFlagsForIndexRow(row: StudioRouteIndexSourceRow): string[] {
  return [
    row.summary?.aceActive === true ? "ACE active" : "ACE inactive",
    row.artifactNames.length > 0 ? "Rich artifact indexed" : "No rich artifact",
    row.summary === null
      ? "No baseline summary"
      : row.summary.publicVisible
        ? "Public summary"
        : "Summary gated",
    row.readiness?.status ?? "No readiness row",
    row.historyCoverage.pointCount > 0
      ? `${row.historyCoverage.pointCount} history months`
      : "No history rows",
  ];
}

function buildStudioRouteCardFromIndexRow(
  row: StudioRouteIndexSourceRow,
  observed: D1RouteObservedReliabilitySummary | undefined,
  speedPercentile: number | null,
): StudioRoute {
  const slug = routeIdToStudioSlug(row.routeId);
  const speedMph = routeSpeedMphForIndexRow(row);
  const coverage = routeLaneCoverageForIndexRow(row);
  const corridor = row.routeLongName ?? row.routeShortName;
  return {
    slug,
    routeId: row.routeId,
    label: routeLabelForIndexRow(row),
    corridor,
    corridorFull: corridor,
    borough: boroughForRouteId(row.routeId),
    sbs: row.routeId.includes("+") || row.routeShortName.includes("SBS"),
    speedMph,
    scheduledMph: null,
    weightedAvgSpeed: speedMph,
    speedPercentile,
    dailyRiders: Math.round((row.summary?.totalRidership ?? 0) / 30),
    ridersYoyPct: null,
    riderHoursLost: null,
    laneCoverage: coverage,
    aceStatus: row.summary?.aceActive === true ? "active" : "none",
    aceSince: null,
    tspCoverage: "none",
    reliability: routeReliabilityLabelForIndexRow(row),
    observedReliability: buildObservedReliabilityFromD1(observed),
    diagnosis: routeDiagnosisForIndexRow(row, speedMph, coverage),
    spark: null,
    termini: routeTerminiForIndexRow(row),
    miles: null,
    stops: row.readiness?.stopCount ?? row.stopCount,
    flags: routeFlagsForIndexRow(row),
    peerSlug: null,
    movement6mPct: roundPct(row.historyStats.speedMovement6mPct),
    context12mPct: roundPct(row.historyStats.speedMovement12mPct),
    interventions: [],
  };
}

function speedPercentilesForRouteIndexRows(
  rows: readonly StudioRouteIndexSourceRow[],
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

async function listStudioRouteCardsFromD1(
  env: Pick<StudioReadEnv, "DB">,
  month: string,
  limit?: number,
): Promise<StudioRoute[]> {
  if (env.DB === undefined) return [];
  const db = createD1ServingDb(env.DB);
  const [rows, observed] = await Promise.all([
    listStudioRouteIndexSourceRows(db, month),
    listRouteObservedReliabilitySummaries(db, month),
  ]);
  const observedByRoute = new Map(observed.map((row) => [row.routeId, row]));
  const speedPercentileByRoute = speedPercentilesForRouteIndexRows(rows);
  const routes = rows
    .toSorted((left, right) => {
      const leftScore = left.summary?.routeScore ?? 101;
      const rightScore = right.summary?.routeScore ?? 101;
      return leftScore - rightScore || left.routeId.localeCompare(right.routeId);
    })
    .map((row) =>
      buildStudioRouteCardFromIndexRow(
        row,
        observedByRoute.get(row.routeId),
        row.summary === null ? null : (speedPercentileByRoute.get(row.routeId) ?? null),
      ),
    );
  return limit !== undefined ? routes.slice(0, limit) : routes;
}

/**
 * The single internal serving-month resolver (hard-cutover C3). Public responses
 * derive their months from D1 data — the latest brief-summary month and the latest
 * speed-trend month — never from env. `env.BASELINE_MONTH` survives only as
 * pipeline/provenance metadata.
 */
type ResolvedServingMonths = { servingMonth: string; latestSpeedMonth: string | null };

async function resolveServingMonths(env: StudioReadEnv): Promise<ResolvedServingMonths | null> {
  if (env.DB === undefined) return null;
  const db = createD1ServingDb(env.DB);
  const [servingMonth, latestSpeedMonth] = await Promise.all([
    findLatestStudioServingMonth(db),
    findLatestSpeedTrendMonth(db),
  ]);
  if (servingMonth === null) return null;
  return { servingMonth, latestSpeedMonth };
}

const NO_SERVING_MONTH_MESSAGE = "No serving month is available in D1.";

async function buildStudioRouteIndex2Response(
  env: StudioReadEnv,
): Promise<BuildStudioRouteIndex2ResponseResult> {
  if (env.DB === undefined) {
    return {
      ok: false,
      response: dependencyNotConfiguredResponse("DB", "Studio route index v2"),
    };
  }
  const months = await resolveServingMonths(env);
  if (months === null) {
    return { ok: false, response: errorResponse(503, NO_SERVING_MONTH_MESSAGE) };
  }

  const generatedAt = new Date().toISOString();
  const releaseId = releaseIdForPrefix(studioProjectionPrefix(env));
  const [rows, capabilityManifest] = await Promise.all([
    listStudioRouteIndexSourceRows(createD1ServingDb(env.DB), months.servingMonth),
    loadRouteCapabilityManifest(env),
  ]);
  const capabilityByRoute = routeCapabilityByRouteId(capabilityManifest);
  const routes = rows.map((row) =>
    buildStudioRouteIndex2Row({
      releaseId,
      baselineMonth: months.servingMonth,
      generatedAt,
      lastBuiltSpeedMonth: months.latestSpeedMonth ?? undefined,
      row,
      capability: capabilityByRoute.get(row.routeId) ?? FALLBACK_ROUTE_CAPABILITY,
    }),
  );

  return {
    ok: true,
    routeIndex: StudioRouteIndex2ResponseSchema.parse({
      schemaVersion: 2,
      generatedAt,
      releaseId,
      baselineMonth: months.servingMonth,
      dataAsOf: months.latestSpeedMonth ?? months.servingMonth,
      routes,
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: routes.length === 0 ? "unavailable" : "partial_public_monthly_only",
        confidence: routes.length === 0 ? "low" : "medium",
        caveats: [
          "Route index v2 is the all-route addressability layer; rich route artifacts are exposed as per-route surface flags.",
          "Sparse routes are valid Studio routes even when summary, detail, finding, or evidence surfaces are unavailable.",
        ],
      },
    }),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function metric(input: {
  id: string;
  label: string;
  value: number | null;
  unit?: string | null;
  displayValue?: string;
}): StudioRouteSectionMetric {
  const { value } = input;
  return {
    id: input.id,
    label: input.label,
    value,
    unit: input.unit ?? null,
    displayValue:
      input.displayValue ??
      (value === null
        ? "n/a"
        : Number.isInteger(value)
          ? value.toLocaleString("en-US")
          : value.toFixed(1)),
  };
}

function compactNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString("en-US");
}

function routeIdAliases(routeId: string): string[] {
  const upper = routeId.toUpperCase();
  const aliases = new Set([upper]);
  if (upper.endsWith("+")) aliases.add(upper.slice(0, -1));
  else aliases.add(`${upper}+`);
  return [...aliases];
}

function routeDetailSlugCandidates(routeId: string, requestedSlug: string): string[] {
  const candidates = [requestedSlug, ...routeIdAliases(routeId).map(routeIdToStudioSlug)];
  return [...new Set(candidates)];
}

async function loadStudioRouteEvidenceIndex(
  env: StudioReadEnv,
): Promise<StudioRouteEvidenceIndex | null> {
  if (env.ARTIFACTS === undefined) return null;
  const object = await env.ARTIFACTS.get(STUDIO_ROUTE_EVIDENCE_INDEX_KEY);
  if (object === null) return null;

  let payload: unknown;
  try {
    payload = await object.json();
  } catch {
    return null;
  }

  const parsed = StudioRouteEvidenceIndexSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

async function loadModelArtifactServingProjection(
  env: StudioReadEnv,
): Promise<ModelArtifactServingProjection | null> {
  if (env.ARTIFACTS === undefined) return null;
  const object = await env.ARTIFACTS.get(STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY);
  if (object === null) return null;

  let payload: unknown;
  try {
    payload = await object.json();
  } catch {
    console.error("Model artifact serving projection is not valid JSON.", {
      key: STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY,
    });
    return null;
  }

  const parsed = ModelArtifactServingProjectionSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("Model artifact serving projection failed contract validation.", {
      key: STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY,
      issues: parsed.error.issues,
    });
    return null;
  }
  return parsed.data;
}

async function loadDetectorReadinessServingManifest(
  env: StudioReadEnv,
): Promise<DetectorReadinessServingManifestForInsights | null> {
  if (env.ARTIFACTS === undefined) return null;
  const object = await env.ARTIFACTS.get(STUDIO_ROUTE_DETECTOR_READINESS_MANIFEST_KEY);
  if (object === null) return null;

  let payload: unknown;
  try {
    payload = await object.json();
  } catch {
    return null;
  }

  const parsed = DetectorReadinessServingManifestForInsightsSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

async function loadRouteCapabilityManifest(
  env: StudioReadEnv,
): Promise<RouteCapabilityManifestForIndex | null> {
  if (env.ARTIFACTS === undefined) return null;
  const object = await env.ARTIFACTS.get(STUDIO_ROUTE_CAPABILITY_MANIFEST_KEY);
  if (object === null) return null;

  let payload: unknown;
  try {
    payload = await object.json();
  } catch {
    return null;
  }

  const parsed = RouteCapabilityManifestForIndexSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

function routeCapabilityByRouteId(
  manifest: RouteCapabilityManifestForIndex | null,
): ReadonlyMap<string, StudioRouteCapability> {
  const byRoute = new Map<string, StudioRouteCapability>();
  if (manifest === null) return byRoute;
  for (const route of manifest.routes) {
    byRoute.set(route.routeId, {
      overallState: route.overallState,
      surfaces: route.surfaces,
      caveats: route.caveats,
    });
  }
  return byRoute;
}

async function loadRouteDossierSummaryForDetail(input: {
  env: StudioReadEnv;
  routeId: string;
  requestedSlug: string;
}): Promise<RouteDossierSummaryForDetail | null> {
  if (input.env.ARTIFACTS === undefined) return null;
  for (const slug of routeDetailSlugCandidates(input.routeId, input.requestedSlug)) {
    const object = await input.env.ARTIFACTS.get(routeDossierSummaryKey(slug));
    if (object === null) continue;

    let payload: unknown;
    try {
      payload = await object.json();
    } catch {
      continue;
    }

    const parsed = RouteDossierSummaryForDetailSchema.safeParse(payload);
    if (parsed.success) return parsed.data;
  }
  return null;
}

function routeHourlyProfileArtifactKey(slug: string): string {
  return `studio/v2/routes/${slug}/hourly-profile.json`;
}

type HourlyProfileDetailFields = Pick<
  StudioRouteDetailResponse,
  "peakWindows" | "slowestWindows" | "reliabilitySamples"
>;

async function loadRouteHourlyProfileForDetail(input: {
  env: StudioReadEnv;
  routeId: string;
  requestedSlug: string;
}): Promise<HourlyProfileDetailFields | null> {
  if (input.env.ARTIFACTS === undefined) return null;
  for (const slug of routeDetailSlugCandidates(input.routeId, input.requestedSlug)) {
    const object = await input.env.ARTIFACTS.get(routeHourlyProfileArtifactKey(slug));
    if (object === null) continue;

    let payload: unknown;
    try {
      payload = await object.json();
    } catch {
      continue;
    }

    const parsed = StudioRouteHourlyProfileResponseSchema.safeParse(payload);
    if (!parsed.success) continue;
    return {
      peakWindows: parsed.data.peakWindows,
      slowestWindows: parsed.data.slowestWindows,
      reliabilitySamples: parsed.data.reliabilitySamples,
    };
  }
  return null;
}

/**
 * Embeds pipeline-built capability, dossier, and D1 equity context into the
 * detail response (hard-cutover C2). Missing context stays null — the honest
 * partial state the UI renders from.
 */
function routeDetailWithCapabilityAndDossier(input: {
  routeDetail: StudioRouteDetailResponse;
  capability: StudioRouteCapability | null;
  dossier: RouteDossierSummaryForDetail | null;
  equityContext: StudioRouteEquityContext | null;
  hourlyProfile: HourlyProfileDetailFields | null;
}): StudioRouteDetailResponse {
  if (
    input.capability === null &&
    input.dossier === null &&
    input.equityContext === null &&
    input.hourlyProfile === null
  ) {
    return input.routeDetail;
  }
  return StudioRouteDetailResponseSchema.parse({
    ...input.routeDetail,
    ...(input.hourlyProfile ?? {}),
    capability: input.capability,
    dossier: input.dossier,
    equityContext: input.equityContext,
  });
}

function studioRouteEquityContextFromD1(
  row: Awaited<ReturnType<typeof findRouteEquityContext>>,
): StudioRouteEquityContext | null {
  if (row === null) return null;
  return {
    acsYear: row.acsYear,
    assignedCountyName: row.assignedCountyName,
    totalPopulation: row.totalPopulation,
    noVehicleHouseholdShare: row.noVehicleHouseholdShare,
    medianHouseholdIncome: row.medianHouseholdIncome,
    povertyRate: row.povertyRate,
    publicTransitCommuterShare: row.publicTransitCommuterShare,
  };
}

async function loadRouteSpeedSpineForSegments(
  env: StudioReadEnv,
  routeSlug: string,
): Promise<RouteSpeedSpineArtifactForSegments | null> {
  if (env.ARTIFACTS === undefined) return null;
  const object = await env.ARTIFACTS.get(`studio/v2/routes/${routeSlug}/speed-spine.json`);
  if (object === null) return null;

  let payload: unknown;
  try {
    payload = await object.json();
  } catch {
    return null;
  }

  const parsed = RouteSpeedSpineArtifactForSegmentsSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

async function loadRouteSpeedSpineCandidatesForSegments(input: {
  env: StudioReadEnv;
  routeId: string;
  requestedSlug: string;
}): Promise<RouteSpeedSpineArtifactForSegments[]> {
  const slugs = routeDetailSlugCandidates(input.routeId, input.requestedSlug);
  const spines = await Promise.all(
    slugs.map((slug) => loadRouteSpeedSpineForSegments(input.env, slug)),
  );
  return spines.filter((spine): spine is RouteSpeedSpineArtifactForSegments => spine !== null);
}

function routeDetailWithInsights(input: {
  routeDetail: StudioRouteDetailResponse;
  manifest: DetectorReadinessServingManifestForInsights | null;
}): StudioRouteDetailResponse {
  // Even without a manifest, guarantee the `insights` invariant so every
  // downstream consumer (and the serialized response) sees an array.
  if (input.manifest === null) {
    return { ...input.routeDetail, insights: input.routeDetail.insights ?? [] };
  }
  return StudioRouteDetailResponseSchema.parse({
    ...input.routeDetail,
    insights: buildRouteInsightsFromDetectorReadiness({
      manifest: input.manifest,
      routeId: input.routeDetail.route.routeId,
    }),
  });
}

type RawTreatmentTarget = {
  routeId: string;
  month: string;
  direction: string;
  segmentOrder: number;
  fromNodeId: string;
  toNodeId: string;
};

function rawTreatmentTarget(segmentId: string): RawTreatmentTarget | null {
  const [routeId, month, direction, rawSegmentOrder, fromNodeId, toNodeId] = segmentId.split(":");
  if (
    routeId === undefined ||
    month === undefined ||
    direction === undefined ||
    rawSegmentOrder === undefined ||
    fromNodeId === undefined ||
    toNodeId === undefined
  ) {
    return null;
  }
  const segmentOrder = Number(rawSegmentOrder);
  if (!Number.isInteger(segmentOrder) || segmentOrder < 0) return null;
  return { routeId, month, direction, segmentOrder, fromNodeId, toNodeId };
}

function spineSegmentMatchesRawTarget(
  segment: RouteSpeedSpineSegmentForSegments,
  target: RawTreatmentTarget,
): boolean {
  if (segment.direction !== target.direction) return false;
  return segment.raw.sourceStopPairs.some(
    (pair) =>
      pair.fromStopId === target.fromNodeId &&
      pair.toStopId === target.toNodeId &&
      pair.stopOrders.includes(target.segmentOrder),
  );
}

function studioDirectionFromRaw(value: string): StudioSegment["direction"] {
  if (value === "N") return "NB";
  if (value === "S") return "SB";
  if (value === "E") return "EB";
  if (value === "W") return "WB";
  return "NB";
}

function segmentLabelParts(
  segment: RouteSpeedSpineSegmentForSegments,
  target: RawTreatmentTarget,
): { from: string; to: string } {
  const sourcePair = segment.raw.sourceStopPairs.find(
    (pair) =>
      pair.fromStopId === target.fromNodeId &&
      pair.toStopId === target.toNodeId &&
      pair.stopOrders.includes(target.segmentOrder),
  );
  if (sourcePair !== undefined) {
    return { from: sourcePair.fromStopName, to: sourcePair.toStopName };
  }
  const [from, to] = segment.label.split(" to ");
  return {
    from: from?.trim() || "Segment start",
    to: to?.trim() || "Segment end",
  };
}

function segmentFromSpeedSpineTarget(input: {
  routeSlug: string;
  routeScheduledMph: number | null;
  targetId: string;
  target: RawTreatmentTarget;
  segment: RouteSpeedSpineSegmentForSegments;
}): StudioSegment {
  const { from, to } = segmentLabelParts(input.segment, input.target);
  const speedMph =
    input.segment.averageSpeedMph === null || input.segment.averageSpeedMph === undefined
      ? 0
      : Number(input.segment.averageSpeedMph.toFixed(1));
  return {
    id: input.targetId,
    routeSlug: input.routeSlug,
    direction: studioDirectionFromRaw(input.target.direction),
    from,
    to,
    speedMph,
    scheduledMph: input.routeScheduledMph,
    riderHours: 0,
    lane: "none",
    ace: false,
    tsp: false,
    hours: Array.from({ length: 24 }, () => 0),
    ...(input.segment.averageRoadDistanceMiles === null ||
    input.segment.averageRoadDistanceMiles === undefined
      ? {}
      : { miles: input.segment.averageRoadDistanceMiles }),
  };
}

function insightTargetSegmentRows(input: {
  routeDetail: StudioRouteDetailResponse;
  spines: readonly RouteSpeedSpineArtifactForSegments[];
}): StudioSegment[] {
  const existingIds = new Set(input.routeDetail.segments.map((segment) => segment.id));
  const output: StudioSegment[] = [];
  const emittedIds = new Set<string>();

  // `insights` is `.default([])` in the schema, so a routeDetail that bypassed a
  // schema parse (e.g. routeDetailWithInsights' manifest-null early return) can
  // arrive without it. Treat absence as "no insights" rather than crashing.
  for (const insight of input.routeDetail.insights ?? []) {
    if (insight.placement !== "map_segment") continue;
    for (const targetId of insight.target?.segmentIds ?? []) {
      if (existingIds.has(targetId) || emittedIds.has(targetId)) continue;
      const target = rawTreatmentTarget(targetId);
      if (target === null || target.routeId !== input.routeDetail.route.routeId) continue;
      const spineSegment = input.spines
        .flatMap((spine) => spine.segments)
        .find((segment) => spineSegmentMatchesRawTarget(segment, target));
      if (spineSegment === undefined) continue;

      output.push(
        segmentFromSpeedSpineTarget({
          routeSlug: input.routeDetail.route.slug,
          routeScheduledMph: input.routeDetail.route.scheduledMph,
          targetId,
          target,
          segment: spineSegment,
        }),
      );
      emittedIds.add(targetId);
      break;
    }
  }

  return output;
}

function routeDetailWithInsightTargetSegments(input: {
  routeDetail: StudioRouteDetailResponse;
  spines: readonly RouteSpeedSpineArtifactForSegments[];
}): StudioRouteDetailResponse {
  const targetSegments = insightTargetSegmentRows(input);
  if (targetSegments.length === 0) return input.routeDetail;
  return StudioRouteDetailResponseSchema.parse({
    ...input.routeDetail,
    segments: [...input.routeDetail.segments, ...targetSegments],
    quality: {
      ...input.routeDetail.quality,
      caveats: [
        ...input.routeDetail.quality.caveats,
        "Some detector insight segment rows are aligned from the route speed-spine provenance so detector refs attach to visible route rows.",
      ],
    },
  });
}

async function maybeLoadAliasedStudioRouteDetailProjection(input: {
  env: StudioReadEnv;
  routeId: string;
  requestedSlug: string;
}): Promise<StudioRouteDetailResponse | null> {
  for (const candidateSlug of routeDetailSlugCandidates(input.routeId, input.requestedSlug)) {
    const detail = await maybeLoadStudioRouteDetailProjection(input.env, candidateSlug);
    if (detail !== null) return detail;
  }
  return null;
}

function aliasedRouteDetailForD1Row(input: {
  row: StudioRouteIndexSourceRow;
  observed: D1RouteObservedReliabilitySummary | undefined;
  richDetail: StudioRouteDetailResponse;
}): StudioRouteDetailResponse {
  return StudioRouteDetailResponseSchema.parse({
    ...input.richDetail,
    route: buildStudioRouteCardFromIndexRow(input.row, input.observed, null),
    segments: input.richDetail.segments,
    artifactRefs: input.richDetail.artifactRefs,
    quality: {
      ...input.richDetail.quality,
      caveats: [
        ...input.richDetail.quality.caveats,
        "Segment rows are loaded from an equivalent base/SBS route artifact so detector segment refs can attach deterministically.",
      ],
    },
  });
}

function metricRows(input: {
  rows: readonly StudioRouteIndexSourceRow[];
  routeById: ReadonlyMap<string, StudioRouteIndex2Row>;
  score: (row: StudioRouteIndexSourceRow) => number | null;
  reasons: (row: StudioRouteIndexSourceRow) => string[];
  metrics: (row: StudioRouteIndexSourceRow) => StudioRouteSectionMetric[];
  scoreLabel: (score: number) => string;
  limit?: number;
}): StudioRouteSectionRow[] {
  return input.rows
    .flatMap((row) => {
      const route = input.routeById.get(row.routeId);
      if (route === undefined) return [];
      const score = input.score(row);
      if (score === null || !Number.isFinite(score) || score <= 0) return [];
      return [
        {
          row,
          route,
          score: Number(score.toFixed(3)),
        },
      ];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (left.row.summary?.routeScore ?? 101) - (right.row.summary?.routeScore ?? 101) ||
        left.route.routeId.localeCompare(right.route.routeId),
    )
    .slice(0, input.limit ?? 12)
    .map((candidate, index) => ({
      rank: index + 1,
      routeId: candidate.route.routeId,
      slug: candidate.route.slug,
      label: candidate.route.label,
      borough: candidate.route.borough,
      supportLevel: supportLevelLabel(candidate.route.capability),
      score: candidate.score,
      scoreLabel: input.scoreLabel(candidate.score),
      reasons: input.reasons(candidate.row),
      metrics: input.metrics(candidate.row),
      movement6mPct: roundPct(candidate.row.historyStats.speedMovement6mPct),
      context12mPct: roundPct(candidate.row.historyStats.speedMovement12mPct),
    }));
}

function roundPct(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(1));
}

function section(input: {
  sectionId: StudioRouteSectionId;
  title: string;
  productQuestion: string;
  status: StudioRouteSection["status"];
  rankMeaning: string;
  minCoverageRule: string;
  rows?: StudioRouteSectionRow[];
  caveats?: string[];
  notBuiltReason?: string | null;
}): StudioRouteSection {
  return {
    sectionId: input.sectionId,
    title: input.title,
    productQuestion: input.productQuestion,
    status: input.status,
    rankMeaning: input.rankMeaning,
    minCoverageRule: input.minCoverageRule,
    rows: input.rows ?? [],
    caveats: input.caveats ?? [],
    notBuiltReason: input.notBuiltReason ?? null,
  };
}

function buildNeedsAttentionRows(input: {
  rows: readonly StudioRouteIndexSourceRow[];
  routeById: ReadonlyMap<string, StudioRouteIndex2Row>;
}): StudioRouteSectionRow[] {
  return metricRows({
    rows: input.rows,
    routeById: input.routeById,
    score(row) {
      if (row.summary === null) return null;
      const speedPain = clamp((9 - row.summary.averageSpeedMph) * 8, 0, 40);
      const riderScale = clamp(row.summary.totalRidership / 30_000, 0, 35);
      const hotspotPain = clamp(row.summary.hotspotCount * 4, 0, 25);
      return 100 - row.summary.routeScore + speedPain + riderScale + hotspotPain;
    },
    reasons(row) {
      if (row.summary === null) return [];
      return [
        `Route score ${row.summary.routeScore}`,
        `${row.summary.averageSpeedMph.toFixed(1)} mph observed speed`,
        `${row.summary.hotspotCount} hotspot${row.summary.hotspotCount === 1 ? "" : "s"}`,
        `${compactNumber(row.summary.totalRidership)} monthly riders`,
      ];
    },
    metrics(row) {
      const summary = row.summary;
      return [
        metric({
          id: "route_score",
          label: "Route score",
          value: summary?.routeScore ?? null,
          displayValue: summary === null ? "n/a" : String(summary.routeScore),
        }),
        metric({
          id: "average_speed_mph",
          label: "Observed speed",
          value: summary?.averageSpeedMph ?? null,
          unit: "mph",
        }),
        metric({
          id: "monthly_riders",
          label: "Monthly riders",
          value: summary?.totalRidership ?? null,
          displayValue: summary === null ? "n/a" : compactNumber(summary.totalRidership),
        }),
      ];
    },
    scoreLabel: (score) => `${score.toFixed(0)} attention score`,
  });
}

function buildWorseningFastRows(input: {
  currentSpeedMonth: string;
  rows: readonly StudioRouteIndexSourceRow[];
  routeById: ReadonlyMap<string, StudioRouteIndex2Row>;
}): StudioRouteSectionRow[] {
  return metricRows({
    rows: input.rows,
    routeById: input.routeById,
    score(row) {
      const change = row.historyStats.speedChangeMph;
      if (
        change === null ||
        row.historyCoverage.speedMonthCount < 6 ||
        row.historyStats.latestSpeedMonth !== input.currentSpeedMonth ||
        change >= 0
      ) {
        return null;
      }
      return Math.abs(change) * 25 + clamp(row.historyCoverage.speedMonthCount, 0, 36);
    },
    reasons(row) {
      const { historyStats } = row;
      const change = historyStats.speedChangeMph ?? 0;
      return [
        `${change.toFixed(1)} mph from ${historyStats.firstSpeedMonth} to ${historyStats.latestSpeedMonth}`,
        `${row.historyCoverage.speedMonthCount} speed months`,
      ];
    },
    metrics(row) {
      return [
        metric({
          id: "speed_change_mph",
          label: "Speed change",
          value: row.historyStats.speedChangeMph,
          unit: "mph",
          displayValue:
            row.historyStats.speedChangeMph === null
              ? "n/a"
              : `${row.historyStats.speedChangeMph.toFixed(1)} mph`,
        }),
        metric({
          id: "latest_speed_mph",
          label: "Latest speed",
          value: row.historyStats.latestAverageSpeedMph,
          unit: "mph",
        }),
        metric({
          id: "speed_months",
          label: "Speed months",
          value: row.historyCoverage.speedMonthCount,
        }),
      ];
    },
    scoreLabel: (score) => `${score.toFixed(0)} worsening score`,
  });
}

function buildTreatmentGapRows(input: {
  rows: readonly StudioRouteIndexSourceRow[];
  routeById: ReadonlyMap<string, StudioRouteIndex2Row>;
}): StudioRouteSectionRow[] {
  return metricRows({
    rows: input.rows,
    routeById: input.routeById,
    score(row) {
      if (row.summary === null) return null;
      if (row.summary.totalRidership <= 0 || row.summary.averageSpeedMph <= 0) return null;
      const riderScale = clamp(row.summary.totalRidership / 45_000, 0, 40);
      const speedPain = clamp((8.5 - row.summary.averageSpeedMph) * 9, 0, 35);
      const hotspotPain = clamp(row.summary.hotspotCount * 4, 0, 25);
      const treatmentCredit =
        (row.summary.aceActive ? 20 : 0) + clamp(row.summary.busLaneMatchedLaneCount * 4, 0, 30);
      const score = riderScale + speedPain + hotspotPain - treatmentCredit;
      return score > 5 ? score : null;
    },
    reasons(row) {
      if (row.summary === null) return [];
      const treatment =
        row.summary.aceActive || row.summary.busLaneMatchedLaneCount > 0
          ? `${row.summary.busLaneMatchedLaneCount} lane matches; ACE ${row.summary.aceActive ? "active" : "inactive"}`
          : "No ACE or bus-lane match in summary";
      return [
        `${row.summary.averageSpeedMph.toFixed(1)} mph observed speed`,
        `${compactNumber(row.summary.totalRidership)} monthly riders`,
        treatment,
      ];
    },
    metrics(row) {
      const summary = row.summary;
      return [
        metric({
          id: "average_speed_mph",
          label: "Observed speed",
          value: summary?.averageSpeedMph ?? null,
          unit: "mph",
        }),
        metric({
          id: "bus_lane_matches",
          label: "Lane matches",
          value: summary?.busLaneMatchedLaneCount ?? null,
        }),
        metric({
          id: "ace_active",
          label: "ACE active",
          value: summary?.aceActive === true ? 1 : 0,
          displayValue: summary?.aceActive === true ? "yes" : "no",
        }),
      ];
    },
    scoreLabel: (score) => `${score.toFixed(0)} gap score`,
  });
}

function buildDataCoverageRows(input: {
  rows: readonly StudioRouteIndexSourceRow[];
  routeById: ReadonlyMap<string, StudioRouteIndex2Row>;
}): StudioRouteSectionRow[] {
  return metricRows({
    rows: input.rows,
    routeById: input.routeById,
    score(row) {
      const route = input.routeById.get(row.routeId);
      if (route === undefined) return null;
      const gaps = coverageGaps(route.capability);
      // biome-ignore lint/complexity/useLiteralKeys: capability surfaces are typed as an index signature.
      const noSummary = route.capability.surfaces["condition"]?.state === "insufficient_data";
      return gaps.length === 0 ? null : gaps.length * 10 + (noSummary ? 15 : 0);
    },
    reasons(row) {
      const route = input.routeById.get(row.routeId);
      if (route === undefined) return [];
      return coverageGaps(route.capability).map((gap) => `${gap.label} ${gap.state}`);
    },
    metrics(row) {
      const route = input.routeById.get(row.routeId);
      const missingCoreCount = route === undefined ? 0 : coverageGaps(route.capability).length;
      return [
        metric({
          id: "core_surface_issues",
          label: "Core surface issues",
          value: missingCoreCount,
        }),
        metric({
          id: "history_months",
          label: "History months",
          value: row.historyCoverage.pointCount,
        }),
        metric({
          id: "readiness_score",
          label: "Readiness",
          value: row.readiness?.score ?? null,
        }),
      ];
    },
    scoreLabel: (score) => `${score.toFixed(0)} coverage issue score`,
  });
}

function routeEvidenceFactCount(route: Pick<StudioRouteEvidenceIndexRoute, "coverage">): number {
  return (
    route.coverage.timelineCount +
    route.coverage.interventionCount +
    route.coverage.metricClaimCount +
    route.coverage.projectCount +
    route.coverage.sourceGapCount
  );
}

function buildEvidenceReadyRows(input: {
  routes: readonly StudioRouteEvidenceIndexRoute[];
  routeById: ReadonlyMap<string, StudioRouteIndex2Row>;
}): StudioRouteSectionRow[] {
  return input.routes
    .flatMap((evidenceRoute) => {
      const route = input.routeById.get(evidenceRoute.routeId);
      if (route === undefined) return [];
      const factCount = routeEvidenceFactCount(evidenceRoute);
      const score =
        evidenceRoute.coverage.citationCount * 3 +
        evidenceRoute.coverage.timelineCount * 2 +
        evidenceRoute.coverage.interventionCount * 2 +
        evidenceRoute.coverage.metricClaimCount +
        evidenceRoute.coverage.projectCount +
        evidenceRoute.coverage.sourceGapCount +
        (evidenceRoute.wikiRouteRecordId === null ? 0 : 5);
      if (!Number.isFinite(score) || score <= 0) return [];
      return [{ evidenceRoute, factCount, route, score: Number(score.toFixed(3)) }];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.evidenceRoute.coverage.citationCount - left.evidenceRoute.coverage.citationCount ||
        left.route.routeId.localeCompare(right.route.routeId),
    )
    .slice(0, 12)
    .map(({ evidenceRoute, factCount, route, score }, index) => ({
      rank: index + 1,
      routeId: route.routeId,
      slug: route.slug,
      label: route.label,
      borough: route.borough,
      supportLevel: "evidence_ready",
      score,
      scoreLabel: `${score.toFixed(0)} evidence score`,
      reasons: [
        `${evidenceRoute.coverage.citationCount.toLocaleString("en-US")} cited evidence reference${evidenceRoute.coverage.citationCount === 1 ? "" : "s"}`,
        `${factCount.toLocaleString("en-US")} wiki evidence row${factCount === 1 ? "" : "s"}`,
        evidenceRoute.wikiRouteRecordId === null
          ? "No canonical wiki route anchor"
          : "Canonical wiki route anchor published",
      ],
      metrics: [
        metric({
          id: "wiki_citations",
          label: "Citations",
          value: evidenceRoute.coverage.citationCount,
        }),
        metric({
          id: "wiki_timeline_events",
          label: "Timeline events",
          value: evidenceRoute.coverage.timelineCount,
        }),
        metric({
          id: "wiki_interventions",
          label: "Interventions",
          value: evidenceRoute.coverage.interventionCount,
        }),
      ],
      // Evidence rows rank source-backed wiki bundles, which carry no route-month trend.
      movement6mPct: null,
      context12mPct: null,
    }));
}

export async function buildStudioRouteSectionsResponse(
  env: StudioReadEnv,
): Promise<BuildStudioRouteSectionsResponseResult> {
  if (env.DB === undefined) {
    return {
      ok: false,
      response: dependencyNotConfiguredResponse("DB", "Studio route sections"),
    };
  }
  const months = await resolveServingMonths(env);
  if (months === null) {
    return { ok: false, response: errorResponse(503, NO_SERVING_MONTH_MESSAGE) };
  }

  const generatedAt = new Date().toISOString();
  const releaseId = releaseIdForPrefix(studioProjectionPrefix(env));
  const [rows, routeEvidenceIndex, capabilityManifest] = await Promise.all([
    listStudioRouteIndexSourceRows(createD1ServingDb(env.DB), months.servingMonth),
    loadStudioRouteEvidenceIndex(env),
    loadRouteCapabilityManifest(env),
  ]);
  const capabilityByRoute = routeCapabilityByRouteId(capabilityManifest);
  const routes = rows.map((row) =>
    buildStudioRouteIndex2Row({
      releaseId,
      baselineMonth: months.servingMonth,
      generatedAt,
      lastBuiltSpeedMonth: months.latestSpeedMonth ?? undefined,
      row,
      capability: capabilityByRoute.get(row.routeId) ?? FALLBACK_ROUTE_CAPABILITY,
    }),
  );
  const routeById = new Map(routes.map((route) => [route.routeId, route]));

  const sections: StudioRouteSection[] = [
    section({
      sectionId: "needs_attention",
      title: "Needs Attention",
      productQuestion: "Which routes combine slow speed, rider impact, and recurring hotspots?",
      status: "available",
      rankMeaning:
        "Higher scores combine lower route scores, slower observed speed, more hotspots, and more riders.",
      minCoverageRule: "Requires a baseline route summary row.",
      rows: buildNeedsAttentionRows({ rows, routeById }),
      caveats: ["This is a transparent triage rank, not a detector finding."],
    }),
    section({
      sectionId: "worsening_fast",
      title: "Worsening Fast",
      productQuestion: "Which routes are getting slower against their own observed history?",
      status: "partial",
      rankMeaning:
        "Higher scores mean larger observed speed declines across available route-month history.",
      minCoverageRule:
        "Requires at least six route-month speed history points and a latest speed point in the baseline speed month.",
      rows: buildWorseningFastRows({
        currentSpeedMonth: months.latestSpeedMonth ?? months.servingMonth,
        rows,
        routeById,
      }),
      caveats: [
        "This compares first and latest available public speed months; it is not seasonally adjusted.",
      ],
    }),
    section({
      sectionId: "treatment_gaps",
      title: "Treatment Gaps",
      productQuestion:
        "Where is rider pain high while currently indexed priority treatments are thin?",
      status: "partial",
      rankMeaning:
        "Higher scores combine ridership, slow speed, and hotspots, then subtract indexed bus-lane and ACE treatment credit.",
      minCoverageRule:
        "Requires a baseline route summary row; treatment coverage is current serving-summary context.",
      rows: buildTreatmentGapRows({ rows, routeById }),
      caveats: [
        "Bus-lane matches are route-shape overlap context, not audited regulatory lane-mile claims.",
      ],
    }),
    section({
      sectionId: "data_coverage",
      title: "Data Coverage",
      productQuestion: "Which routes have partial evidence for this release?",
      status: "available",
      rankMeaning: "Higher scores mean more missing or partial core surfaces.",
      minCoverageRule: "Available for every indexed catalog route.",
      rows: buildDataCoverageRows({ rows, routeById }),
      caveats: ["Coverage is a review/QA section, not the main user hook."],
    }),
    section({
      sectionId: "reliability_watch",
      title: "Reliability Watch",
      productQuestion: "Where are headways and wait pain worst?",
      status: "not_built",
      rankMeaning:
        "Will rank routes by observed excess wait, long gaps, bunching, and sample coverage.",
      minCoverageRule: "Requires route reliability summary rows.",
      notBuiltReason:
        "Route reliability summary projection is not yet served for Snapshot 2.0 sections.",
    }),
    routeEvidenceIndex === null
      ? section({
          sectionId: "evidence_ready",
          title: "Evidence Ready",
          productQuestion: "Which routes can support source-backed findings or briefs now?",
          status: "not_built",
          rankMeaning:
            "Will rank routes by published wiki evidence rows, citations, and route anchors.",
          minCoverageRule: "Requires the MTA-wiki route evidence index in R2.",
          notBuiltReason:
            "Route evidence index has not been published to the serving artifact bucket.",
        })
      : section({
          sectionId: "evidence_ready",
          title: "Evidence Ready",
          productQuestion: "Which routes can support source-backed findings or briefs now?",
          status: "partial",
          rankMeaning:
            "Higher scores mean more source-backed wiki citations and route-linked timeline, treatment, metric, project, or source-gap rows.",
          minCoverageRule:
            "Requires route-linked rows in the MTA-wiki route evidence index; this is evidence readiness, not a published claim.",
          rows: buildEvidenceReadyRows({
            routes: routeEvidenceIndex.routes,
            routeById,
          }),
          caveats: [
            "Wiki-derived evidence rows are source-grounded and citation-backed, but they are not promoted findings.",
            "Sparse routes can still be valid route pages when the wiki release has no coverage row for that route.",
          ],
        }),
  ];

  return {
    ok: true,
    routeSections: StudioRouteSectionsResponseSchema.parse({
      schemaVersion: 1,
      generatedAt,
      releaseId,
      baselineMonth: months.servingMonth,
      dataAsOf: months.latestSpeedMonth ?? months.servingMonth,
      sections,
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: rows.length === 0 ? "unavailable" : "partial_public_monthly_only",
        confidence: rows.length === 0 ? "low" : "medium",
        caveats: [
          "Route sections are transparent Snapshot 2.0 triage projections, not promoted detector findings.",
          routeEvidenceIndex === null
            ? "Reliability Watch and Evidence Ready are intentionally marked not_built until their backing projections exist."
            : "Reliability Watch is not_built; Evidence Ready is derived from the published MTA-wiki route evidence index.",
        ],
      },
    }),
  };
}

async function findStudioRouteIndexSourceRow(input: {
  env: StudioReadEnv;
  slug: string;
  baselineMonth: string;
}): Promise<StudioRouteIndexSourceRow | null> {
  if (input.env.DB === undefined) return null;
  const rows = await listStudioRouteIndexSourceRows(
    createD1ServingDb(input.env.DB),
    input.baselineMonth,
  );
  return rows.find((row) => routeIdToStudioSlug(row.routeId) === input.slug) ?? null;
}

async function findObservedReliabilityRow(input: {
  env: StudioReadEnv;
  baselineMonth: string;
  routeId: string;
}): Promise<D1RouteObservedReliabilitySummary | undefined> {
  if (input.env.DB === undefined) return undefined;
  const observed = await listRouteObservedReliabilitySummaries(
    createD1ServingDb(input.env.DB),
    input.baselineMonth,
  );
  return observed.find((row) => row.routeId === input.routeId);
}

function routeCapabilityForRouteId(
  manifest: RouteCapabilityManifestForIndex | null,
  routeId: string,
): StudioRouteCapability | null {
  const byRoute = routeCapabilityByRouteId(manifest);
  for (const alias of routeIdAliases(routeId)) {
    const capability = byRoute.get(alias);
    if (capability !== undefined) return capability;
  }
  return null;
}

// De-monthed (hard-cutover C2): the detail path never reads env.BASELINE_MONTH —
// the serving month for the partial D1 fallback resolves internally from D1, and
// the rich path is pure R2 projections (detail + capability row + dossier summary).
async function buildStudioRouteDetailResponseFromD1(
  env: StudioReadEnv,
  slug: string,
): Promise<BuildStudioRouteDetailResponseResult> {
  if (env.DB === undefined) {
    return {
      ok: false,
      response: dependencyNotConfiguredResponse("DB", "Studio route detail"),
    };
  }
  const servingDb = createD1ServingDb(env.DB);
  const servingMonth = await findLatestStudioServingMonth(servingDb);
  if (servingMonth === null) {
    return {
      ok: false,
      response: errorResponse(503, "No serving month is available in D1."),
    };
  }

  const row = await findStudioRouteIndexSourceRow({ env, slug, baselineMonth: servingMonth });
  if (row === null) {
    return { ok: false, response: errorResponse(404, "Studio route was not found.") };
  }

  if (row.artifactNames.length > 0) {
    const richDetail = await maybeLoadStudioRouteDetailProjection(env, slug);
    if (richDetail !== null) {
      const [manifest, spines, capabilityManifest, dossier, equityContext, hourlyProfile] =
        await Promise.all([
          loadDetectorReadinessServingManifest(env),
          loadRouteSpeedSpineCandidatesForSegments({
            env,
            routeId: row.routeId,
            requestedSlug: slug,
          }),
          loadRouteCapabilityManifest(env),
          loadRouteDossierSummaryForDetail({ env, routeId: row.routeId, requestedSlug: slug }),
          findRouteEquityContext(servingDb, row.routeId, servingMonth),
          loadRouteHourlyProfileForDetail({ env, routeId: row.routeId, requestedSlug: slug }),
        ]);
      const routeDetail = routeDetailWithCapabilityAndDossier({
        routeDetail: routeDetailWithInsights({ routeDetail: richDetail, manifest }),
        capability: routeCapabilityForRouteId(capabilityManifest, row.routeId),
        dossier,
        equityContext: studioRouteEquityContextFromD1(equityContext),
        hourlyProfile,
      });
      return {
        ok: true,
        routeDetail: routeDetailWithInsightTargetSegments({ routeDetail, spines }),
      };
    }
  }

  const [
    observed,
    manifest,
    aliasedRichDetail,
    spines,
    capabilityManifest,
    dossier,
    equityContext,
    hourlyProfile,
  ] = await Promise.all([
    findObservedReliabilityRow({ env, baselineMonth: servingMonth, routeId: row.routeId }),
    loadDetectorReadinessServingManifest(env),
    maybeLoadAliasedStudioRouteDetailProjection({
      env,
      routeId: row.routeId,
      requestedSlug: slug,
    }),
    loadRouteSpeedSpineCandidatesForSegments({
      env,
      routeId: row.routeId,
      requestedSlug: slug,
    }),
    loadRouteCapabilityManifest(env),
    loadRouteDossierSummaryForDetail({ env, routeId: row.routeId, requestedSlug: slug }),
    findRouteEquityContext(servingDb, row.routeId, servingMonth),
    loadRouteHourlyProfileForDetail({ env, routeId: row.routeId, requestedSlug: slug }),
  ]);
  const capability = routeCapabilityForRouteId(capabilityManifest, row.routeId);
  const routeEquityContext = studioRouteEquityContextFromD1(equityContext);
  if (aliasedRichDetail !== null) {
    const routeDetail = routeDetailWithCapabilityAndDossier({
      routeDetail: routeDetailWithInsights({
        manifest,
        routeDetail: aliasedRouteDetailForD1Row({
          row,
          observed,
          richDetail: aliasedRichDetail,
        }),
      }),
      capability,
      dossier,
      equityContext: routeEquityContext,
      hourlyProfile,
    });
    return {
      ok: true,
      routeDetail: routeDetailWithInsightTargetSegments({ routeDetail, spines }),
    };
  }

  const caveats = [
    "This is a partial route detail built from the all-route index; rich map, segment, finding, and evidence sections may be unavailable.",
    ...routeIndexCaveats(row),
    ...(row.artifactNames.length > 0
      ? [
          "A rich route artifact is indexed in D1, but the R2 detail projection is not available to this request.",
        ]
      : []),
  ];

  const partialRouteDetail = routeDetailWithInsights({
    manifest,
    routeDetail: StudioRouteDetailResponseSchema.parse({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      route: buildStudioRouteCardFromIndexRow(row, observed, null),
      segments: [],
      artifactRefs: [],
      ...(hourlyProfile ?? {}),
      capability,
      dossier,
      equityContext: routeEquityContext,
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: row.summary === null ? "unavailable" : "partial_public_monthly_only",
        confidence: row.summary === null ? "low" : "medium",
        caveats,
      },
    }),
  });

  return {
    ok: true,
    routeDetail: routeDetailWithInsightTargetSegments({
      spines,
      routeDetail: partialRouteDetail,
    }),
  };
}

export async function buildStudioRoutesResponse(
  env: StudioReadEnv,
): Promise<BuildStudioRoutesResponseResult> {
  // D1-backed listing covers all release routes. Falls back to the R2 projection only when
  // env.DB is unset (dev/test envs); production sets DB so this fallback never fires there.
  const months = await resolveServingMonths(env);
  if (env.DB !== undefined && months !== null) {
    const baselineMonth = months.servingMonth;
    const routes = await listStudioRouteCardsFromD1(env, baselineMonth);
    if (routes.length > 0) {
      return {
        ok: true,
        routes,
        generatedAt: new Date().toISOString(),
        quality: {
          releaseLayer: "baseline_release",
          completenessStatus: "partial_public_monthly_only",
          confidence: "medium",
          caveats: [
            `Studio route listing is served live from D1 for ${baselineMonth}.`,
            "Rich per-route artifacts, briefs, and findings remain release-static R2 projections.",
            "Catalog routes without rich artifacts return partial route detail with surface flags and caveats.",
          ],
        },
        releaseLayer: "baseline_release",
      };
    }
  }
  const fallback = await loadStudioProjection(env, "routes.json", StudioRoutesResponseSchema);
  if (fallback instanceof Response) {
    return { ok: false, response: fallback };
  }
  return {
    ok: true,
    routes: [...fallback.routes],
    generatedAt: fallback.generatedAt,
    quality: fallback.quality,
    releaseLayer: fallback.quality.releaseLayer,
  };
}

function buildRouteHistoryCoverage(points: readonly D1RouteMonthTrend[]) {
  return {
    startMonth: points[0]?.month ?? null,
    endMonth: points.length === 0 ? null : (points[points.length - 1]?.month ?? null),
    pointCount: points.length,
    speedMonthCount: points.filter((point) => point.hasSpeedTrend && point.averageSpeedMph !== null)
      .length,
    ridershipMonthCount: points.filter(
      (point) => point.hasRidershipTrend && point.ridership !== null,
    ).length,
  };
}

export async function buildStudioRouteHistoryResponse(
  env: StudioReadEnv,
  slug: string,
): Promise<BuildStudioRouteHistoryResponseResult> {
  if (env.DB === undefined) {
    return {
      ok: false,
      response: dependencyNotConfiguredResponse("DB", "Studio route history"),
    };
  }
  const months = await resolveServingMonths(env);
  if (months === null) {
    return { ok: false, response: errorResponse(503, NO_SERVING_MONTH_MESSAGE) };
  }

  const row = await findStudioRouteIndexSourceRow({
    env,
    slug,
    baselineMonth: months.servingMonth,
  });
  if (row === null) {
    return { ok: false, response: errorResponse(404, "Studio route history was not found.") };
  }

  const [points, observed] = await Promise.all([
    listRouteMonthTrends(createD1ServingDb(env.DB), row.routeId),
    findObservedReliabilityRow({ env, baselineMonth: months.servingMonth, routeId: row.routeId }),
  ]);
  const route = buildStudioRouteCardFromIndexRow(row, observed, null);
  const coverage = buildRouteHistoryCoverage(points);
  const speedCaveat =
    months.latestSpeedMonth === null
      ? "Average speed is present only for months with public MTA route segment speed rows."
      : `Average speed is present only for months with public MTA route segment speed rows through ${months.latestSpeedMonth}.`;

  return {
    ok: true,
    history: StudioRouteHistoryResponseSchema.parse({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      route,
      points,
      coverage,
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus:
          coverage.pointCount === 0 ? "unavailable" : "partial_public_monthly_only",
        confidence: coverage.pointCount === 0 ? "low" : "medium",
        caveats: [
          "Route history is served from D1 route_month_trend rows, not from the single-month R2 detail artifact.",
          speedCaveat,
          "Recent ridership rows can extend beyond the latest public MTA speed month, so speed fields may be null while ridership is present.",
        ],
      },
    }),
  };
}

function routeSpeedHistoryArtifactKey(slug: string): string {
  return `studio/v2/routes/${slug}/speed-history.json`;
}

export async function buildStudioRouteHourlyProfileResponse(
  env: StudioReadEnv,
  slug: string,
): Promise<BuildStudioRouteHourlyProfileResponseResult> {
  if (env.ARTIFACTS === undefined) {
    return {
      ok: false,
      response: dependencyNotConfiguredResponse("ARTIFACTS", "Studio route hourly profile"),
    };
  }

  const key = routeHourlyProfileArtifactKey(slug);
  const object = await env.ARTIFACTS.get(key);
  if (object === null) {
    return {
      ok: false,
      response: errorResponse(404, "Studio route hourly profile was not found."),
    };
  }

  let payload: unknown;
  try {
    payload = await object.json();
  } catch {
    return {
      ok: false,
      response: artifactNotAvailableResponse(
        502,
        "Studio route hourly profile is not valid JSON.",
        key,
      ),
    };
  }

  const parsed = StudioRouteHourlyProfileResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      response: artifactNotAvailableResponse(
        502,
        "Studio route hourly profile failed contract validation.",
        key,
      ),
    };
  }
  if (parsed.data.routeSlug !== slug) {
    return {
      ok: false,
      response: artifactNotAvailableResponse(
        502,
        "Studio route hourly profile slug mismatch.",
        key,
      ),
    };
  }

  return { ok: true, hourlyProfile: parsed.data };
}

export async function buildStudioRouteSpeedHistoryResponse(
  env: StudioReadEnv,
  slug: string,
): Promise<BuildStudioRouteSpeedHistoryResponseResult> {
  if (env.ARTIFACTS === undefined) {
    return {
      ok: false,
      response: dependencyNotConfiguredResponse("ARTIFACTS", "Studio route speed history"),
    };
  }

  const key = routeSpeedHistoryArtifactKey(slug);
  const object = await env.ARTIFACTS.get(key);
  if (object === null) {
    return {
      ok: false,
      response: errorResponse(404, "Studio route speed history was not found."),
    };
  }

  let payload: unknown;
  try {
    payload = await object.json();
  } catch {
    return {
      ok: false,
      response: artifactNotAvailableResponse(
        502,
        "Studio route speed history is not valid JSON.",
        key,
      ),
    };
  }

  const parsed = StudioRouteSpeedHistoryResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      response: artifactNotAvailableResponse(
        502,
        "Studio route speed history failed contract validation.",
        key,
      ),
    };
  }
  if (parsed.data.routeSlug !== slug) {
    return {
      ok: false,
      response: artifactNotAvailableResponse(502, "Studio route speed history slug mismatch.", key),
    };
  }

  return { ok: true, speedHistory: parsed.data };
}

export async function buildStudioRouteTimelineResponse(
  env: StudioReadEnv,
  slug: string,
): Promise<BuildStudioRouteTimelineResponseResult> {
  if (env.DB === undefined) {
    return {
      ok: false,
      response: dependencyNotConfiguredResponse("DB", "Studio route timeline"),
    };
  }
  if (env.ARTIFACTS === undefined) {
    return {
      ok: false,
      response: dependencyNotConfiguredResponse("ARTIFACTS", "Studio route timeline"),
    };
  }
  const months = await resolveServingMonths(env);
  if (months === null) {
    return { ok: false, response: errorResponse(503, NO_SERVING_MONTH_MESSAGE) };
  }
  const baselineMonth = months.servingMonth;

  const row = await findStudioRouteIndexSourceRow({ env, slug, baselineMonth });
  if (row === null) {
    return { ok: false, response: errorResponse(404, "Studio route timeline was not found.") };
  }
  if (!hasRouteTimelineBundle(row)) {
    return {
      ok: true,
      timeline: emptyStudioRouteEvidenceBundle({ routeId: row.routeId, routeSlug: slug }),
    };
  }

  const key = studioRouteEvidenceBundleKey(routeIdToStudioSlug(row.routeId));
  const object = await env.ARTIFACTS.get(key);
  if (object === null) {
    return {
      ok: true,
      timeline: emptyStudioRouteEvidenceBundle({ routeId: row.routeId, routeSlug: slug }),
    };
  }

  let payload: unknown;
  try {
    payload = await object.json();
  } catch {
    return {
      ok: false,
      response: artifactNotAvailableResponse(
        502,
        "Studio route evidence bundle is not valid JSON.",
        key,
      ),
    };
  }

  const parsed = StudioRouteEvidenceBundleSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("Studio route evidence bundle failed contract validation.", {
      key,
      issues: parsed.error.issues,
    });
    return {
      ok: false,
      response: errorResponse(502, ARTIFACT_NOT_AVAILABLE_MESSAGE),
    };
  }
  if (parsed.data.routeId !== row.routeId || parsed.data.routeSlug !== slug) {
    return {
      ok: false,
      response: artifactNotAvailableResponse(
        502,
        "Studio route evidence bundle failed contract validation.",
        key,
      ),
    };
  }

  return { ok: true, timeline: parsed.data };
}

function compactInterventionsCitation(
  citation: StudioRouteEvidenceBundle["citations"][number],
): StudioInterventionsEvidenceCitation {
  return StudioInterventionsEvidenceCitationSchema.parse({
    key: citation.key,
    sourceId: citation.sourceId,
    ...(citation.pageNumber === undefined ? {} : { pageNumber: citation.pageNumber }),
    ...(citation.sourceTitle === undefined ? {} : { sourceTitle: citation.sourceTitle }),
    ...(citation.publisher === undefined ? {} : { publisher: citation.publisher }),
    ...(citation.sourceUrl === undefined ? {} : { sourceUrl: citation.sourceUrl }),
    ...(citation.publishedDate === undefined ? {} : { publishedDate: citation.publishedDate }),
  });
}

function compactInterventionsEvidenceBundle(
  bundle: StudioRouteEvidenceBundle,
): StudioInterventionsEvidenceBundle {
  const citationKeys = new Set<string>();
  for (const record of [
    ...bundle.timeline,
    ...bundle.interventions,
    ...bundle.projects,
    ...bundle.sourceGaps,
  ]) {
    for (const key of record.citationKeys) {
      citationKeys.add(key);
    }
  }
  const citations = bundle.citations
    .filter((citation) => citationKeys.has(citation.key))
    .map((citation) => compactInterventionsCitation(citation));

  return StudioInterventionsEvidenceBundleSchema.parse({
    routeId: bundle.routeId,
    routeSlug: bundle.routeSlug,
    coverage: {
      timelineCount: bundle.coverage.timelineCount,
      interventionCount: bundle.coverage.interventionCount,
      projectCount: bundle.coverage.projectCount,
      sourceGapCount: bundle.coverage.sourceGapCount,
      citationCount: citations.length,
    },
    timeline: bundle.timeline,
    interventions: bundle.interventions,
    projects: bundle.projects,
    sourceGaps: bundle.sourceGaps,
    citations,
  });
}

function routeHasTimelineProjection(route: StudioRouteIndex2Row): boolean {
  return route.projectionRefs.some(
    (ref) => ref.id === "route_timeline" && ref.status === "available" && ref.path !== null,
  );
}

async function loadCompactInterventionsEvidenceBundle(
  env: StudioReadEnv & { ARTIFACTS: R2Bucket },
  route: StudioRouteIndex2Row,
): Promise<{ ok: true; bundle: StudioInterventionsEvidenceBundle | null }> {
  const key = studioRouteEvidenceBundleKey(route.slug);
  const object = await env.ARTIFACTS.get(key);
  if (object === null) return { ok: true, bundle: null };

  let payload: unknown;
  try {
    payload = await object.json();
  } catch {
    console.error("Studio interventions evidence bundle is not valid JSON.", { key });
    return { ok: true, bundle: null };
  }

  const parsed = StudioRouteEvidenceBundleSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("Studio interventions evidence bundle failed contract validation.", {
      key,
      issues: parsed.error.issues,
    });
    return { ok: true, bundle: null };
  }
  if (parsed.data.routeId !== route.routeId || parsed.data.routeSlug !== route.slug) {
    console.error("Studio interventions evidence bundle failed contract validation.", { key });
    return { ok: true, bundle: null };
  }

  return { ok: true, bundle: compactInterventionsEvidenceBundle(parsed.data) };
}

async function buildStudioInterventionsEvidenceResponse(
  env: StudioReadEnv,
): Promise<BuildStudioInterventionsEvidenceResponseResult> {
  if (env.ARTIFACTS === undefined) {
    return {
      ok: false,
      response: dependencyNotConfiguredResponse("ARTIFACTS", "Studio interventions evidence"),
    };
  }
  const artifacts = env.ARTIFACTS;

  const routeIndexResult = await buildStudioRouteIndex2Response(env);
  if (!routeIndexResult.ok) return routeIndexResult;

  const bundleResults = await Promise.all(
    routeIndexResult.routeIndex.routes
      .filter((route) => routeHasTimelineProjection(route))
      .map((route) =>
        loadCompactInterventionsEvidenceBundle({ ...env, ARTIFACTS: artifacts }, route),
      ),
  );
  const bundles = bundleResults.flatMap((result) => {
    if (result.bundle === null) return [];
    return [result.bundle];
  });

  return {
    ok: true,
    evidence: StudioInterventionsEvidenceResponseSchema.parse({
      schemaVersion: 1,
      generatedAt: routeIndexResult.routeIndex.generatedAt,
      routeCount: bundles.length,
      bundles,
    }),
  };
}

function releaseIdForPrefix(prefix: string): string {
  return prefix.replace(/\/release$/, "");
}

function projectionPath(
  env: StudioReadEnv,
  path: string,
  options: { d1Backed?: boolean } = {},
): string {
  return options.d1Backed ? "d1:studio-routes" : studioProjectionKey(env, path);
}

// Legacy support-tier counts, re-derived from the capability rollup (see
// SUPPORT_LEVEL_BY_OVERALL_STATE): summaryReady = anything past insufficient_data,
// artifactReady = an artifact is present, evidenceReady = a public finding surfaced.
function summaryReadyRouteCount(routes: readonly StudioRouteIndex2Row[]): number {
  return routes.filter((route) => route.capability.overallState !== "insufficient_data").length;
}

function artifactReadyRouteCount(routes: readonly StudioRouteIndex2Row[]): number {
  return routes.filter(
    (route) =>
      SUPPORT_LEVEL_BY_OVERALL_STATE[route.capability.overallState] !== "index_only" &&
      SUPPORT_LEVEL_BY_OVERALL_STATE[route.capability.overallState] !== "summary_ready",
  ).length;
}

function evidenceReadyRouteCount(routes: readonly StudioRouteIndex2Row[]): number {
  return routes.filter((route) => route.capability.overallState === "ready").length;
}

function sourceMonthStatus(value: string): StudioSourceMonthState["status"] {
  if (
    value === "available" ||
    value === "partial" ||
    value === "available_not_fetched" ||
    value === "upstream_blocked" ||
    value === "downstream_blocked" ||
    value === "derived_not_built" ||
    value === "source_absent"
  ) {
    return value;
  }
  return "source_absent";
}

function sourceMonthStates(input: {
  routeIndex: StudioRouteIndex2Response;
  sourceMonthCoverage: readonly D1SourceMonthCoverage[];
  lastBuiltSpeedMonth: string | undefined;
  routeEvidenceIndex: StudioRouteEvidenceIndex | null;
  modelProjection: ModelArtifactServingProjection | null;
}): StudioSourceMonthState[] {
  const routeEvidenceRowCount =
    input.routeEvidenceIndex === null
      ? null
      : input.routeEvidenceIndex.routes.reduce(
          (sum, route) => sum + routeEvidenceFactCount(route),
          0,
        );
  const routeEvidenceState: StudioSourceMonthState = {
    sourceId: "mta_wiki_route_evidence",
    label: "MTA-wiki route evidence",
    month: input.routeIndex.baselineMonth,
    status: input.routeEvidenceIndex === null ? "derived_not_built" : "available",
    rowCount: routeEvidenceRowCount,
    routeCount: input.routeEvidenceIndex?.summary.routeCount ?? null,
    grain: input.routeEvidenceIndex === null ? null : "route_evidence_bundle",
    reason:
      input.routeEvidenceIndex === null
        ? "MTA-wiki route evidence index is not published to R2."
        : "MTA-wiki route evidence bundles are published to R2 with citation-backed coverage counts.",
    producerCommand: "studio import-mta-wiki-route-evidence",
  };
  const modelArtifactState: StudioSourceMonthState = {
    sourceId: "detector_model_artifact_status",
    label: "Detector model artifact status",
    month: input.routeIndex.baselineMonth,
    status: input.modelProjection === null ? "derived_not_built" : "available",
    rowCount: input.modelProjection?.summary.modelCount ?? null,
    routeCount: null,
    grain: input.modelProjection === null ? null : "model_artifact_status",
    reason:
      input.modelProjection === null
        ? "Safe model-serving projection is not published to R2."
        : "Safe model-serving projection is published to R2 without raw model rows.",
    producerCommand: "evaluate detectors",
  };

  if (input.sourceMonthCoverage.length > 0) {
    const rows = input.sourceMonthCoverage.map((row) => ({
      sourceId: row.sourceId,
      label: row.label,
      month: row.month,
      status: sourceMonthStatus(row.status),
      rowCount: row.rowCount,
      routeCount: row.routeCount,
      grain: row.grain,
      reason: row.note,
      producerCommand: "audit data-product-completeness",
    }));
    const withRouteEvidence = rows.some((row) => row.sourceId === "mta_wiki_route_evidence")
      ? rows.map((row) => (row.sourceId === "mta_wiki_route_evidence" ? routeEvidenceState : row))
      : [...rows, routeEvidenceState];
    return withRouteEvidence.some((row) => row.sourceId === "detector_model_artifact_status")
      ? withRouteEvidence.map((row) =>
          row.sourceId === "detector_model_artifact_status" ? modelArtifactState : row,
        )
      : [...withRouteEvidence, modelArtifactState];
  }

  const speedMonthCount = input.routeIndex.routes.reduce(
    (sum, route) => sum + route.historyCoverage.speedMonthCount,
    0,
  );
  const ridershipMonthCount = input.routeIndex.routes.reduce(
    (sum, route) => sum + route.historyCoverage.ridershipMonthCount,
    0,
  );
  const historyStartMonths = input.routeIndex.routes.flatMap((route) =>
    route.historyCoverage.startMonth === null ? [] : [route.historyCoverage.startMonth],
  );
  const historyEndMonths = input.routeIndex.routes.flatMap((route) =>
    route.historyCoverage.endMonth === null ? [] : [route.historyCoverage.endMonth],
  );
  const latestHistoryMonth =
    historyEndMonths.length === 0 ? null : ([...historyEndMonths].sort().at(-1) ?? null);

  return [
    {
      sourceId: "mta_bus_route_segment_speeds",
      label: "MTA bus route segment speeds",
      month: input.lastBuiltSpeedMonth ?? latestHistoryMonth,
      status: speedMonthCount > 0 ? "available" : "source_absent",
      rowCount: speedMonthCount,
      routeCount: null,
      grain: "route_month",
      reason:
        input.lastBuiltSpeedMonth === undefined
          ? "LAST_BUILT_SPEED_MONTH is not configured in the serving environment."
          : null,
      producerCommand: "export d1",
    },
    {
      sourceId: "mta_bus_hourly_ridership",
      label: "MTA bus hourly ridership",
      month: latestHistoryMonth,
      status: ridershipMonthCount > 0 ? "available" : "source_absent",
      rowCount: ridershipMonthCount,
      routeCount: null,
      grain: "route_month",
      reason: historyStartMonths.length === 0 ? "No route-month history rows are loaded." : null,
      producerCommand: "export d1",
    },
    {
      sourceId: "detector_coverage_ledger",
      label: "Detector coverage ledger",
      month: input.routeIndex.baselineMonth,
      status: "derived_not_built",
      rowCount: null,
      routeCount: null,
      grain: null,
      reason: "Snapshot 2.0 route addressability is available before detector coverage is served.",
      producerCommand: null,
    },
    {
      ...routeEvidenceState,
    },
    {
      ...modelArtifactState,
    },
  ];
}

function buildSnapshot2(input: {
  routeIndex: StudioRouteIndex2Response;
  sourceMonthCoverage: readonly D1SourceMonthCoverage[];
  skippedSourceMonthCoverageRows: number;
  lastBuiltSpeedMonth: string | undefined;
  routeEvidenceIndex: StudioRouteEvidenceIndex | null;
  modelProjection: ModelArtifactServingProjection | null;
}): StudioSnapshot2 {
  const { routes } = input.routeIndex;
  const artifactReadyCount = artifactReadyRouteCount(routes);
  const evidenceReadyCount = evidenceReadyRouteCount(routes);
  const routeHistoryRows = routes.reduce((sum, route) => sum + route.historyCoverage.pointCount, 0);
  const routeSpeedHistoryCoverageRows = routes.filter((route) =>
    route.projectionRefs.some((ref) => ref.id === "route_speed_history"),
  ).length;
  const sourceCoverageMonths = input.sourceMonthCoverage.map((row) => row.month).sort();
  const projections: StudioSnapshot2ProjectionRef[] = [
    {
      id: "route_index",
      status: routes.length > 0 ? "available" : "missing",
      schemaVersion: 2,
      grain: "route",
      storage: "worker",
      path: "/api/v1/studio/routes?schema=2",
      months: {
        start: input.routeIndex.baselineMonth,
        end: input.routeIndex.baselineMonth,
      },
    },
    {
      id: "route_history_summary",
      status: routeHistoryRows > 0 ? "available" : "missing",
      schemaVersion: 1,
      grain: "route_month",
      storage: "d1",
      path: "/api/v1/studio/routes/:routeId/history",
      months: {
        start:
          routes
            .flatMap((route) =>
              route.historyCoverage.startMonth === null ? [] : [route.historyCoverage.startMonth],
            )
            .sort()[0] ?? null,
        end:
          routes
            .flatMap((route) =>
              route.historyCoverage.endMonth === null ? [] : [route.historyCoverage.endMonth],
            )
            .sort()
            .at(-1) ?? null,
      },
    },
    {
      id: "route_speed_history",
      status:
        routeSpeedHistoryCoverageRows > 0
          ? routes.some(
              // biome-ignore lint/complexity/useLiteralKeys: capability surfaces are typed as an index signature.
              (route) => route.capability.surfaces["speedHistory"]?.state === "partial",
            )
            ? "partial"
            : "available"
          : "missing",
      schemaVersion: 1,
      grain: "route_segment_month_daypart",
      storage: "r2",
      path: "/api/v1/studio/routes/:routeId/speed-history",
      months: {
        start:
          routes
            .flatMap((route) =>
              route.historyCoverage.startMonth === null ? [] : [route.historyCoverage.startMonth],
            )
            .sort()[0] ?? null,
        end: input.lastBuiltSpeedMonth ?? null,
      },
    },
    {
      id: "source_month_coverage",
      status: input.sourceMonthCoverage.length > 0 ? "available" : "missing",
      schemaVersion: 1,
      grain: "source_month",
      storage: "d1",
      path: "d1:source_month_coverage",
      months: {
        start: sourceCoverageMonths[0] ?? null,
        end: sourceCoverageMonths.at(-1) ?? null,
      },
    },
    {
      id: "detector_model_status",
      status:
        input.modelProjection === null
          ? "not_built"
          : input.modelProjection.summary.missingModelCount > 0
            ? "partial"
            : "available",
      schemaVersion: 1,
      grain: "model_artifact_status",
      storage: "r2",
      path: STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY,
      months:
        input.modelProjection === null
          ? {
              start: input.routeIndex.baselineMonth,
              end: input.routeIndex.baselineMonth,
            }
          : {
              start: input.modelProjection.historyWindow.startMonth,
              end: input.modelProjection.historyWindow.endMonth,
            },
    },
  ];

  return {
    schemaVersion: 2,
    generatedAt: input.routeIndex.generatedAt,
    releaseId: input.routeIndex.releaseId,
    baselineMonth: input.routeIndex.baselineMonth,
    currentSignalMonth: null,
    routeUniverse: {
      source: "route_catalog",
      routeCount: routes.length,
      indexedRouteCount: routes.length,
      summaryReadyRouteCount: summaryReadyRouteCount(routes),
      artifactReadyRouteCount: artifactReadyCount,
      evidenceReadyRouteCount: evidenceReadyCount,
    },
    sourceMonths: sourceMonthStates({
      routeIndex: input.routeIndex,
      sourceMonthCoverage: input.sourceMonthCoverage,
      lastBuiltSpeedMonth: input.lastBuiltSpeedMonth,
      routeEvidenceIndex: input.routeEvidenceIndex,
      modelProjection: input.modelProjection,
    }),
    counts: {
      routes: routes.length,
      routeDetails: artifactReadyCount,
      routeHistoryRows,
      routeIndexRows: routes.length,
      routeSpeedHistoryCoverageRows,
      sourceMonthCoverageRows: input.sourceMonthCoverage.length,
    },
    caveats: [
      "Snapshot 2.0 is an addressability and coverage manifest, not the final route-page payload model.",
      "Route support levels describe which public surfaces are present; sparse catalog routes should still resolve to route shells.",
      ...(input.skippedSourceMonthCoverageRows === 0
        ? []
        : [
            `${input.skippedSourceMonthCoverageRows.toLocaleString("en-US")} source-month coverage row${input.skippedSourceMonthCoverageRows === 1 ? "" : "s"} failed the public month contract and ${input.skippedSourceMonthCoverageRows === 1 ? "was" : "were"} omitted from this snapshot.`,
          ]),
      input.modelProjection === null
        ? "Detector model status is not yet published as a safe serving projection."
        : "Detector model status is published as a compact R2 projection; raw model rows remain internal.",
    ],
    projections,
  };
}

async function buildStudioSnapshotResponseUnchecked(env: StudioReadEnv): Promise<Response> {
  const [routesResult, methods, docs, routeEvidenceIndex, modelProjection] = await Promise.all([
    buildStudioRoutesResponse(env),
    loadStudioProjection(env, "methods.json", StudioMethodsResponseSchema),
    loadStudioProjection(env, "docs.json", StudioDocsResponseSchema),
    loadStudioRouteEvidenceIndex(env),
    loadModelArtifactServingProjection(env),
  ]);
  if (!routesResult.ok) return routesResult.response;
  if (methods instanceof Response) return methods;
  if (docs instanceof Response) return docs;
  const docsProjection = withGeneratedDocsEndpoints(docs);

  const generatedAt = new Date().toISOString();
  const resolvedMonths = await resolveServingMonths(env);
  const routesAreD1Backed = env.DB !== undefined && resolvedMonths !== null;
  const routeIndex2Result = routesAreD1Backed ? await buildStudioRouteIndex2Response(env) : null;
  let snapshot2: StudioSnapshot2 | undefined;
  let snapshot2BuildFailure: unknown = null;
  if (routeIndex2Result?.ok === true && env.DB !== undefined) {
    try {
      const publicSourceMonthCoverage = await listPublicSnapshotSourceMonthCoverage(
        createD1ServingDb(env.DB),
      );
      snapshot2 = buildSnapshot2({
        routeIndex: routeIndex2Result.routeIndex,
        sourceMonthCoverage: publicSourceMonthCoverage.rows,
        skippedSourceMonthCoverageRows: publicSourceMonthCoverage.skippedRowCount,
        lastBuiltSpeedMonth: resolvedMonths?.latestSpeedMonth ?? undefined,
        routeEvidenceIndex,
        modelProjection,
      });
    } catch (error) {
      snapshot2BuildFailure = error;
      console.error("Studio Snapshot 2.0 assembly failed; serving v1 snapshot only.", { error });
    }
  }
  const projections: StudioSnapshotProjection[] = [
    {
      resource: "routes",
      path: projectionPath(env, "routes.json", { d1Backed: routesAreD1Backed }),
      itemCount: routesResult.routes.length,
      generatedAt: routesResult.generatedAt,
    },
    {
      resource: "methods",
      path: projectionPath(env, "methods.json"),
      itemCount: methods.datasets.length,
      generatedAt: methods.generatedAt,
    },
    {
      resource: "docs",
      path: projectionPath(env, "docs.json"),
      itemCount: docsProjection.sections.length + docsProjection.endpoints.length,
      generatedAt: docsProjection.generatedAt,
    },
  ];
  const prefix = studioProjectionPrefix(env);
  const baseSnapshot = {
    schemaVersion: 1,
    generatedAt,
    releaseId: releaseIdForPrefix(prefix),
    projectionPrefix: prefix,
    releaseKey: studioReleaseKey(env),
    baselineMonth: resolvedMonths?.servingMonth ?? null,
    lastBuiltSpeedMonth: resolvedMonths?.latestSpeedMonth ?? null,
    counts: {
      routes: routesResult.routes.length,
      methods: methods.datasets.length,
      docsSections: docsProjection.sections.length,
      docsEndpoints: docsProjection.endpoints.length,
    },
    projections,
    quality:
      snapshot2BuildFailure === null
        ? routesResult.quality
        : snapshotQualityWithCaveat(routesResult.quality, SNAPSHOT_2_OMITTED_CAVEAT),
  };

  const parsedSnapshot = StudioSnapshotResponseSchema.safeParse(
    snapshot2 === undefined ? baseSnapshot : { ...baseSnapshot, v2: snapshot2 },
  );

  if (!parsedSnapshot.success) {
    if (snapshot2 !== undefined) {
      console.error("Studio Snapshot 2.0 contract validation failed; serving v1 snapshot only.", {
        issues: parsedSnapshot.error.issues,
      });
      const fallbackSnapshot = StudioSnapshotResponseSchema.safeParse({
        ...baseSnapshot,
        quality: snapshotQualityWithCaveat(routesResult.quality, SNAPSHOT_2_OMITTED_CAVEAT),
      });
      if (fallbackSnapshot.success) {
        return studioJsonResponse(fallbackSnapshot.data, env);
      }
    }

    return snapshotContractFailureResponse({
      issues: parsedSnapshot.error.issues,
    });
  }

  return studioJsonResponse(parsedSnapshot.data, env);
}

async function buildStudioSnapshotResponse(env: StudioReadEnv): Promise<Response> {
  try {
    return await buildStudioSnapshotResponseUnchecked(env);
  } catch (error) {
    return snapshotContractFailureResponse({ error });
  }
}

export async function handleStudioReadRequest<TEnv extends StudioReadEnv>(
  _request: Request,
  url: URL,
  env: TEnv,
): Promise<Response> {
  if (url.pathname === "/api/v1/studio/routes") {
    if (url.searchParams.get("schema") === "2") {
      const result = await buildStudioRouteIndex2Response(env);
      return result.ok ? studioJsonResponse(result.routeIndex, env) : result.response;
    }

    const result = await buildStudioRoutesResponse(env);
    if (!result.ok) return result.response;
    return studioJsonResponse(
      StudioRoutesResponseSchema.parse({
        schemaVersion: 1,
        generatedAt: result.generatedAt,
        routes: result.routes,
        quality: result.quality,
      }),
      env,
    );
  }

  if (url.pathname === "/api/v1/studio/snapshot") {
    return buildStudioSnapshotResponse(env);
  }

  if (url.pathname === "/api/v1/studio/routes/sections") {
    const result = await buildStudioRouteSectionsResponse(env);
    return result.ok ? studioJsonResponse(result.routeSections, env) : result.response;
  }

  if (url.pathname === "/api/v1/studio/interventions/evidence") {
    const result = await buildStudioInterventionsEvidenceResponse(env);
    return result.ok ? studioJsonResponse(result.evidence, env) : result.response;
  }

  const routeMatch = url.pathname.match(/^\/api\/v1\/studio\/routes\/([^/]+)$/);
  if (routeMatch) {
    const slug = decodeURIComponent(routeMatch[1] ?? "");
    if (env.DB !== undefined) {
      const result = await buildStudioRouteDetailResponseFromD1(env, slug);
      return result.ok ? studioJsonResponse(result.routeDetail, env) : result.response;
    }

    const routes = await loadStudioProjection(env, "routes.json", StudioRoutesResponseSchema);
    if (routes instanceof Response) return routes;
    if (getStudioRoute(routes, slug) === undefined) {
      return errorResponse(404, "Studio route was not found.");
    }

    const route = await loadStudioProjection(
      env,
      `routes/${slug}/index.json`,
      StudioRouteDetailResponseSchema,
    );
    if (route instanceof Response) return route;
    const [capabilityManifest, dossier, hourlyProfile] = await Promise.all([
      loadRouteCapabilityManifest(env),
      loadRouteDossierSummaryForDetail({
        env,
        routeId: route.route.routeId,
        requestedSlug: slug,
      }),
      loadRouteHourlyProfileForDetail({
        env,
        routeId: route.route.routeId,
        requestedSlug: slug,
      }),
    ]);
    return studioJsonResponse(
      routeDetailWithCapabilityAndDossier({
        routeDetail: route,
        capability: routeCapabilityForRouteId(capabilityManifest, route.route.routeId),
        dossier,
        equityContext: null,
        hourlyProfile,
      }),
      env,
    );
  }

  const historyMatch = url.pathname.match(/^\/api\/v1\/studio\/routes\/([^/]+)\/history$/);
  if (historyMatch) {
    const slug = decodeURIComponent(historyMatch[1] ?? "");
    const result = await buildStudioRouteHistoryResponse(env, slug);
    return result.ok ? studioJsonResponse(result.history, env) : result.response;
  }

  const hourlyProfileMatch = url.pathname.match(
    /^\/api\/v1\/studio\/routes\/([^/]+)\/hourly-profile$/,
  );
  if (hourlyProfileMatch) {
    const slug = decodeURIComponent(hourlyProfileMatch[1] ?? "");
    const result = await buildStudioRouteHourlyProfileResponse(env, slug);
    return result.ok ? studioJsonResponse(result.hourlyProfile, env) : result.response;
  }

  const speedHistoryMatch = url.pathname.match(
    /^\/api\/v1\/studio\/routes\/([^/]+)\/speed-history$/,
  );
  if (speedHistoryMatch) {
    const slug = decodeURIComponent(speedHistoryMatch[1] ?? "");
    const result = await buildStudioRouteSpeedHistoryResponse(env, slug);
    return result.ok ? studioJsonResponse(result.speedHistory, env) : result.response;
  }

  const timelineMatch = url.pathname.match(/^\/api\/v1\/studio\/routes\/([^/]+)\/timeline$/);
  if (timelineMatch) {
    const slug = decodeURIComponent(timelineMatch[1] ?? "");
    const result = await buildStudioRouteTimelineResponse(env, slug);
    return result.ok ? studioJsonResponse(result.timeline, env) : result.response;
  }

  if (url.pathname === "/api/v1/studio/methods") {
    const methods = await loadStudioProjection(env, "methods.json", StudioMethodsResponseSchema);
    return methods instanceof Response ? methods : studioJsonResponse(methods, env);
  }

  return errorResponse(404, "Studio API endpoint was not found.");
}
