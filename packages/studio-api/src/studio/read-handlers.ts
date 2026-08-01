import {
  createD1ServingDb,
  type RouteMonthTrend as D1RouteMonthTrend,
  type RouteObservedReliabilitySummary as D1RouteObservedReliabilitySummary,
  type SourceMonthCoverage as D1SourceMonthCoverage,
  findEarliestSpeedTrendMonth,
  findExactRouteIdentityRelease,
  findLatestExactRouteIdentityRelease,
  findLatestPublishedStudioServingRelease,
  findLatestSpeedTrendMonth,
  findRouteEquityContext,
  listPublicSnapshotSourceMonthCoverage,
  listRouteMonthTrends,
  listRouteObservedReliabilitySummaries,
} from "@bp/db/d1";
import {
  buildRouteInsightsFromDetectorReadiness,
  type DetectorReadinessServingManifestForInsights,
  DetectorReadinessServingManifestForInsightsSchema,
  emptyStudioRouteEvidenceBundle,
  freshnessForDataAsOf,
  freshnessReferenceMonth,
  getStudioRoute,
  type RouteCapabilityManifestForIndex,
  RouteCapabilityManifestForIndexSchema,
  type RouteDossierSummaryForDetail,
  RouteDossierSummaryForDetailSchema,
  routeDossierSummaryKey,
  STUDIO_ROUTE_CAPABILITY_MANIFEST_KEY,
  STUDIO_ROUTE_EVIDENCE_INDEX_KEY,
  type StudioRouteCapability,
  type StudioRouteEvidenceBundle,
  StudioRouteEvidenceBundleSchema,
  type StudioRouteEvidenceBundleV2,
  type StudioRouteEvidenceIndex,
  type StudioRouteEvidenceIndexRouteV2,
  StudioRouteEvidenceIndexSchema,
  type StudioRouteEvidenceIndexV2,
  studioRouteEvidenceBundleKey,
} from "@bp/domain/studio";
import {
  type StudioDocsResponse,
  StudioDocsResponseSchema,
  type StudioMethodsResponse,
  StudioMethodsResponseSchema,
} from "@bp/domain/studio/docs";
import {
  type StudioRoute,
  type StudioRouteDetailResponse,
  StudioRouteDetailResponseSchema,
  type StudioRouteEquityContext,
  type StudioRouteHistoryResponse,
  StudioRouteHistoryResponseSchema,
  type StudioRouteHourlyProfileResponse,
  StudioRouteHourlyProfileResponseSchema,
  type StudioRouteSection,
  type StudioRouteSectionsResponse,
  StudioRouteSectionsResponseSchema,
  type StudioRouteSpeedHistoryResponse,
  StudioRouteSpeedHistoryResponseSchema,
  type StudioRoutesResponse,
  StudioRoutesResponseSchema,
  type StudioSegment,
} from "@bp/domain/studio/routes";
import { CoverageWindowSchema, releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import {
  STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY,
  STUDIO_ROUTE_DETECTOR_READINESS_MANIFEST_KEY,
  type StudioRouteIndex2Response,
  StudioRouteIndex2ResponseSchema,
  type StudioRouteIndex2Row,
  type StudioRouteIndex3Response,
  StudioRouteIndex3ResponseSchema,
  type StudioSnapshot2,
  type StudioSnapshot2ProjectionRef,
  type StudioSnapshotProjection,
  type StudioSnapshotResponse,
  type StudioSourceMonthState,
} from "@bp/domain/studio/snapshots";
import { Result, Schema } from "effect";
import { loadReleaseArtifact } from "../artifact-resolver.js";
import { studioOpenApiDocument } from "../contracts/openapi.js";
import type { StudioApiRouteId } from "../contracts/registry.js";
import { matchRouteSpec } from "../contracts/routing.js";
import type { StudioApiEnv } from "../env.js";
import { errorResponse } from "../http/errors.js";
import {
  ARTIFACT_NOT_AVAILABLE_MESSAGE,
  SERVICE_DEPENDENCY_NOT_CONFIGURED_MESSAGE,
} from "../http/messages.js";
import {
  decodeSchemaEitherPreserve,
  decodeSchemaEitherStrict,
  decodeSchemaStrict,
  schemaErrorIssues,
} from "../schema-decode.js";
import { servingArtifactCorruptionOrLegacyAbsence } from "../serving-decode-policy.js";
import { pointedReleaseIdentity } from "../serving-request-context.js";
import {
  loadStudioProjection,
  maybeLoadPublishedRouteInterventions,
  maybeLoadStudioRouteDetailProjection,
  studioJsonResponse,
  studioProjectionKey,
  studioProjectionPrefix,
  studioReleaseKey,
} from "./projections.js";
import {
  assertStudioRouteEvidenceV2ServingClosure,
  type ExactD1RouteEvidenceIdentity,
} from "./route-evidence-integrity.js";
import {
  buildStudioRouteCardFromIndexRow,
  buildStudioRouteIndex2Row,
  buildStudioRouteIndex3Row,
  exactRoutePresentationForIndexRow,
  FALLBACK_ROUTE_CAPABILITY,
  hasRouteTimelineBundle,
  listNormalizedStudioRouteIndexSourceRows,
  type NormalizedStudioRouteIndexSourceRow,
  routeIdToStudioSlug,
  routeIndexCaveats,
  SUPPORT_LEVEL_BY_OVERALL_STATE,
  speedPercentilesForRouteIndexRows,
} from "./route-index-read-model.js";
import {
  buildDataCoverageRows,
  buildEvidenceReadyRows,
  buildNeedsAttentionRows,
  buildTreatmentGapRows,
  buildWorseningFastRows,
  routeEvidenceFactCount,
  section,
} from "./route-sections-read-model.js";

// Public release identity and covered months resolve internally from D1, never from env.
export type StudioReadEnv = Pick<
  StudioApiEnv,
  | "ARTIFACTS"
  | "DB"
  | "PLAN097_PREVIOUS_RELEASE_ID"
  | "PLAN097_RECOVERY_ENABLED"
  | "SERVING_POINTER_ENABLED"
  | "SERVING_RELEASE_CONTEXT"
  | "SERVING_UNSCOPED_DB"
  | "STUDIO_RELEASE_KEY"
>;

const OPENAPI_DOC_METHODS = ["get", "post", "put", "patch", "delete"] as const;
const SNAPSHOT_2_OMITTED_CAVEAT =
  "Snapshot 2.0 manifest failed contract validation and is temporarily omitted.";

const SNAPSHOT_DEGRADE_POLICY = {
  routes: { required: true, caveat: null },
  methods: {
    required: false,
    caveat: "Methods projection is temporarily unavailable; dataset counts are omitted.",
  },
  docs: {
    required: false,
    caveat: "Docs projection is temporarily unavailable; documentation sections are omitted.",
  },
  routeEvidenceIndex: {
    required: false,
    caveat: "Route evidence index is temporarily unavailable and is omitted from Snapshot 2.0.",
  },
  modelProjection: {
    required: false,
    caveat:
      "Detector model projection is temporarily unavailable and is omitted from Snapshot 2.0.",
  },
  snapshot2: { required: false, caveat: SNAPSHOT_2_OMITTED_CAVEAT },
} as const;

function dependencyNotConfiguredResponse(dependency: string, context: string): Response {
  console.error("Service dependency is not configured.", { context, dependency });
  return errorResponse(503, SERVICE_DEPENDENCY_NOT_CONFIGURED_MESSAGE);
}

function artifactNotAvailableResponse(status: number, context: string, key: string): Response {
  console.error(context, { key });
  return errorResponse(status, ARTIFACT_NOT_AVAILABLE_MESSAGE);
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

function snapshotQualityWithCaveats(
  quality: StudioRoutesResponse["quality"],
  caveats: readonly string[],
): StudioRoutesResponse["quality"] {
  return caveats.reduce(snapshotQualityWithCaveat, quality);
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
  return decodeSchemaStrict(StudioDocsResponseSchema, {
    ...docs,
    endpoints: studioDocsEndpointsFromOpenApi(),
  });
}

type BuildStudioRoutesResponseResult =
  | {
      ok: true;
      routes: StudioRoute[];
      generatedAt: string;
      releaseId: StudioRoutesResponse["releaseId"];
      publishedAt: StudioRoutesResponse["publishedAt"];
      coverage: StudioRoutesResponse["coverage"];
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

type BuildStudioRouteIndex2ResponseResult =
  | { ok: true; routeIndex: StudioRouteIndex2Response }
  | { ok: false; response: Response };

type BuildStudioRouteIndex3ResponseResult =
  | { ok: true; routeIndex: StudioRouteIndex3Response }
  | { ok: false; response: Response };

type BuildStudioRouteSectionsResponseResult =
  | { ok: true; routeSections: StudioRouteSectionsResponse }
  | { ok: false; response: Response };

const IsoMonthStringSchema = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/));

const ModelArtifactServingProjectionSchema = Schema.Struct({
  artifactKind: Schema.Literal("model_artifact_serving_projection"),
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  releaseId: Schema.String,
  publishedAt: Schema.String,
  coverage: CoverageWindowSchema,
  historyWindow: Schema.Struct({
    startMonth: IsoMonthStringSchema,
    endMonth: IsoMonthStringSchema,
  }),
  summary: Schema.Struct({
    modelCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    availableModelCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    missingModelCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    detectorConsumerCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
  models: Schema.Array(
    Schema.Struct({
      modelId: Schema.String.check(Schema.isMinLength(1)),
      status: Schema.Literals(["available", "missing"]),
      panelId: Schema.NullOr(Schema.String),
      release: Schema.NullOr(
        Schema.Struct({
          releaseId: Schema.String,
          publishedAt: Schema.String,
          coverage: CoverageWindowSchema,
        }),
      ),
      modeledReleaseRowCount: Schema.Number.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0),
      ),
      routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      segmentCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
      detectorConsumers: Schema.Array(Schema.String),
      limitations: Schema.Array(Schema.String),
    }),
  ),
});

type ModelArtifactServingProjection = typeof ModelArtifactServingProjectionSchema.Type;

const RouteSpeedSpineArtifactForSegmentsSchema = Schema.Struct({
  artifactKind: Schema.String,
  routeId: Schema.String,
  routeSlug: Schema.String,
  segments: Schema.Array(
    Schema.Struct({
      segmentId: Schema.String,
      direction: Schema.String,
      displayOrder: Schema.Number,
      label: Schema.String,
      averageRoadDistanceMiles: Schema.optionalKey(Schema.NullOr(Schema.Number)),
      averageSpeedMph: Schema.optionalKey(Schema.NullOr(Schema.Number)),
      raw: Schema.Struct({
        sourceStopPairs: Schema.Array(
          Schema.Struct({
            fromStopId: Schema.String,
            fromStopName: Schema.String,
            toStopId: Schema.String,
            toStopName: Schema.String,
            stopOrders: Schema.Array(Schema.Number),
          }),
        ),
      }),
    }),
  ),
});

type RouteSpeedSpineArtifactForSegments = typeof RouteSpeedSpineArtifactForSegmentsSchema.Type;

type RouteSpeedSpineSegmentForSegments = RouteSpeedSpineArtifactForSegments["segments"][number];

async function listStudioRouteCardsFromD1(
  env: Pick<StudioReadEnv, "DB">,
  month: string,
  limit?: number,
): Promise<StudioRoute[]> {
  if (env.DB === undefined) return [];
  const db = createD1ServingDb(env.DB);
  const [rows, observed] = await Promise.all([
    listNormalizedStudioRouteIndexSourceRows(db, month),
    listRouteObservedReliabilitySummaries(db, month),
  ]);
  const observedByRoute = new Map(observed.map((row) => [row.routeId, row]));
  const speedPercentileByRoute = speedPercentilesForRouteIndexRows(rows);
  const routes = rows
    .toSorted((left, right) => {
      return (
        left.routeScoreSort - right.routeScoreSort || left.routeId.localeCompare(right.routeId)
      );
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

/** The single internal resolver for the latest published serving release. */
type ResolvedServingRelease = {
  releaseId: string;
  publishedAt: string;
  coverage: StudioRoutesResponse["coverage"];
  latestSpeedMonth: string | null;
};

async function resolveServingRelease(env: StudioReadEnv): Promise<ResolvedServingRelease | null> {
  if (env.DB === undefined) return null;
  const db = createD1ServingDb(env.DB);
  const pointed = pointedReleaseIdentity(env);
  if (pointed !== null) {
    return {
      ...pointed,
      latestSpeedMonth: await findLatestSpeedTrendMonth(db),
    };
  }
  const [publishedRelease, coverageStart, latestSpeedMonth] = await Promise.all([
    findLatestPublishedStudioServingRelease(db),
    findEarliestSpeedTrendMonth(db),
    findLatestSpeedTrendMonth(db),
  ]);
  if (publishedRelease === null) return null;
  try {
    return {
      releaseId: releaseIdFromPublishedAt(publishedRelease.publishedAt),
      publishedAt: publishedRelease.publishedAt,
      coverage: decodeSchemaStrict(CoverageWindowSchema, {
        start: coverageStart,
        end: publishedRelease.end,
      }),
      latestSpeedMonth,
    };
  } catch {
    return null;
  }
}

const NO_PUBLISHED_SERVING_DATA_MESSAGE = "No published serving data is available.";
const NO_EXACT_ROUTE_IDENTITY_MESSAGE = "Exact route identity serving data is unavailable.";

type ExactRouteRowsResult =
  | { ok: true; rows: NormalizedStudioRouteIndexSourceRow[] }
  | { ok: false; response: Response };

async function resolveExactRouteRows(
  env: StudioReadEnv,
  release: ResolvedServingRelease,
): Promise<ExactRouteRowsResult> {
  if (env.DB === undefined) {
    return {
      ok: false,
      response: dependencyNotConfiguredResponse("DB", "Exact Studio route identity"),
    };
  }
  const db = createD1ServingDb(env.DB);
  const pointed = env.SERVING_RELEASE_CONTEXT !== undefined;
  const [rows, identityRelease] = await Promise.all([
    listNormalizedStudioRouteIndexSourceRows(db, release.coverage.end),
    pointed
      ? findLatestExactRouteIdentityRelease(db)
      : findExactRouteIdentityRelease(db, release.releaseId),
  ]);
  if (identityRelease === null) {
    return { ok: false, response: errorResponse(503, NO_EXACT_ROUTE_IDENTITY_MESSAGE) };
  }
  const exactRows = rows.filter((row) => row.tripTypeCatalogAvailable);
  const routeTypeCount = exactRows.reduce((sum, row) => sum + row.routeTypes.length, 0);
  const tripTypeCount = exactRows.reduce((sum, row) => sum + row.tripTypes.length, 0);
  const sha256Pattern = /^[0-9a-f]{64}$/u;
  const releaseMatches =
    (pointed
      ? releaseIdFromPublishedAt(identityRelease.publishedAt) === identityRelease.releaseId
      : identityRelease.publishedAt === release.publishedAt) &&
    identityRelease.coverageStart === release.coverage.start &&
    identityRelease.coverageEnd === release.coverage.end;
  const countsMatch =
    exactRows.length === identityRelease.exactRouteCount &&
    routeTypeCount === identityRelease.routeTypeCount &&
    tripTypeCount === identityRelease.tripTypeCount;
  const hashesValid = [
    identityRelease.sourceManifestSha256,
    identityRelease.sourceRouteIdentitySha256,
    identityRelease.sourceCurrentBusRoutesSha256,
    identityRelease.sourceIndexSha256,
    identityRelease.catalogSnapshotSha256,
    identityRelease.projectionSha256,
  ].every((value) => sha256Pattern.test(value));
  try {
    if (
      !releaseMatches ||
      !countsMatch ||
      !hashesValid ||
      identityRelease.sourceWikiRelease.length === 0 ||
      exactRows.length === 0
    ) {
      throw new Error("registered release metadata or counts do not match D1 rows");
    }
    for (const row of exactRows) exactRoutePresentationForIndexRow(row);
  } catch (error) {
    console.error("Exact Studio route identity projection failed integrity checks.", {
      reason: error instanceof Error ? error.message : String(error),
      releaseId: release.releaseId,
      expected: {
        publishedAt: identityRelease.publishedAt,
        coverageStart: identityRelease.coverageStart,
        coverageEnd: identityRelease.coverageEnd,
        exactRouteCount: identityRelease.exactRouteCount,
        routeTypeCount: identityRelease.routeTypeCount,
        tripTypeCount: identityRelease.tripTypeCount,
      },
      actual: {
        publishedAt: release.publishedAt,
        coverageStart: release.coverage.start,
        coverageEnd: release.coverage.end,
        exactRouteCount: exactRows.length,
        routeTypeCount,
        tripTypeCount,
      },
    });
    return { ok: false, response: errorResponse(503, NO_EXACT_ROUTE_IDENTITY_MESSAGE) };
  }
  return { ok: true, rows: exactRows };
}

async function buildStudioRouteIndex2Response(
  env: StudioReadEnv,
): Promise<BuildStudioRouteIndex2ResponseResult> {
  if (env.DB === undefined) {
    return {
      ok: false,
      response: dependencyNotConfiguredResponse("DB", "Studio route index v2"),
    };
  }
  const release = await resolveServingRelease(env);
  if (release === null) {
    return { ok: false, response: errorResponse(503, NO_PUBLISHED_SERVING_DATA_MESSAGE) };
  }

  const generatedAt = new Date().toISOString();
  const [rows, capabilityManifest] = await Promise.all([
    listNormalizedStudioRouteIndexSourceRows(createD1ServingDb(env.DB), release.coverage.end),
    loadRouteCapabilityManifest(env),
  ]);
  const capabilityByRoute = routeCapabilityByRouteId(capabilityManifest);
  const routes = rows.map((row) =>
    buildStudioRouteIndex2Row({
      releaseId: release.releaseId,
      publishedAt: release.publishedAt,
      coverage: release.coverage,
      generatedAt,
      lastBuiltSpeedMonth: release.latestSpeedMonth ?? undefined,
      row,
      capability: capabilityByRoute.get(row.routeId) ?? FALLBACK_ROUTE_CAPABILITY,
    }),
  );

  return {
    ok: true,
    routeIndex: decodeSchemaStrict(StudioRouteIndex2ResponseSchema, {
      schemaVersion: 2,
      generatedAt,
      releaseId: release.releaseId,
      publishedAt: release.publishedAt,
      coverage: release.coverage,
      dataAsOf: release.latestSpeedMonth ?? release.coverage.end,
      routes,
      quality: {
        releaseLayer: "published_release",
        completenessStatus: routes.length === 0 ? "unavailable" : "partial_public_speed_only",
        confidence: routes.length === 0 ? "low" : "medium",
        caveats: [
          "Route index v2 is the legacy all-route addressability layer; use schema v3 for exact source-backed route identity.",
          "Sparse routes are valid Studio routes even when summary, detail, finding, or evidence surfaces are unavailable.",
        ],
      },
    }),
  };
}

async function buildStudioRouteIndex3Response(
  env: StudioReadEnv,
): Promise<BuildStudioRouteIndex3ResponseResult> {
  if (env.DB === undefined) {
    return {
      ok: false,
      response: dependencyNotConfiguredResponse("DB", "Studio route index v3"),
    };
  }
  const release = await resolveServingRelease(env);
  if (release === null) {
    return { ok: false, response: errorResponse(503, NO_PUBLISHED_SERVING_DATA_MESSAGE) };
  }

  const exactRows = await resolveExactRouteRows(env, release);
  if (!exactRows.ok) return exactRows;
  const generatedAt = new Date().toISOString();
  const capabilityManifest = await loadRouteCapabilityManifest(env);
  const capabilityByRoute = routeCapabilityByRouteId(capabilityManifest);
  const routes = exactRows.rows.map((row) =>
    buildStudioRouteIndex3Row({
      releaseId: release.releaseId,
      publishedAt: release.publishedAt,
      coverage: release.coverage,
      generatedAt,
      lastBuiltSpeedMonth: release.latestSpeedMonth ?? undefined,
      row,
      capability: capabilityByRoute.get(row.routeId) ?? FALLBACK_ROUTE_CAPABILITY,
    }),
  );

  return {
    ok: true,
    routeIndex: decodeSchemaStrict(StudioRouteIndex3ResponseSchema, {
      schemaVersion: 3,
      generatedAt,
      releaseId: release.releaseId,
      publishedAt: release.publishedAt,
      coverage: release.coverage,
      dataAsOf: release.latestSpeedMonth ?? release.coverage.end,
      routes,
      quality: {
        releaseLayer: "published_release",
        completenessStatus: routes.length === 0 ? "unavailable" : "partial_public_speed_only",
        confidence: routes.length === 0 ? "low" : "medium",
        caveats: [
          "Route index v3 carries exact source-backed route identity/presentation; rich route artifacts remain per-route surface flags.",
          "Sparse routes are valid Studio routes even when summary, detail, finding, or evidence surfaces are unavailable.",
        ],
      },
    }),
  };
}

function routeDetailSlugCandidates(routeId: string, requestedSlug: string): string[] {
  const candidates = [requestedSlug, routeIdToStudioSlug(routeId)];
  return [...new Set(candidates)];
}

function exactRouteEvidenceIdentity(
  row: NormalizedStudioRouteIndexSourceRow,
): ExactD1RouteEvidenceIdentity {
  return {
    slug: routeIdToStudioSlug(row.routeId),
    presentation: exactRoutePresentationForIndexRow(row),
  };
}

function exactRouteEvidenceIdentitiesFromD1(
  rows: readonly NormalizedStudioRouteIndexSourceRow[],
): ReadonlyMap<string, ExactD1RouteEvidenceIdentity> {
  return new Map(rows.map((row) => [row.routeId, exactRouteEvidenceIdentity(row)]));
}

function closedRouteEvidenceIndex(
  index: StudioRouteEvidenceIndex | null,
  expectedRoutes: () => ReadonlyMap<string, ExactD1RouteEvidenceIdentity>,
): StudioRouteEvidenceIndex | null {
  if (index === null || index.schemaVersion === 1) return index;
  try {
    assertStudioRouteEvidenceV2ServingClosure({
      kind: "index",
      index,
      expectedRoutes: expectedRoutes(),
    });
    return index;
  } catch (error) {
    console.error("Studio route evidence index failed exact D1 closure.", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function routeEvidenceIndexRowV2(
  index: StudioRouteEvidenceIndexV2,
  routeId: string,
): StudioRouteEvidenceIndexRouteV2 | null {
  return index.routes.find((row) => row.routeId === routeId) ?? null;
}

function isRouteEvidenceBundleV2(
  bundle: StudioRouteEvidenceBundle,
): bundle is StudioRouteEvidenceBundleV2 {
  return "schemaVersion" in bundle && bundle.schemaVersion === 2;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function routeEvidenceObjectPayload(object: R2ObjectBody): Promise<{
  byteLength: number;
  payload: unknown;
  sha256: string;
}> {
  const bytes = await object.arrayBuffer();
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return {
    byteLength: bytes.byteLength,
    payload: JSON.parse(text) as unknown,
    sha256: await sha256Hex(bytes),
  };
}

async function loadStudioRouteEvidenceIndex(
  env: StudioReadEnv,
): Promise<StudioRouteEvidenceIndex | null> {
  if (env.ARTIFACTS === undefined) return null;
  const object = await loadReleaseArtifact(env, STUDIO_ROUTE_EVIDENCE_INDEX_KEY);
  if (object === null) return null;

  let payload: unknown;
  try {
    payload = await object.json();
  } catch (error) {
    return servingArtifactCorruptionOrLegacyAbsence(
      env,
      {
        code: "active_artifact_json",
        endpoint: "studio-route-evidence-index",
        logicalArtifactId: STUDIO_ROUTE_EVIDENCE_INDEX_KEY,
        schemaId: "bp.studio.route_evidence_index",
      },
      error,
    );
  }

  const parsed = decodeSchemaEitherStrict(StudioRouteEvidenceIndexSchema, payload);
  return Result.isSuccess(parsed)
    ? parsed.success
    : servingArtifactCorruptionOrLegacyAbsence(env, {
        code: "active_artifact_schema",
        endpoint: "studio-route-evidence-index",
        logicalArtifactId: STUDIO_ROUTE_EVIDENCE_INDEX_KEY,
        schemaId: "bp.studio.route_evidence_index",
      });
}

async function loadModelArtifactServingProjection(
  env: StudioReadEnv,
): Promise<ModelArtifactServingProjection | null> {
  if (env.ARTIFACTS === undefined) return null;
  const object = await loadReleaseArtifact(env, STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY);
  if (object === null) return null;

  let payload: unknown;
  try {
    payload = await object.json();
  } catch (error) {
    console.error("Model artifact serving projection is not valid JSON.", {
      key: STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY,
    });
    return servingArtifactCorruptionOrLegacyAbsence(
      env,
      {
        code: "active_artifact_json",
        endpoint: "studio-model-artifact-projection",
        logicalArtifactId: STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY,
        schemaId: "bp.studio.model_artifact_serving_projection",
      },
      error,
    );
  }

  const parsed = decodeSchemaEitherPreserve(ModelArtifactServingProjectionSchema, payload);
  if (Result.isFailure(parsed)) {
    console.error("Model artifact serving projection failed contract validation.", {
      key: STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY,
      issues: schemaErrorIssues(parsed.failure),
    });
    return servingArtifactCorruptionOrLegacyAbsence(env, {
      code: "active_artifact_schema",
      endpoint: "studio-model-artifact-projection",
      logicalArtifactId: STUDIO_MODEL_ARTIFACT_SERVING_PROJECTION_KEY,
      schemaId: "bp.studio.model_artifact_serving_projection",
    });
  }
  return parsed.success;
}

async function loadDetectorReadinessServingManifest(
  env: StudioReadEnv,
): Promise<DetectorReadinessServingManifestForInsights | null> {
  if (env.ARTIFACTS === undefined) return null;
  const object = await loadReleaseArtifact(env, STUDIO_ROUTE_DETECTOR_READINESS_MANIFEST_KEY);
  if (object === null) return null;

  let payload: unknown;
  try {
    payload = await object.json();
  } catch (error) {
    return servingArtifactCorruptionOrLegacyAbsence(
      env,
      {
        code: "active_artifact_json",
        endpoint: "studio-detector-readiness",
        logicalArtifactId: STUDIO_ROUTE_DETECTOR_READINESS_MANIFEST_KEY,
        schemaId: "bp.studio.detector_readiness_serving_manifest",
      },
      error,
    );
  }

  const parsed = decodeSchemaEitherPreserve(
    DetectorReadinessServingManifestForInsightsSchema,
    payload,
  );
  return Result.isSuccess(parsed)
    ? parsed.success
    : servingArtifactCorruptionOrLegacyAbsence(env, {
        code: "active_artifact_schema",
        endpoint: "studio-detector-readiness",
        logicalArtifactId: STUDIO_ROUTE_DETECTOR_READINESS_MANIFEST_KEY,
        schemaId: "bp.studio.detector_readiness_serving_manifest",
      });
}

async function loadRouteCapabilityManifest(
  env: StudioReadEnv,
): Promise<RouteCapabilityManifestForIndex | null> {
  if (env.ARTIFACTS === undefined) return null;
  const object = await loadReleaseArtifact(env, STUDIO_ROUTE_CAPABILITY_MANIFEST_KEY);
  if (object === null) return null;

  let payload: unknown;
  try {
    payload = await object.json();
  } catch (error) {
    return servingArtifactCorruptionOrLegacyAbsence(
      env,
      {
        code: "active_artifact_json",
        endpoint: "studio-route-capability",
        logicalArtifactId: STUDIO_ROUTE_CAPABILITY_MANIFEST_KEY,
        schemaId: "bp.studio.route_capability_manifest",
      },
      error,
    );
  }

  const parsed = decodeSchemaEitherPreserve(RouteCapabilityManifestForIndexSchema, payload);
  return Result.isSuccess(parsed)
    ? parsed.success
    : servingArtifactCorruptionOrLegacyAbsence(env, {
        code: "active_artifact_schema",
        endpoint: "studio-route-capability",
        logicalArtifactId: STUDIO_ROUTE_CAPABILITY_MANIFEST_KEY,
        schemaId: "bp.studio.route_capability_manifest",
      });
}

function routeCapabilityByRouteId(
  manifest: RouteCapabilityManifestForIndex | null,
): ReadonlyMap<string, StudioRouteCapability> {
  const byRoute = new Map<string, StudioRouteCapability>();
  if (manifest === null) return byRoute;
  const referenceMonth = freshnessReferenceMonth(new Date().toISOString());
  for (const route of manifest.routes) {
    byRoute.set(route.routeId, {
      overallState: route.overallState,
      surfaces: Object.fromEntries(
        Object.entries(route.surfaces).map(([surfaceId, surface]) => [
          surfaceId,
          {
            ...surface,
            freshness: freshnessForDataAsOf(surface.dataAsOf, referenceMonth),
          },
        ]),
      ),
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
    const object = await loadReleaseArtifact(input.env, routeDossierSummaryKey(slug));
    if (object === null) continue;

    let payload: unknown;
    try {
      payload = await object.json();
    } catch (error) {
      servingArtifactCorruptionOrLegacyAbsence(
        input.env,
        {
          code: "active_artifact_json",
          endpoint: "studio-route-dossier",
          logicalArtifactId: routeDossierSummaryKey(slug),
          schemaId: "bp.studio.route_dossier_summary",
        },
        error,
      );
      continue;
    }

    const parsed = decodeSchemaEitherPreserve(RouteDossierSummaryForDetailSchema, payload);
    if (Result.isSuccess(parsed)) return parsed.success;
    servingArtifactCorruptionOrLegacyAbsence(input.env, {
      code: "active_artifact_schema",
      endpoint: "studio-route-dossier",
      logicalArtifactId: routeDossierSummaryKey(slug),
      schemaId: "bp.studio.route_dossier_summary",
    });
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
    const object = await loadReleaseArtifact(input.env, routeHourlyProfileArtifactKey(slug));
    if (object === null) continue;

    let payload: unknown;
    try {
      payload = await object.json();
    } catch (error) {
      servingArtifactCorruptionOrLegacyAbsence(
        input.env,
        {
          code: "active_artifact_json",
          endpoint: "studio-route-hourly-profile",
          logicalArtifactId: routeHourlyProfileArtifactKey(slug),
          schemaId: "bp.studio.route_hourly_profile_response.v1",
        },
        error,
      );
      continue;
    }

    const parsed = decodeSchemaEitherStrict(StudioRouteHourlyProfileResponseSchema, payload);
    if (Result.isFailure(parsed)) {
      servingArtifactCorruptionOrLegacyAbsence(input.env, {
        code: "active_artifact_schema",
        endpoint: "studio-route-hourly-profile",
        logicalArtifactId: routeHourlyProfileArtifactKey(slug),
        schemaId: "bp.studio.route_hourly_profile_response.v1",
      });
      continue;
    }
    return {
      peakWindows: parsed.success.peakWindows,
      slowestWindows: parsed.success.slowestWindows,
      reliabilitySamples: parsed.success.reliabilitySamples,
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
  return decodeSchemaStrict(StudioRouteDetailResponseSchema, {
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
  const object = await loadReleaseArtifact(env, `studio/v2/routes/${routeSlug}/speed-spine.json`);
  if (object === null) return null;

  let payload: unknown;
  try {
    payload = await object.json();
  } catch (error) {
    return servingArtifactCorruptionOrLegacyAbsence(
      env,
      {
        code: "active_artifact_json",
        endpoint: "studio-route-speed-spine",
        logicalArtifactId: `studio/v2/routes/${routeSlug}/speed-spine.json`,
        schemaId: "bp.studio.route_speed_spine",
      },
      error,
    );
  }

  const parsed = decodeSchemaEitherPreserve(RouteSpeedSpineArtifactForSegmentsSchema, payload);
  return Result.isSuccess(parsed)
    ? parsed.success
    : servingArtifactCorruptionOrLegacyAbsence(env, {
        code: "active_artifact_schema",
        endpoint: "studio-route-speed-spine",
        logicalArtifactId: `studio/v2/routes/${routeSlug}/speed-spine.json`,
        schemaId: "bp.studio.route_speed_spine",
      });
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
  return decodeSchemaStrict(StudioRouteDetailResponseSchema, {
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
    spineSegmentId: input.segment.segmentId,
    spineJoinStatus: "matched",
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
  return decodeSchemaStrict(StudioRouteDetailResponseSchema, {
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
  row: NormalizedStudioRouteIndexSourceRow;
  requestedSlug: string;
}): Promise<StudioRouteDetailResponse | null> {
  const expectedPresentation = exactRoutePresentationForIndexRow(input.row);
  const expectedSlug = routeIdToStudioSlug(input.row.routeId);
  for (const candidateSlug of routeDetailSlugCandidates(input.row.routeId, input.requestedSlug)) {
    const detail = await maybeLoadStudioRouteDetailProjection(input.env, candidateSlug);
    if (
      detail !== null &&
      detail.route.routeSchemaVersion === 2 &&
      detail.route.routeId === expectedPresentation.routeId &&
      detail.route.slug === expectedSlug &&
      detail.route.routeFamilyId === expectedPresentation.routeFamilyId &&
      detail.route.displayLabel === expectedPresentation.displayLabel &&
      detail.route.officialLongName === expectedPresentation.officialLongName &&
      JSON.stringify(detail.route.designationLiterals) ===
        JSON.stringify(expectedPresentation.designationLiterals) &&
      JSON.stringify(detail.route.serviceModes) ===
        JSON.stringify(expectedPresentation.serviceModes) &&
      JSON.stringify(detail.route.routeTypes) === JSON.stringify(expectedPresentation.routeTypes) &&
      JSON.stringify(detail.route.tripTypes) === JSON.stringify(expectedPresentation.tripTypes)
    ) {
      return detail;
    }
  }
  return null;
}

function aliasedRouteDetailForD1Row(input: {
  row: NormalizedStudioRouteIndexSourceRow;
  observed: D1RouteObservedReliabilitySummary | undefined;
  richDetail: StudioRouteDetailResponse;
  release: ResolvedServingRelease;
}): StudioRouteDetailResponse {
  return decodeSchemaStrict(StudioRouteDetailResponseSchema, {
    ...input.richDetail,
    releaseId: input.release.releaseId,
    publishedAt: input.release.publishedAt,
    coverage: input.release.coverage,
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

export async function buildStudioRouteSectionsResponse(
  env: StudioReadEnv,
): Promise<BuildStudioRouteSectionsResponseResult> {
  if (env.DB === undefined) {
    return {
      ok: false,
      response: dependencyNotConfiguredResponse("DB", "Studio route sections"),
    };
  }
  const release = await resolveServingRelease(env);
  if (release === null) {
    return { ok: false, response: errorResponse(503, NO_PUBLISHED_SERVING_DATA_MESSAGE) };
  }

  const generatedAt = new Date().toISOString();
  const [rows, rawRouteEvidenceIndex, capabilityManifest] = await Promise.all([
    listNormalizedStudioRouteIndexSourceRows(createD1ServingDb(env.DB), release.coverage.end),
    loadStudioRouteEvidenceIndex(env),
    loadRouteCapabilityManifest(env),
  ]);
  const routeEvidenceIndex = closedRouteEvidenceIndex(rawRouteEvidenceIndex, () =>
    exactRouteEvidenceIdentitiesFromD1(rows.filter((row) => row.tripTypeCatalogAvailable)),
  );
  const capabilityByRoute = routeCapabilityByRouteId(capabilityManifest);
  const routes = rows.map((row) =>
    buildStudioRouteIndex2Row({
      releaseId: release.releaseId,
      publishedAt: release.publishedAt,
      coverage: release.coverage,
      generatedAt,
      lastBuiltSpeedMonth: release.latestSpeedMonth ?? undefined,
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
      minCoverageRule: "Requires a route summary row for the latest covered month.",
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
        "Requires at least six route-month speed history points and a latest speed point in the latest covered speed month.",
      rows: buildWorseningFastRows({
        currentSpeedMonth: release.latestSpeedMonth ?? release.coverage.end,
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
        "Requires a route summary row for the latest covered month; treatment coverage is current serving-summary context.",
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
    routeSections: decodeSchemaStrict(StudioRouteSectionsResponseSchema, {
      schemaVersion: 1,
      generatedAt,
      releaseId: release.releaseId,
      publishedAt: release.publishedAt,
      coverage: release.coverage,
      dataAsOf: release.latestSpeedMonth ?? release.coverage.end,
      sections,
      quality: {
        releaseLayer: "published_release",
        completenessStatus: rows.length === 0 ? "unavailable" : "partial_public_speed_only",
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

async function findObservedReliabilityRow(input: {
  env: StudioReadEnv;
  coverageEnd: string;
  routeId: string;
}): Promise<D1RouteObservedReliabilitySummary | undefined> {
  if (input.env.DB === undefined) return undefined;
  const observed = await listRouteObservedReliabilitySummaries(
    createD1ServingDb(input.env.DB),
    input.coverageEnd,
  );
  return observed.find((row) => row.routeId === input.routeId);
}

function routeCapabilityForRouteId(
  manifest: RouteCapabilityManifestForIndex | null,
  routeId: string,
): StudioRouteCapability | null {
  const byRoute = routeCapabilityByRouteId(manifest);
  return byRoute.get(routeId) ?? null;
}

// The detail path resolves the serving release from D1 and overlays that exact
// identity on both rich R2 projections and partial D1 fallbacks.
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
  const release = await resolveServingRelease(env);
  if (release === null) {
    return {
      ok: false,
      response: errorResponse(503, NO_PUBLISHED_SERVING_DATA_MESSAGE),
    };
  }

  const exactRows = await resolveExactRouteRows(env, release);
  if (!exactRows.ok) return exactRows;
  const row =
    exactRows.rows.find((candidate) => routeIdToStudioSlug(candidate.routeId) === slug) ?? null;
  if (row === null) {
    return { ok: false, response: errorResponse(404, "Studio route was not found.") };
  }

  if (row.artifactNames.length > 0) {
    const richDetail = await maybeLoadAliasedStudioRouteDetailProjection({
      env,
      row,
      requestedSlug: slug,
    });
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
          findRouteEquityContext(servingDb, row.routeId, release.coverage.end),
          loadRouteHourlyProfileForDetail({ env, routeId: row.routeId, requestedSlug: slug }),
        ]);
      const routeDetail = routeDetailWithCapabilityAndDossier({
        routeDetail: routeDetailWithInsights({
          routeDetail: decodeSchemaStrict(StudioRouteDetailResponseSchema, {
            ...richDetail,
            releaseId: release.releaseId,
            publishedAt: release.publishedAt,
            coverage: release.coverage,
          }),
          manifest,
        }),
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
    findObservedReliabilityRow({ env, coverageEnd: release.coverage.end, routeId: row.routeId }),
    loadDetectorReadinessServingManifest(env),
    maybeLoadAliasedStudioRouteDetailProjection({
      env,
      row,
      requestedSlug: slug,
    }),
    loadRouteSpeedSpineCandidatesForSegments({
      env,
      routeId: row.routeId,
      requestedSlug: slug,
    }),
    loadRouteCapabilityManifest(env),
    loadRouteDossierSummaryForDetail({ env, routeId: row.routeId, requestedSlug: slug }),
    findRouteEquityContext(servingDb, row.routeId, release.coverage.end),
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
          release,
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
    routeDetail: decodeSchemaStrict(StudioRouteDetailResponseSchema, {
      schemaVersion: 3,
      generatedAt: new Date().toISOString(),
      releaseId: release.releaseId,
      publishedAt: release.publishedAt,
      coverage: release.coverage,
      route: buildStudioRouteCardFromIndexRow(row, observed, null),
      segments: [],
      artifactRefs: [],
      ...(hourlyProfile ?? {}),
      capability,
      dossier,
      equityContext: routeEquityContext,
      quality: {
        releaseLayer: "published_release",
        completenessStatus: row.summary === null ? "unavailable" : "partial_public_speed_only",
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
  const release = await resolveServingRelease(env);
  if (env.DB !== undefined) {
    if (release === null) {
      return { ok: false, response: errorResponse(503, NO_PUBLISHED_SERVING_DATA_MESSAGE) };
    }
    const [routes, publishedInterventions] = await Promise.all([
      listStudioRouteCardsFromD1(env, release.coverage.end),
      maybeLoadPublishedRouteInterventions(env),
    ]);
    const routesWithPublishedInterventions = routes.map((route) => ({
      ...route,
      interventions: publishedInterventions.get(route.routeId) ?? route.interventions,
    }));
    return {
      ok: true,
      routes: routesWithPublishedInterventions,
      generatedAt: new Date().toISOString(),
      releaseId: release.releaseId,
      publishedAt: release.publishedAt,
      coverage: release.coverage,
      quality: {
        releaseLayer: "published_release",
        completenessStatus: routes.length === 0 ? "unavailable" : "partial_public_speed_only",
        confidence: routes.length === 0 ? "low" : "medium",
        caveats: [
          `Studio route listing is served live from D1 for the latest covered month, ${release.coverage.end}.`,
          "Published intervention annotations are joined from the public route projection by exact route ID.",
          "Rich per-route artifacts, briefs, and findings remain release-static R2 projections.",
          "Catalog routes without rich artifacts return partial route detail with surface flags and caveats.",
        ],
      },
      releaseLayer: "published_release",
    };
  }
  const fallback = await loadStudioProjection(env, "routes.json", StudioRoutesResponseSchema);
  if (fallback instanceof Response) {
    return { ok: false, response: fallback };
  }
  return {
    ok: true,
    routes: [...fallback.routes],
    generatedAt: fallback.generatedAt,
    releaseId: fallback.releaseId,
    publishedAt: fallback.publishedAt,
    coverage: fallback.coverage,
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
  const release = await resolveServingRelease(env);
  if (release === null) {
    return { ok: false, response: errorResponse(503, NO_PUBLISHED_SERVING_DATA_MESSAGE) };
  }

  const exactRows = await resolveExactRouteRows(env, release);
  if (!exactRows.ok) return exactRows;
  const row =
    exactRows.rows.find((candidate) => routeIdToStudioSlug(candidate.routeId) === slug) ?? null;
  if (row === null) {
    return { ok: false, response: errorResponse(404, "Studio route history was not found.") };
  }

  const [points, observed] = await Promise.all([
    listRouteMonthTrends(createD1ServingDb(env.DB), row.routeId),
    findObservedReliabilityRow({ env, coverageEnd: release.coverage.end, routeId: row.routeId }),
  ]);
  const route = buildStudioRouteCardFromIndexRow(row, observed, null);
  const coverage = buildRouteHistoryCoverage(points);
  const speedCaveat =
    release.latestSpeedMonth === null
      ? "Average speed is present only for months with public MTA route segment speed rows."
      : `Average speed is present only for months with public MTA route segment speed rows through ${release.latestSpeedMonth}.`;

  return {
    ok: true,
    history: decodeSchemaStrict(StudioRouteHistoryResponseSchema, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      route,
      points,
      coverage,
      quality: {
        releaseLayer: "published_release",
        completenessStatus: coverage.pointCount === 0 ? "unavailable" : "partial_public_speed_only",
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
  const object = await loadReleaseArtifact(env, key);
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

  const parsed = decodeSchemaEitherStrict(StudioRouteHourlyProfileResponseSchema, payload);
  if (Result.isFailure(parsed)) {
    return {
      ok: false,
      response: artifactNotAvailableResponse(
        502,
        "Studio route hourly profile failed contract validation.",
        key,
      ),
    };
  }
  if (parsed.success.routeSlug !== slug) {
    return {
      ok: false,
      response: artifactNotAvailableResponse(
        502,
        "Studio route hourly profile slug mismatch.",
        key,
      ),
    };
  }

  return { ok: true, hourlyProfile: parsed.success };
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
  const object = await loadReleaseArtifact(env, key);
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

  const parsed = decodeSchemaEitherStrict(StudioRouteSpeedHistoryResponseSchema, payload);
  if (Result.isFailure(parsed)) {
    return {
      ok: false,
      response: artifactNotAvailableResponse(
        502,
        "Studio route speed history failed contract validation.",
        key,
      ),
    };
  }
  if (parsed.success.routeSlug !== slug) {
    return {
      ok: false,
      response: artifactNotAvailableResponse(502, "Studio route speed history slug mismatch.", key),
    };
  }

  return { ok: true, speedHistory: parsed.success };
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
  const release = await resolveServingRelease(env);
  if (release === null) {
    return { ok: false, response: errorResponse(503, NO_PUBLISHED_SERVING_DATA_MESSAGE) };
  }

  const exactRows = await resolveExactRouteRows(env, release);
  if (!exactRows.ok) return exactRows;
  const row =
    exactRows.rows.find((candidate) => routeIdToStudioSlug(candidate.routeId) === slug) ?? null;
  if (row === null) {
    return { ok: false, response: errorResponse(404, "Studio route timeline was not found.") };
  }
  if (!hasRouteTimelineBundle(row)) {
    return {
      ok: true,
      timeline: emptyStudioRouteEvidenceBundle({ routeId: row.routeId, routeSlug: slug }),
    };
  }

  const routeEvidenceIndex = closedRouteEvidenceIndex(await loadStudioRouteEvidenceIndex(env), () =>
    exactRouteEvidenceIdentitiesFromD1(exactRows.rows),
  );

  const key = studioRouteEvidenceBundleKey(routeIdToStudioSlug(row.routeId));
  const object = await loadReleaseArtifact(env, key);
  if (object === null) {
    return {
      ok: true,
      timeline: emptyStudioRouteEvidenceBundle({ routeId: row.routeId, routeSlug: slug }),
    };
  }

  let objectPayload: Awaited<ReturnType<typeof routeEvidenceObjectPayload>>;
  try {
    objectPayload = await routeEvidenceObjectPayload(object);
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

  const parsed = decodeSchemaEitherStrict(StudioRouteEvidenceBundleSchema, objectPayload.payload);
  if (Result.isFailure(parsed)) {
    console.error("Studio route evidence bundle failed contract validation.", {
      key,
      issues: schemaErrorIssues(parsed.failure),
    });
    return {
      ok: false,
      response: errorResponse(502, ARTIFACT_NOT_AVAILABLE_MESSAGE),
    };
  }
  const expectedRoute = exactRouteEvidenceIdentity(row);
  try {
    if (isRouteEvidenceBundleV2(parsed.success)) {
      if (routeEvidenceIndex?.schemaVersion !== 2) {
        throw new Error("Route evidence v2 bundle lacks a closed v2 index");
      }
      const indexRow = routeEvidenceIndexRowV2(routeEvidenceIndex, row.routeId);
      if (indexRow === null) throw new Error("Route evidence v2 index row is missing");
      assertStudioRouteEvidenceV2ServingClosure({
        kind: "bundle",
        index: routeEvidenceIndex,
        indexRow,
        expectedRoute,
        artifactKey: key,
        bundle: parsed.success,
        byteLength: objectPayload.byteLength,
        sha256: objectPayload.sha256,
      });
    } else if (parsed.success.routeId !== row.routeId || parsed.success.routeSlug !== slug) {
      throw new Error("Legacy route evidence identity mismatch");
    }
  } catch {
    return {
      ok: false,
      response: artifactNotAvailableResponse(
        502,
        "Studio route evidence bundle failed contract validation.",
        key,
      ),
    };
  }

  return { ok: true, timeline: parsed.success };
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

function sourceMonthStates(input: {
  routeIndex: StudioRouteIndex3Response;
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
    month: input.routeIndex.coverage.end,
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
    month: input.routeIndex.coverage.end,
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
      status: row.status,
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
          ? "No published speed data is available in D1."
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
      month: input.routeIndex.coverage.end,
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
  routeIndex: StudioRouteIndex3Response;
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
      schemaVersion: 3,
      grain: "route",
      storage: "worker",
      path: "/api/v1/studio/routes?schema=3",
      months: {
        start: input.routeIndex.coverage.start,
        end: input.routeIndex.coverage.end,
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
              start: input.routeIndex.coverage.start,
              end: input.routeIndex.coverage.end,
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
    publishedAt: input.routeIndex.publishedAt,
    coverage: input.routeIndex.coverage,
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

async function buildStudioSnapshotResponse(env: StudioReadEnv): Promise<Response> {
  const [routesResult, methodsResult, docsResult, rawRouteEvidenceIndex, modelProjection] =
    await Promise.all([
      buildStudioRoutesResponse(env),
      loadStudioProjection(env, "methods.json", StudioMethodsResponseSchema),
      loadStudioProjection(env, "docs.json", StudioDocsResponseSchema),
      loadStudioRouteEvidenceIndex(env),
      loadModelArtifactServingProjection(env),
    ]);
  if (!routesResult.ok) return routesResult.response;
  let routeEvidenceIndex: StudioRouteEvidenceIndex | null = rawRouteEvidenceIndex;
  if (rawRouteEvidenceIndex?.schemaVersion === 2) {
    if (env.DB === undefined) {
      routeEvidenceIndex = null;
    } else {
      const d1Rows = await listNormalizedStudioRouteIndexSourceRows(
        createD1ServingDb(env.DB),
        routesResult.coverage.end,
      );
      routeEvidenceIndex = closedRouteEvidenceIndex(rawRouteEvidenceIndex, () =>
        exactRouteEvidenceIdentitiesFromD1(d1Rows),
      );
    }
  }

  const generatedAt = new Date().toISOString();
  const toleratedCaveats: string[] = [];
  const methodsUnavailable = methodsResult instanceof Response;
  if (methodsUnavailable) {
    toleratedCaveats.push(SNAPSHOT_DEGRADE_POLICY.methods.caveat);
    console.error("Studio snapshot tolerated methods projection failure.", {
      policy: SNAPSHOT_DEGRADE_POLICY.methods,
    });
  }
  const methods: StudioMethodsResponse = methodsUnavailable
    ? {
        schemaVersion: 1,
        generatedAt,
        datasets: [],
        quality: snapshotQualityWithCaveat(
          routesResult.quality,
          SNAPSHOT_DEGRADE_POLICY.methods.caveat,
        ),
      }
    : methodsResult;

  const docsUnavailable = docsResult instanceof Response;
  if (docsUnavailable) {
    toleratedCaveats.push(SNAPSHOT_DEGRADE_POLICY.docs.caveat);
    console.error("Studio snapshot tolerated docs projection failure.", {
      policy: SNAPSHOT_DEGRADE_POLICY.docs,
    });
  }
  const docsProjection: StudioDocsResponse = docsUnavailable
    ? {
        schemaVersion: 1,
        generatedAt,
        sections: [],
        endpoints: [],
        quality: snapshotQualityWithCaveat(
          routesResult.quality,
          SNAPSHOT_DEGRADE_POLICY.docs.caveat,
        ),
      }
    : withGeneratedDocsEndpoints(docsResult);

  if (routeEvidenceIndex === null) {
    toleratedCaveats.push(SNAPSHOT_DEGRADE_POLICY.routeEvidenceIndex.caveat);
  }
  if (modelProjection === null) {
    toleratedCaveats.push(SNAPSHOT_DEGRADE_POLICY.modelProjection.caveat);
  }

  const resolvedRelease = await resolveServingRelease(env);
  const routesAreD1Backed = env.DB !== undefined && resolvedRelease !== null;
  const routeIndex2Result = routesAreD1Backed ? await buildStudioRouteIndex3Response(env) : null;
  let snapshot2: StudioSnapshot2 | undefined;
  if (routeIndex2Result?.ok === true && env.DB !== undefined) {
    try {
      const publicSourceMonthCoverage = await listPublicSnapshotSourceMonthCoverage(
        createD1ServingDb(env.DB),
      );
      snapshot2 = buildSnapshot2({
        routeIndex: routeIndex2Result.routeIndex,
        sourceMonthCoverage: publicSourceMonthCoverage.rows,
        skippedSourceMonthCoverageRows: publicSourceMonthCoverage.skippedRowCount,
        lastBuiltSpeedMonth: resolvedRelease?.latestSpeedMonth ?? undefined,
        routeEvidenceIndex,
        modelProjection,
      });
    } catch (error) {
      toleratedCaveats.push(SNAPSHOT_DEGRADE_POLICY.snapshot2.caveat);
      console.error("Studio Snapshot 2.0 assembly failed; serving v1 snapshot only.", {
        error,
        policy: SNAPSHOT_DEGRADE_POLICY.snapshot2,
      });
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
  const baseSnapshot: Omit<StudioSnapshotResponse, "v2"> = {
    schemaVersion: 1,
    generatedAt,
    projectionPrefix: prefix,
    releaseKey: studioReleaseKey(env),
    release: {
      releaseId: routesResult.releaseId,
      publishedAt: routesResult.publishedAt,
      coverage: routesResult.coverage,
    },
    lastBuiltSpeedMonth: resolvedRelease?.latestSpeedMonth ?? null,
    counts: {
      routes: routesResult.routes.length,
      methods: methods.datasets.length,
      docsSections: docsProjection.sections.length,
      docsEndpoints: docsProjection.endpoints.length,
    },
    projections,
    quality: snapshotQualityWithCaveats(routesResult.quality, toleratedCaveats),
  };

  const snapshot: StudioSnapshotResponse =
    snapshot2 === undefined ? baseSnapshot : { ...baseSnapshot, v2: snapshot2 };
  return studioJsonResponse(snapshot, env);
}

type StudioReadRouteId = Extract<StudioApiRouteId, `studio.${string}`>;
type StudioReadHandler = (input: {
  url: URL;
  env: StudioReadEnv;
  params: Readonly<Record<string, string>>;
}) => Promise<Response>;

function routeSlug(
  params: Readonly<Record<string, string>> & { readonly routeId?: string },
): string {
  return decodeURIComponent(params.routeId ?? "");
}

const studioReadHandlers = {
  "studio.routes": async ({ url, env }) => {
    const schemaVersion = url.searchParams.get("schema");
    if (schemaVersion === "3") {
      const result = await buildStudioRouteIndex3Response(env);
      return result.ok ? studioJsonResponse(result.routeIndex, env) : result.response;
    }
    if (schemaVersion === "2") {
      const result = await buildStudioRouteIndex2Response(env);
      return result.ok ? studioJsonResponse(result.routeIndex, env) : result.response;
    }
    if (schemaVersion !== null) {
      return errorResponse(400, `Unsupported Studio route-index schema version: ${schemaVersion}`);
    }

    const result = await buildStudioRoutesResponse(env);
    if (!result.ok) return result.response;
    const response: StudioRoutesResponse = {
      schemaVersion: 2,
      generatedAt: result.generatedAt,
      releaseId: result.releaseId,
      publishedAt: result.publishedAt,
      coverage: result.coverage,
      routes: result.routes,
      quality: result.quality,
    };
    return studioJsonResponse(response, env);
  },
  "studio.snapshot": ({ env }) => buildStudioSnapshotResponse(env),
  "studio.routeSections": async ({ env }) => {
    const result = await buildStudioRouteSectionsResponse(env);
    return result.ok ? studioJsonResponse(result.routeSections, env) : result.response;
  },
  "studio.route": async ({ env, params }) => {
    const slug = routeSlug(params);
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
  },
  "studio.routeHistory": async ({ env, params }) => {
    const slug = routeSlug(params);
    const result = await buildStudioRouteHistoryResponse(env, slug);
    return result.ok ? studioJsonResponse(result.history, env) : result.response;
  },
  "studio.routeHourlyProfile": async ({ env, params }) => {
    const slug = routeSlug(params);
    const result = await buildStudioRouteHourlyProfileResponse(env, slug);
    return result.ok ? studioJsonResponse(result.hourlyProfile, env) : result.response;
  },
  "studio.routeSpeedHistory": async ({ env, params }) => {
    const slug = routeSlug(params);
    const result = await buildStudioRouteSpeedHistoryResponse(env, slug);
    return result.ok ? studioJsonResponse(result.speedHistory, env) : result.response;
  },
  "studio.routeTimeline": async ({ env, params }) => {
    const slug = routeSlug(params);
    const result = await buildStudioRouteTimelineResponse(env, slug);
    return result.ok ? studioJsonResponse(result.timeline, env) : result.response;
  },
} satisfies Record<StudioReadRouteId, StudioReadHandler>;

export const studioReadHandlerRouteIds = Object.keys(studioReadHandlers).toSorted();

function isStudioReadRouteId(routeId: string): routeId is StudioReadRouteId {
  return routeId in studioReadHandlers;
}

export async function handleStudioReadRequest<TEnv extends StudioReadEnv>(
  request: Request,
  url: URL,
  env: TEnv,
): Promise<Response> {
  const match = matchRouteSpec(request.method, url.pathname);
  if (match !== null && isStudioReadRouteId(match.spec.id)) {
    return studioReadHandlers[match.spec.id]({ url, env, params: match.params });
  }

  return errorResponse(404, "Studio API endpoint was not found.");
}
