import {
  createD1ServingDb,
  type RouteMonthTrend as D1RouteMonthTrend,
  type RouteObservedReliabilitySummary as D1RouteObservedReliabilitySummary,
  type SourceMonthCoverage as D1SourceMonthCoverage,
  getRouteTimelineIndex,
  listRouteMonthTrends,
  listRouteObservedReliabilitySummaries,
  listSourceMonthCoverage,
  listStudioRouteIndexSourceRows,
  type StudioRouteIndexSourceRow,
} from "@bp/db/d1";
import {
  buildRouteInsightsFromDetectorReadiness,
  buildStudioCompareProjection,
  type DetectorReadinessServingManifestForInsights,
  DetectorReadinessServingManifestForInsightsSchema,
  getStudioRoute,
} from "@bp/domain/studio";
import {
  StudioBriefEvidenceResponseSchema,
  StudioBriefHistoryResponseSchema,
  type StudioBriefResponse,
  StudioBriefsResponseSchema,
} from "@bp/domain/studio/briefs";
import { StudioDocsResponseSchema, StudioMethodsResponseSchema } from "@bp/domain/studio/docs";
import {
  StudioFindingResponseSchema,
  StudioFindingsResponseSchema,
} from "@bp/domain/studio/findings";
import {
  StudioCompareResponseSchema,
  type StudioReleasePayload,
  StudioSearchResponseSchema,
} from "@bp/domain/studio/release";
import {
  type StudioObservedReliability,
  type StudioRoute,
  type StudioRouteDetailResponse,
  StudioRouteDetailResponseSchema,
  type StudioRouteHistoryResponse,
  StudioRouteHistoryResponseSchema,
  type StudioRouteLadderResponse,
  StudioRouteLadderResponseSchema,
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
  StudioSegmentsResponseSchema,
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
import * as z from "zod";
import type { StudioApiEnv } from "../env.js";
import { errorResponse } from "../http/errors.js";
import {
  loadStudioBriefProjection,
  loadStudioProjection,
  maybeLoadStudioRouteDetailProjection,
  studioJsonResponse,
  studioProjectionKey,
  studioProjectionPrefix,
  studioReleaseKey,
} from "./projections.js";

export type StudioReadEnv = Pick<
  StudioApiEnv,
  "ARTIFACTS" | "BASELINE_MONTH" | "DB" | "LAST_BUILT_SPEED_MONTH" | "STUDIO_RELEASE_KEY"
>;

export type StudioReadHooks<TEnv extends StudioReadEnv = StudioReadEnv> = {
  loadDraftOnlyBriefProjection?: (
    request: Request,
    env: TEnv,
    briefId: string,
  ) => Promise<StudioBriefResponse | Response | null>;
  overlayStudioBriefDraft?: (
    request: Request,
    env: TEnv,
    projection: StudioBriefResponse,
  ) => Promise<StudioBriefResponse>;
};

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

type BuildStudioRouteSpeedHistoryResponseResult =
  | { ok: true; speedHistory: StudioRouteSpeedHistoryResponse }
  | { ok: false; response: Response };

type BuildStudioRouteTimelineResponseResult =
  | { ok: true; timeline: unknown }
  | { ok: false; response: Response };

type BuildStudioRouteLadderResponseResult =
  | { ok: true; ladder: StudioRouteLadderResponse }
  | { ok: false; response: Response };

type BuildStudioRouteIndex2ResponseResult =
  | { ok: true; routeIndex: StudioRouteIndex2Response }
  | { ok: false; response: Response };

type BuildStudioRouteSectionsResponseResult =
  | { ok: true; routeSections: StudioRouteSectionsResponse }
  | { ok: false; response: Response };

type Tier2RouteEvidenceBundle = {
  routeId: string;
  surfaceCount: number;
  mappedFieldCount: number;
  unresolvedFieldCount: number;
  sourceCount: number;
  sourceIds: string[];
  timelineCandidateSurfaceCount: number;
  metricObservationSurfaceCount: number;
  treatmentSurfaceCount: number;
  claimSurfaceCount: number;
  evidencePointerCount: number;
};

type Tier2MaterializedViewsArtifact = {
  artifactKind: "bp.tier2_vocab_materialized_views.v1";
  schemaVersion: 1;
  generatedAt: string;
  routeEvidenceBundles: Tier2RouteEvidenceBundle[];
};

const TIER2_MATERIALIZED_VIEWS_KEY = "studio/v2/tier2/vocab-materialized-views.json";

const ModelArtifactServingProjectionSchema = z
  .object({
    artifactKind: z.literal("model_artifact_serving_projection"),
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    releaseMonth: z.string(),
    historyWindow: z
      .object({
        startMonth: z.string(),
        endMonth: z.string(),
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

function supportLevelForIndexRow(
  row: StudioRouteIndexSourceRow,
): StudioRouteIndex2Row["supportLevel"] {
  if (row.artifactNames.length > 0) return "artifact_ready";
  if (row.summary !== null) return "summary_ready";
  return "index_only";
}

function routeProjectionRef(ref: StudioSnapshot2ProjectionRef): StudioSnapshot2ProjectionRef {
  return ref;
}

function speedHistorySurfaceStatus(
  row: StudioRouteIndexSourceRow,
): StudioRouteIndex2Row["surfaceFlags"]["speedHistory"] {
  if (row.speedHistoryCoverage !== null) {
    return row.speedHistoryCoverage.missingCellCount > 0 ? "partial" : "available";
  }
  return row.historyCoverage.speedMonthCount > 0 ? "not_built" : "missing";
}

function hasRouteTimelineBundle(row: StudioRouteIndexSourceRow): boolean {
  return row.artifactNames.includes("route_timeline_bundle");
}

function routeSurfaceFlags(row: StudioRouteIndexSourceRow): StudioRouteIndex2Row["surfaceFlags"] {
  const hasSummary = row.summary !== null;
  const hasArtifact = row.artifactNames.length > 0;
  const hasRidershipHistory = row.historyCoverage.ridershipMonthCount > 0;
  const hasSchedule = row.readiness !== null && row.readiness.scheduleTimepointCount > 0;
  const hasBusLane = (row.summary?.busLaneMatchedLaneCount ?? 0) > 0;
  const hasAce = row.summary?.aceActive === true;
  const speedHistoryStatus = speedHistorySurfaceStatus(row);
  const hasMultiYearHistory = row.historyCoverage.pointCount > 0;

  return {
    routePage: "available",
    summary: hasSummary ? "available" : row.readiness === null ? "missing" : "partial",
    map: "missing",
    ladder: "missing",
    routeDetailArtifact: hasArtifact ? "available" : "missing",
    speedHistory: speedHistoryStatus,
    ridershipHistory: hasRidershipHistory ? "available" : "missing",
    multiYearHistory:
      hasMultiYearHistory && speedHistoryStatus === "partial"
        ? "partial"
        : hasMultiYearHistory
          ? "available"
          : "missing",
    scheduleBaseline: hasSchedule ? "available" : "missing",
    observedReliability: "missing",
    detectorCoverage: "not_built",
    detectorFindings: "not_built",
    detectorScoreVectors: "not_built",
    busLaneLinks: hasBusLane ? "available" : hasSummary ? "none" : "missing",
    interventions: hasAce ? "available" : hasSummary ? "none" : "missing",
    findings: "none",
    briefs: hasArtifact ? "available" : hasSummary ? "none" : "missing",
    timeline: hasRouteTimelineBundle(row) ? "available" : "not_built",
    evidenceCards: "not_built",
  };
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
        grain: "route_event",
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
    supportLevel: supportLevelForIndexRow(input.row),
    surfaceFlags: routeSurfaceFlags(input.row),
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
): StudioRoute {
  const slug = routeIdToStudioSlug(row.routeId);
  const speedMph = routeSpeedMphForIndexRow(row);
  const scheduledMph = Number((speedMph * 1.18).toFixed(1));
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
    scheduledMph,
    weightedAvgSpeed: speedMph,
    speedPercentile: Math.max(1, Math.min(99, 101 - (row.summary?.routeScore ?? 100))),
    dailyRiders: Math.round((row.summary?.totalRidership ?? 0) / 30),
    ridersYoyPct: 0,
    riderHoursLost: 0,
    laneCoverage: coverage,
    aceStatus: row.summary?.aceActive === true ? "active" : "none",
    aceSince: row.summary?.aceActive === true ? "Serving export" : null,
    tspCoverage: "none",
    reliability: routeReliabilityLabelForIndexRow(row),
    observedReliability: buildObservedReliabilityFromD1(observed),
    diagnosis: routeDiagnosisForIndexRow(row, speedMph, coverage),
    spark: [0.92, 0.96, 1, 0.98, 1.02, 0.99, 1].map((factor) =>
      Number((speedMph * factor).toFixed(1)),
    ),
    termini: routeTerminiForIndexRow(row),
    miles: Number(Math.max(1, row.shapeCount * 1.2).toFixed(1)),
    stops: row.readiness?.stopCount ?? row.stopCount,
    flags: routeFlagsForIndexRow(row),
    peerSlug: null,
    interventions:
      row.summary === null
        ? []
        : [
            {
              year: "Baseline",
              title: "Serving export generated",
              detail: "D1 route score, speed, ridership, and treatment rows are available.",
            },
            ...(row.summary.aceActive
              ? [
                  {
                    year: "Baseline",
                    title: "ACE evidence present",
                    detail: "Automated camera enforcement evidence is present in serving data.",
                    tone: "warn" as const,
                  },
                ]
              : []),
          ],
  };
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
  const routes = rows
    .toSorted((left, right) => {
      const leftScore = left.summary?.routeScore ?? 101;
      const rightScore = right.summary?.routeScore ?? 101;
      return leftScore - rightScore || left.routeId.localeCompare(right.routeId);
    })
    .map((row) => buildStudioRouteCardFromIndexRow(row, observedByRoute.get(row.routeId)));
  return limit !== undefined ? routes.slice(0, limit) : routes;
}

async function buildStudioRouteIndex2Response(
  env: StudioReadEnv,
): Promise<BuildStudioRouteIndex2ResponseResult> {
  const baselineMonth = env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH;
  if (env.DB === undefined) {
    return {
      ok: false,
      response: errorResponse(503, "D1 DB binding is required for Studio route index v2."),
    };
  }
  if (baselineMonth === undefined) {
    return {
      ok: false,
      response: errorResponse(503, "BASELINE_MONTH or LAST_BUILT_SPEED_MONTH is required."),
    };
  }

  const generatedAt = new Date().toISOString();
  const releaseId = releaseIdForPrefix(studioProjectionPrefix(env));
  const rows = await listStudioRouteIndexSourceRows(createD1ServingDb(env.DB), baselineMonth);
  const routes = rows.map((row) =>
    buildStudioRouteIndex2Row({
      releaseId,
      baselineMonth,
      generatedAt,
      lastBuiltSpeedMonth: env.LAST_BUILT_SPEED_MONTH,
      row,
    }),
  );

  return {
    ok: true,
    routeIndex: StudioRouteIndex2ResponseSchema.parse({
      schemaVersion: 2,
      generatedAt,
      releaseId,
      baselineMonth,
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

function routeEvidenceBundleRouteCandidates(bundle: Tier2RouteEvidenceBundle): string[] {
  return routeIdAliases(bundle.routeId);
}

function routeDetailSlugCandidates(routeId: string, requestedSlug: string): string[] {
  const candidates = [requestedSlug, ...routeIdAliases(routeId).map(routeIdToStudioSlug)];
  return [...new Set(candidates)];
}

async function loadTier2MaterializedViews(
  env: StudioReadEnv,
): Promise<Tier2MaterializedViewsArtifact | null> {
  if (env.ARTIFACTS === undefined) return null;
  const object = await env.ARTIFACTS.get(TIER2_MATERIALIZED_VIEWS_KEY);
  if (object === null) return null;

  let payload: unknown;
  try {
    payload = await object.json();
  } catch {
    return null;
  }

  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Partial<Tier2MaterializedViewsArtifact>;
  if (
    candidate.artifactKind !== "bp.tier2_vocab_materialized_views.v1" ||
    candidate.schemaVersion !== 1 ||
    !Array.isArray(candidate.routeEvidenceBundles)
  ) {
    return null;
  }
  return candidate as Tier2MaterializedViewsArtifact;
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
    return null;
  }

  const parsed = ModelArtifactServingProjectionSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
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
  routeScheduledMph: number;
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
    route: buildStudioRouteCardFromIndexRow(input.row, input.observed),
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
      supportLevel: candidate.route.supportLevel,
      score: candidate.score,
      scoreLabel: input.scoreLabel(candidate.score),
      reasons: input.reasons(candidate.row),
      metrics: input.metrics(candidate.row),
    }));
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
      const coreStatuses = [
        route.surfaceFlags.summary,
        route.surfaceFlags.routeDetailArtifact,
        route.surfaceFlags.speedHistory,
        route.surfaceFlags.ridershipHistory,
        route.surfaceFlags.scheduleBaseline,
      ];
      const issueCount = coreStatuses.filter(
        (status) => status !== "available" && status !== "none",
      ).length;
      return issueCount === 0 ? null : issueCount * 10 + (row.summary === null ? 15 : 0);
    },
    reasons(row) {
      const route = input.routeById.get(row.routeId);
      if (route === undefined) return [];
      const reasons: string[] = [];
      if (route.surfaceFlags.summary !== "available")
        reasons.push(`summary ${route.surfaceFlags.summary}`);
      if (route.surfaceFlags.routeDetailArtifact !== "available") {
        reasons.push(`detail artifact ${route.surfaceFlags.routeDetailArtifact}`);
      }
      if (route.surfaceFlags.speedHistory !== "available") {
        reasons.push(`speed history ${route.surfaceFlags.speedHistory}`);
      }
      if (route.surfaceFlags.ridershipHistory !== "available") {
        reasons.push(`ridership history ${route.surfaceFlags.ridershipHistory}`);
      }
      if (route.surfaceFlags.scheduleBaseline !== "available") {
        reasons.push(`schedule baseline ${route.surfaceFlags.scheduleBaseline}`);
      }
      return reasons;
    },
    metrics(row) {
      const route = input.routeById.get(row.routeId);
      const missingCoreCount =
        route === undefined
          ? 0
          : [
              route.surfaceFlags.summary,
              route.surfaceFlags.routeDetailArtifact,
              route.surfaceFlags.speedHistory,
              route.surfaceFlags.ridershipHistory,
              route.surfaceFlags.scheduleBaseline,
            ].filter((status) => status !== "available" && status !== "none").length;
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

function buildEvidenceReadyRows(input: {
  bundles: readonly Tier2RouteEvidenceBundle[];
  routeById: ReadonlyMap<string, StudioRouteIndex2Row>;
}): StudioRouteSectionRow[] {
  return input.bundles
    .flatMap((bundle) => {
      const route = routeEvidenceBundleRouteCandidates(bundle)
        .map((routeId) => input.routeById.get(routeId))
        .find((candidate): candidate is StudioRouteIndex2Row => candidate !== undefined);
      if (route === undefined) return [];
      const score =
        bundle.surfaceCount +
        bundle.mappedFieldCount * 0.25 +
        bundle.sourceCount * 3 +
        bundle.timelineCandidateSurfaceCount * 2 +
        bundle.metricObservationSurfaceCount +
        bundle.treatmentSurfaceCount +
        bundle.claimSurfaceCount;
      if (!Number.isFinite(score) || score <= 0) return [];
      return [{ bundle, route, score: Number(score.toFixed(3)) }];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.bundle.sourceCount - left.bundle.sourceCount ||
        left.route.routeId.localeCompare(right.route.routeId),
    )
    .slice(0, 12)
    .map(({ bundle, route, score }, index) => ({
      rank: index + 1,
      routeId: route.routeId,
      slug: route.slug,
      label: route.label,
      borough: route.borough,
      supportLevel: "evidence_ready",
      score,
      scoreLabel: `${score.toFixed(0)} evidence score`,
      reasons: [
        `${bundle.surfaceCount.toLocaleString("en-US")} route-linked Tier 2 surfaces`,
        `${bundle.sourceCount.toLocaleString("en-US")} source${bundle.sourceCount === 1 ? "" : "s"}`,
        `${bundle.mappedFieldCount.toLocaleString("en-US")} normalized fields`,
      ],
      metrics: [
        metric({
          id: "tier2_surfaces",
          label: "T2 surfaces",
          value: bundle.surfaceCount,
        }),
        metric({
          id: "source_count",
          label: "Sources",
          value: bundle.sourceCount,
        }),
        metric({
          id: "timeline_candidates",
          label: "Timeline candidates",
          value: bundle.timelineCandidateSurfaceCount,
        }),
      ],
    }));
}

export async function buildStudioRouteSectionsResponse(
  env: StudioReadEnv,
): Promise<BuildStudioRouteSectionsResponseResult> {
  const baselineMonth = env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH;
  if (env.DB === undefined) {
    return {
      ok: false,
      response: errorResponse(503, "D1 DB binding is required for Studio route sections."),
    };
  }
  if (baselineMonth === undefined) {
    return {
      ok: false,
      response: errorResponse(503, "BASELINE_MONTH or LAST_BUILT_SPEED_MONTH is required."),
    };
  }

  const generatedAt = new Date().toISOString();
  const releaseId = releaseIdForPrefix(studioProjectionPrefix(env));
  const [rows, tier2Views] = await Promise.all([
    listStudioRouteIndexSourceRows(createD1ServingDb(env.DB), baselineMonth),
    loadTier2MaterializedViews(env),
  ]);
  const routes = rows.map((row) =>
    buildStudioRouteIndex2Row({
      releaseId,
      baselineMonth,
      generatedAt,
      lastBuiltSpeedMonth: env.LAST_BUILT_SPEED_MONTH,
      row,
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
        currentSpeedMonth: env.LAST_BUILT_SPEED_MONTH ?? baselineMonth,
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
    tier2Views === null
      ? section({
          sectionId: "evidence_ready",
          title: "Evidence Ready",
          productQuestion: "Which routes can support source-backed findings or briefs now?",
          status: "not_built",
          rankMeaning:
            "Will rank routes by reviewed findings, promoted timeline events, and stable public evidence ids.",
          minCoverageRule: "Requires the Tier 2 route evidence materialized-view artifact in R2.",
          notBuiltReason:
            "Route evidence index has not been published to the serving artifact bucket.",
        })
      : section({
          sectionId: "evidence_ready",
          title: "Evidence Ready",
          productQuestion: "Which routes can support source-backed findings or briefs now?",
          status: "partial",
          rankMeaning:
            "Higher scores mean more route-linked Tier 2 surfaces, normalized fields, sources, and timeline/metric/treatment/claim evidence.",
          minCoverageRule:
            "Requires route-linked rows in the Tier 2 vocabulary materialized views; this is evidence readiness, not a published claim.",
          rows: buildEvidenceReadyRows({
            bundles: tier2Views.routeEvidenceBundles,
            routeById,
          }),
          caveats: [
            "Tier 2 evidence rows are source-grounded and vocabulary-normalized, but they are not yet promoted findings.",
            "SBS route joins accept base-route aliases such as B46 for B46 SBS.",
          ],
        }),
  ];

  return {
    ok: true,
    routeSections: StudioRouteSectionsResponseSchema.parse({
      schemaVersion: 1,
      generatedAt,
      releaseId,
      baselineMonth,
      sections,
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: rows.length === 0 ? "unavailable" : "partial_public_monthly_only",
        confidence: rows.length === 0 ? "low" : "medium",
        caveats: [
          "Route sections are transparent Snapshot 2.0 triage projections, not promoted detector findings.",
          tier2Views === null
            ? "Reliability Watch and Evidence Ready are intentionally marked not_built until their backing projections exist."
            : "Reliability Watch is not_built; Evidence Ready is derived from the published Tier 2 materialized-view artifact.",
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

async function buildStudioRouteDetailResponseFromD1(
  env: StudioReadEnv,
  slug: string,
): Promise<BuildStudioRouteDetailResponseResult> {
  const baselineMonth = env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH;
  if (env.DB === undefined) {
    return {
      ok: false,
      response: errorResponse(503, "D1 DB binding is required for Studio route detail."),
    };
  }
  if (baselineMonth === undefined) {
    return {
      ok: false,
      response: errorResponse(503, "BASELINE_MONTH or LAST_BUILT_SPEED_MONTH is required."),
    };
  }

  const row = await findStudioRouteIndexSourceRow({ env, slug, baselineMonth });
  if (row === null) {
    return { ok: false, response: errorResponse(404, "Studio route was not found.") };
  }

  if (row.artifactNames.length > 0) {
    const richDetail = await maybeLoadStudioRouteDetailProjection(env, slug);
    if (richDetail !== null) {
      const [manifest, spines] = await Promise.all([
        loadDetectorReadinessServingManifest(env),
        loadRouteSpeedSpineCandidatesForSegments({
          env,
          routeId: row.routeId,
          requestedSlug: slug,
        }),
      ]);
      const routeDetail = routeDetailWithInsights({ routeDetail: richDetail, manifest });
      return {
        ok: true,
        routeDetail: routeDetailWithInsightTargetSegments({ routeDetail, spines }),
      };
    }
  }

  const [observed, manifest, aliasedRichDetail, spines] = await Promise.all([
    findObservedReliabilityRow({ env, baselineMonth, routeId: row.routeId }),
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
  ]);
  if (aliasedRichDetail !== null) {
    const routeDetail = routeDetailWithInsights({
      manifest,
      routeDetail: aliasedRouteDetailForD1Row({
        row,
        observed,
        richDetail: aliasedRichDetail,
      }),
    });
    return {
      ok: true,
      routeDetail: routeDetailWithInsightTargetSegments({ routeDetail, spines }),
    };
  }

  const caveats = [
    "This is a partial route detail built from the all-route index; rich map, ladder, segment, finding, and evidence sections may be unavailable.",
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
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      route: buildStudioRouteCardFromIndexRow(row, observed),
      segments: [],
      artifactRefs: [],
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

async function buildStudioRouteLadderResponseFromD1(
  env: StudioReadEnv,
  slug: string,
): Promise<BuildStudioRouteLadderResponseResult> {
  const baselineMonth = env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH;
  if (env.DB === undefined) {
    return {
      ok: false,
      response: errorResponse(503, "D1 DB binding is required for Studio route ladder."),
    };
  }
  if (baselineMonth === undefined) {
    return {
      ok: false,
      response: errorResponse(503, "BASELINE_MONTH or LAST_BUILT_SPEED_MONTH is required."),
    };
  }

  const row = await findStudioRouteIndexSourceRow({ env, slug, baselineMonth });
  if (row === null) {
    return { ok: false, response: errorResponse(404, "Studio route ladder was not found.") };
  }

  if (row.artifactNames.length > 0) {
    const ladder = await loadStudioProjection(
      env,
      `routes/${slug}/ladder.json`,
      StudioRouteLadderResponseSchema,
    );
    if (!(ladder instanceof Response)) {
      return { ok: true, ladder };
    }
  }

  const observed = await findObservedReliabilityRow({ env, baselineMonth, routeId: row.routeId });
  return {
    ok: true,
    ladder: StudioRouteLadderResponseSchema.parse({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      route: buildStudioRouteCardFromIndexRow(row, observed),
      segments: [],
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: row.summary === null ? "unavailable" : "partial_public_monthly_only",
        confidence: row.summary === null ? "low" : "medium",
        caveats: [
          "No segment ladder is available for this route in the current rich route artifact set.",
          ...routeIndexCaveats(row),
        ],
      },
    }),
  };
}

export async function buildStudioRoutesResponse(
  env: StudioReadEnv,
): Promise<BuildStudioRoutesResponseResult> {
  // D1-backed listing covers all release routes. Falls back to the R2 projection only when
  // env.DB is unset (dev/test envs); production sets DB so this fallback never fires there.
  const baselineMonth = env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH;
  if (env.DB !== undefined && baselineMonth !== undefined) {
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
  const baselineMonth = env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH;
  if (env.DB === undefined) {
    return {
      ok: false,
      response: errorResponse(503, "D1 DB binding is required for Studio route history."),
    };
  }
  if (baselineMonth === undefined) {
    return {
      ok: false,
      response: errorResponse(503, "BASELINE_MONTH or LAST_BUILT_SPEED_MONTH is required."),
    };
  }

  const row = await findStudioRouteIndexSourceRow({ env, slug, baselineMonth });
  if (row === null) {
    return { ok: false, response: errorResponse(404, "Studio route history was not found.") };
  }

  const [points, observed] = await Promise.all([
    listRouteMonthTrends(createD1ServingDb(env.DB), row.routeId),
    findObservedReliabilityRow({ env, baselineMonth, routeId: row.routeId }),
  ]);
  const route = buildStudioRouteCardFromIndexRow(row, observed);
  const coverage = buildRouteHistoryCoverage(points);
  const speedCaveat =
    env.LAST_BUILT_SPEED_MONTH === undefined
      ? "Average speed is present only for months with public MTA route segment speed rows."
      : `Average speed is present only for months with public MTA route segment speed rows through ${env.LAST_BUILT_SPEED_MONTH}.`;

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

export async function buildStudioRouteSpeedHistoryResponse(
  env: StudioReadEnv,
  slug: string,
): Promise<BuildStudioRouteSpeedHistoryResponseResult> {
  if (env.ARTIFACTS === undefined) {
    return {
      ok: false,
      response: errorResponse(503, "ARTIFACTS R2 binding is required for route speed history."),
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
      response: errorResponse(502, `Studio route speed history is not valid JSON: ${key}.`),
    };
  }

  const parsed = StudioRouteSpeedHistoryResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      response: errorResponse(
        502,
        `Studio route speed history failed contract validation: ${key}.`,
      ),
    };
  }
  if (parsed.data.routeSlug !== slug) {
    return {
      ok: false,
      response: errorResponse(502, `Studio route speed history slug mismatch: ${key}.`),
    };
  }

  return { ok: true, speedHistory: parsed.data };
}

function jsonObject(
  value: unknown,
): (Record<string, unknown> & { artifactKind?: unknown; routeId?: unknown }) | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function buildStudioRouteTimelineResponse(
  env: StudioReadEnv,
  slug: string,
): Promise<BuildStudioRouteTimelineResponseResult> {
  const baselineMonth = env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH;
  if (env.DB === undefined) {
    return {
      ok: false,
      response: errorResponse(503, "D1 DB binding is required for Studio route timeline."),
    };
  }
  if (env.ARTIFACTS === undefined) {
    return {
      ok: false,
      response: errorResponse(503, "ARTIFACTS R2 binding is required for Studio route timeline."),
    };
  }
  if (baselineMonth === undefined) {
    return {
      ok: false,
      response: errorResponse(503, "BASELINE_MONTH or LAST_BUILT_SPEED_MONTH is required."),
    };
  }

  const row = await findStudioRouteIndexSourceRow({ env, slug, baselineMonth });
  if (row === null) {
    return { ok: false, response: errorResponse(404, "Studio route timeline was not found.") };
  }

  const timelineIndex = await getRouteTimelineIndex(
    createD1ServingDb(env.DB),
    row.routeId,
    baselineMonth,
  );
  if (timelineIndex === null) {
    return { ok: false, response: errorResponse(404, "Studio route timeline was not found.") };
  }

  const object = await env.ARTIFACTS.get(timelineIndex.bundleArtifactKey);
  if (object === null) {
    return {
      ok: false,
      response: errorResponse(
        404,
        `Studio route timeline bundle was not found: ${timelineIndex.bundleArtifactKey}.`,
      ),
    };
  }

  let payload: unknown;
  try {
    payload = await object.json();
  } catch {
    return {
      ok: false,
      response: errorResponse(
        502,
        `Studio route timeline bundle is not valid JSON: ${timelineIndex.bundleArtifactKey}.`,
      ),
    };
  }

  const record = jsonObject(payload);
  if (
    record === null ||
    record.artifactKind !== "bp.tier2_route_timeline_bundle.v1" ||
    record.routeId !== row.routeId
  ) {
    return {
      ok: false,
      response: errorResponse(
        502,
        `Studio route timeline bundle failed contract validation: ${timelineIndex.bundleArtifactKey}.`,
      ),
    };
  }

  return { ok: true, timeline: payload };
}

function textIncludesAnyTerm(text: string, terms: readonly string[]): boolean {
  const normalizedText = text.toLowerCase();
  return terms.length === 0 || terms.some((term) => normalizedText.includes(term));
}

function searchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
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

function supportLevelCount(
  routes: readonly StudioRouteIndex2Row[],
  supportLevel: StudioRouteIndex2Row["supportLevel"],
): number {
  return routes.filter((route) => route.supportLevel === supportLevel).length;
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
  tier2Views: Tier2MaterializedViewsArtifact | null;
  modelProjection: ModelArtifactServingProjection | null;
}): StudioSourceMonthState[] {
  const tier2EvidenceState: StudioSourceMonthState = {
    sourceId: "tier2_evidence_catalog",
    label: "Tier 2 evidence catalog",
    month: input.routeIndex.baselineMonth,
    status: input.tier2Views === null ? "derived_not_built" : "available",
    rowCount:
      input.tier2Views === null
        ? null
        : input.tier2Views.routeEvidenceBundles.reduce(
            (sum, bundle) => sum + bundle.surfaceCount,
            0,
          ),
    routeCount: input.tier2Views?.routeEvidenceBundles.length ?? null,
    grain: input.tier2Views === null ? null : "route_evidence_bundle",
    reason:
      input.tier2Views === null
        ? "Tier 2 route evidence materialized-view artifact is not published to R2."
        : "Tier 2 vocabulary-normalized route evidence bundles are published to R2.",
    producerCommand: "docs tier2 vocab-materialized-views",
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
    const withTier2 = rows.some((row) => row.sourceId === "tier2_evidence_catalog")
      ? rows.map((row) => (row.sourceId === "tier2_evidence_catalog" ? tier2EvidenceState : row))
      : [...rows, tier2EvidenceState];
    return withTier2.some((row) => row.sourceId === "detector_model_artifact_status")
      ? withTier2.map((row) =>
          row.sourceId === "detector_model_artifact_status" ? modelArtifactState : row,
        )
      : [...withTier2, modelArtifactState];
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
      ...tier2EvidenceState,
    },
    {
      ...modelArtifactState,
    },
  ];
}

function buildSnapshot2(input: {
  routeIndex: StudioRouteIndex2Response;
  sourceMonthCoverage: readonly D1SourceMonthCoverage[];
  findingsCount: number;
  briefsCount: number;
  lastBuiltSpeedMonth: string | undefined;
  tier2Views: Tier2MaterializedViewsArtifact | null;
  modelProjection: ModelArtifactServingProjection | null;
}): StudioSnapshot2 {
  const { routes } = input.routeIndex;
  const artifactReadyRouteCount = routes.filter(
    (route) => route.supportLevel === "artifact_ready" || route.supportLevel === "evidence_ready",
  ).length;
  const evidenceReadyRouteCount = supportLevelCount(routes, "evidence_ready");
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
          ? routes.some((route) => route.surfaceFlags.speedHistory === "partial")
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
      summaryReadyRouteCount: supportLevelCount(routes, "summary_ready") + artifactReadyRouteCount,
      artifactReadyRouteCount,
      evidenceReadyRouteCount,
    },
    sourceMonths: sourceMonthStates({
      routeIndex: input.routeIndex,
      sourceMonthCoverage: input.sourceMonthCoverage,
      lastBuiltSpeedMonth: input.lastBuiltSpeedMonth,
      tier2Views: input.tier2Views,
      modelProjection: input.modelProjection,
    }),
    counts: {
      routes: routes.length,
      routeDetails: artifactReadyRouteCount,
      routeHistoryRows,
      routeIndexRows: routes.length,
      routeSpeedHistoryCoverageRows,
      sourceMonthCoverageRows: input.sourceMonthCoverage.length,
      findings: input.findingsCount,
      briefs: input.briefsCount,
    },
    caveats: [
      "Snapshot 2.0 is an addressability and coverage manifest, not the final route-page payload model.",
      "Route support levels describe which public surfaces are present; sparse catalog routes should still resolve to route shells.",
      input.modelProjection === null
        ? "Detector model status is not yet published as a safe serving projection."
        : "Detector model status is published as a compact R2 projection; raw model rows remain internal.",
    ],
    projections,
  };
}

async function buildStudioSnapshotResponse(env: StudioReadEnv): Promise<Response> {
  const [routesResult, findings, briefs, methods, docs, tier2Views, modelProjection] =
    await Promise.all([
      buildStudioRoutesResponse(env),
      loadStudioProjection(env, "findings.json", StudioFindingsResponseSchema),
      loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema),
      loadStudioProjection(env, "methods.json", StudioMethodsResponseSchema),
      loadStudioProjection(env, "docs.json", StudioDocsResponseSchema),
      loadTier2MaterializedViews(env),
      loadModelArtifactServingProjection(env),
    ]);
  if (!routesResult.ok) return routesResult.response;
  if (findings instanceof Response) return findings;
  if (briefs instanceof Response) return briefs;
  if (methods instanceof Response) return methods;
  if (docs instanceof Response) return docs;

  const generatedAt = new Date().toISOString();
  const routesAreD1Backed =
    env.DB !== undefined && (env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH) !== undefined;
  const routeIndex2Result = routesAreD1Backed ? await buildStudioRouteIndex2Response(env) : null;
  const sourceMonthCoverage =
    routeIndex2Result?.ok === true && env.DB !== undefined
      ? await listSourceMonthCoverage(createD1ServingDb(env.DB))
      : [];
  const snapshot2 =
    routeIndex2Result?.ok === true
      ? buildSnapshot2({
          routeIndex: routeIndex2Result.routeIndex,
          sourceMonthCoverage,
          findingsCount: findings.findings.length,
          briefsCount: briefs.briefs.length,
          lastBuiltSpeedMonth: env.LAST_BUILT_SPEED_MONTH,
          tier2Views,
          modelProjection,
        })
      : undefined;
  const projections: StudioSnapshotProjection[] = [
    {
      resource: "routes",
      path: projectionPath(env, "routes.json", { d1Backed: routesAreD1Backed }),
      itemCount: routesResult.routes.length,
      generatedAt: routesResult.generatedAt,
    },
    {
      resource: "findings",
      path: projectionPath(env, "findings.json"),
      itemCount: findings.findings.length,
      generatedAt: findings.generatedAt,
    },
    {
      resource: "briefs",
      path: projectionPath(env, "briefs.json"),
      itemCount: briefs.briefs.length,
      generatedAt: briefs.generatedAt,
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
      itemCount: docs.sections.length + docs.endpoints.length,
      generatedAt: docs.generatedAt,
    },
  ];
  const prefix = studioProjectionPrefix(env);

  return studioJsonResponse(
    StudioSnapshotResponseSchema.parse({
      schemaVersion: 1,
      generatedAt,
      releaseId: releaseIdForPrefix(prefix),
      projectionPrefix: prefix,
      releaseKey: studioReleaseKey(env),
      baselineMonth: env.BASELINE_MONTH ?? null,
      lastBuiltSpeedMonth: env.LAST_BUILT_SPEED_MONTH ?? null,
      counts: {
        routes: routesResult.routes.length,
        findings: findings.findings.length,
        briefs: briefs.briefs.length,
        methods: methods.datasets.length,
        docsSections: docs.sections.length,
        docsEndpoints: docs.endpoints.length,
      },
      projections,
      quality: routesResult.quality,
      ...(snapshot2 === undefined ? {} : { v2: snapshot2 }),
    }),
    env,
  );
}

export async function handleStudioReadRequest<TEnv extends StudioReadEnv>(
  request: Request,
  url: URL,
  env: TEnv,
  hooks: StudioReadHooks<TEnv> = {},
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

  if (url.pathname === "/api/v1/studio/search") {
    const [routesResult, findings, briefs, segments, methods, docs] = await Promise.all([
      buildStudioRoutesResponse(env),
      loadStudioProjection(env, "findings.json", StudioFindingsResponseSchema),
      loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema),
      loadStudioProjection(env, "segments.json", StudioSegmentsResponseSchema),
      loadStudioProjection(env, "methods.json", StudioMethodsResponseSchema),
      loadStudioProjection(env, "docs.json", StudioDocsResponseSchema),
    ]);
    if (!routesResult.ok) return routesResult.response;
    if (findings instanceof Response) return findings;
    if (briefs instanceof Response) return briefs;
    // Segments, methods, and docs enrich the result groups but are not load-bearing
    // for search: a missing projection degrades to an empty group rather than a 5xx.
    const segmentList = segments instanceof Response ? [] : segments.segments;
    const datasets = methods instanceof Response ? [] : methods.datasets;
    const docSections = docs instanceof Response ? [] : docs.sections;

    const query = url.searchParams.get("q")?.trim() ?? "";
    const terms = searchTerms(query);
    const routeBySlug = new Map(routesResult.routes.map((route) => [route.slug, route]));
    const matchedRoutes = routesResult.routes.filter((route) =>
      textIncludesAnyTerm(
        [
          route.slug,
          route.routeId,
          route.label,
          route.corridor,
          route.borough,
          route.reliability,
          route.diagnosis,
          route.sbs ? "sbs select bus service" : "local",
        ].join(" "),
        terms,
      ),
    );
    const matchedSegments = segmentList.flatMap((segment) => {
      const route = routeBySlug.get(segment.routeSlug);
      if (route === undefined) return [];
      const matches = textIncludesAnyTerm(
        [
          segment.from,
          segment.to,
          segment.direction,
          segment.routeSlug,
          route.label,
          route.corridor,
          route.borough,
        ].join(" "),
        terms,
      );
      return matches ? [{ segment, route }] : [];
    });
    const matchedFindings = findings.findings.filter(({ finding }) =>
      textIncludesAnyTerm(
        [
          finding.id,
          finding.category,
          finding.title,
          finding.body,
          finding.metric,
          finding.routeSlug,
        ].join(" "),
        terms,
      ),
    );
    const matchedBriefs = briefs.briefs.filter(({ brief }) =>
      textIncludesAnyTerm(
        [brief.id, brief.title, brief.summary, brief.status, brief.routeSlug, ...brief.claims].join(
          " ",
        ),
        terms,
      ),
    );
    const docNotes = docSections.flatMap((section, index) =>
      textIncludesAnyTerm([section.title, ...section.body].join(" "), terms)
        ? [
            {
              id: `docs:${index}`,
              title: section.title,
              where: "Methods / Notes",
              preview: section.body[0] ?? "",
              href: "/docs",
            },
          ]
        : [],
    );
    const datasetNotes = datasets.flatMap((dataset) =>
      textIncludesAnyTerm(
        [dataset.name, dataset.publisher, dataset.grain, dataset.cadence].join(" "),
        terms,
      )
        ? [
            {
              id: `dataset:${dataset.name}`,
              title: dataset.name,
              where: "Methods / Datasets",
              preview: `${dataset.publisher} · ${dataset.grain} · ${dataset.cadence}`,
              href: "/methods",
            },
          ]
        : [],
    );

    return studioJsonResponse(
      StudioSearchResponseSchema.parse({
        schemaVersion: 1,
        generatedAt: routesResult.generatedAt,
        query,
        routes: matchedRoutes,
        segments: matchedSegments,
        findings: matchedFindings,
        briefs: matchedBriefs,
        notes: [...docNotes, ...datasetNotes],
        quality: routesResult.quality,
      }),
      env,
    );
  }

  const routeMatch = url.pathname.match(/^\/api\/v1\/studio\/routes\/([^/]+)$/);
  if (routeMatch) {
    const slug = decodeURIComponent(routeMatch[1] ?? "");
    if (env.DB !== undefined && (env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH) !== undefined) {
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
    return route instanceof Response ? route : studioJsonResponse(route, env);
  }

  const historyMatch = url.pathname.match(/^\/api\/v1\/studio\/routes\/([^/]+)\/history$/);
  if (historyMatch) {
    const slug = decodeURIComponent(historyMatch[1] ?? "");
    const result = await buildStudioRouteHistoryResponse(env, slug);
    return result.ok ? studioJsonResponse(result.history, env) : result.response;
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

  const ladderMatch = url.pathname.match(/^\/api\/v1\/studio\/routes\/([^/]+)\/ladder$/);
  if (ladderMatch) {
    const slug = decodeURIComponent(ladderMatch[1] ?? "");
    if (env.DB !== undefined && (env.BASELINE_MONTH ?? env.LAST_BUILT_SPEED_MONTH) !== undefined) {
      const result = await buildStudioRouteLadderResponseFromD1(env, slug);
      return result.ok ? studioJsonResponse(result.ladder, env) : result.response;
    }

    const routes = await loadStudioProjection(env, "routes.json", StudioRoutesResponseSchema);
    if (routes instanceof Response) return routes;
    if (getStudioRoute(routes, slug) === undefined) {
      return errorResponse(404, "Studio route ladder was not found.");
    }

    const ladder = await loadStudioProjection(
      env,
      `routes/${slug}/ladder.json`,
      StudioRouteLadderResponseSchema,
    );
    return ladder instanceof Response ? ladder : studioJsonResponse(ladder, env);
  }

  if (url.pathname === "/api/v1/studio/compare") {
    const routes = await loadStudioProjection(env, "routes.json", StudioRoutesResponseSchema);
    if (routes instanceof Response) return routes;

    const routeA = getStudioRoute(routes, url.searchParams.get("a") ?? "");
    const routeB = getStudioRoute(routes, url.searchParams.get("b") ?? "");
    if (routeA === undefined || routeB === undefined) {
      return errorResponse(404, "One or more Studio comparison routes were not found.");
    }

    const release: StudioReleasePayload = {
      schemaVersion: 1,
      generatedAt: routes.generatedAt,
      quality: routes.quality,
      routes: routes.routes,
      segments: [],
      routeArtifacts: [],
      findings: [],
      briefs: [],
      versions: [],
      comments: [],
      methods: [],
      docsSections: [],
      docsEndpoints: [],
    };

    return studioJsonResponse(
      StudioCompareResponseSchema.parse(buildStudioCompareProjection(release, routeA, routeB)),
      env,
    );
  }

  if (url.pathname === "/api/v1/studio/findings") {
    const findings = await loadStudioProjection(env, "findings.json", StudioFindingsResponseSchema);
    return findings instanceof Response ? findings : studioJsonResponse(findings, env);
  }

  const findingMatch = url.pathname.match(/^\/api\/v1\/studio\/findings\/([^/]+)$/);
  if (findingMatch) {
    const findingId = decodeURIComponent(findingMatch[1] ?? "");
    const findings = await loadStudioProjection(env, "findings.json", StudioFindingsResponseSchema);
    if (findings instanceof Response) return findings;
    if (!findings.findings.some(({ finding }) => finding.id === findingId)) {
      return errorResponse(404, "Studio finding was not found.");
    }

    const finding = await loadStudioProjection(
      env,
      `findings/${findingId}/index.json`,
      StudioFindingResponseSchema,
    );
    return finding instanceof Response ? finding : studioJsonResponse(finding, env);
  }

  if (url.pathname === "/api/v1/studio/briefs") {
    const briefs = await loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema);
    return briefs instanceof Response ? briefs : studioJsonResponse(briefs, env);
  }

  const briefEvidenceMatch = url.pathname.match(/^\/api\/v1\/studio\/briefs\/([^/]+)\/evidence$/);
  if (briefEvidenceMatch) {
    const briefId = decodeURIComponent(briefEvidenceMatch[1] ?? "");
    const briefs = await loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema);
    if (briefs instanceof Response) return briefs;
    if (!briefs.briefs.some(({ brief }) => brief.id === briefId)) {
      return errorResponse(404, "Studio brief was not found.");
    }

    const evidence = await loadStudioProjection(
      env,
      `briefs/${briefId}/evidence.json`,
      StudioBriefEvidenceResponseSchema,
    );
    return evidence instanceof Response ? evidence : studioJsonResponse(evidence, env);
  }

  const briefHistoryMatch = url.pathname.match(/^\/api\/v1\/studio\/briefs\/([^/]+)\/history$/);
  if (briefHistoryMatch) {
    const briefId = decodeURIComponent(briefHistoryMatch[1] ?? "");
    const briefs = await loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema);
    if (briefs instanceof Response) return briefs;
    if (!briefs.briefs.some(({ brief }) => brief.id === briefId)) {
      return errorResponse(404, "Studio brief was not found.");
    }

    const history = await loadStudioProjection(
      env,
      `briefs/${briefId}/history.json`,
      StudioBriefHistoryResponseSchema,
    );
    return history instanceof Response ? history : studioJsonResponse(history, env);
  }

  const briefMatch = url.pathname.match(/^\/api\/v1\/studio\/briefs\/([^/]+)$/);
  if (briefMatch) {
    const briefId = decodeURIComponent(briefMatch[1] ?? "");
    const brief = await loadStudioBriefProjection(env, briefId);
    if (!brief.ok) {
      if (brief.response.status === 404 && hooks.loadDraftOnlyBriefProjection !== undefined) {
        const draftOnly = await hooks.loadDraftOnlyBriefProjection(request, env, briefId);
        if (draftOnly !== null) {
          return draftOnly instanceof Response ? draftOnly : studioJsonResponse(draftOnly, env);
        }
      }
      return brief.response;
    }
    const projection =
      hooks.overlayStudioBriefDraft === undefined
        ? brief.data
        : await hooks.overlayStudioBriefDraft(request, env, brief.data);
    return studioJsonResponse(projection, env);
  }

  if (url.pathname === "/api/v1/studio/methods") {
    const methods = await loadStudioProjection(env, "methods.json", StudioMethodsResponseSchema);
    return methods instanceof Response ? methods : studioJsonResponse(methods, env);
  }

  if (url.pathname === "/api/v1/studio/docs") {
    const docs = await loadStudioProjection(env, "docs.json", StudioDocsResponseSchema);
    return docs instanceof Response ? docs : studioJsonResponse(docs, env);
  }

  return errorResponse(404, "Studio API endpoint was not found.");
}
