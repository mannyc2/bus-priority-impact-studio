import {
  createD1ServingDb,
  findLatestNonBaselineObservedMonth,
  findLatestVerifiedFullMapRelease,
  getRouteBatchStatus,
  getRouteBriefSummary,
  getRouteScorecard,
  listCorridorSummaries,
  listRouteArtifacts,
  listRouteBriefSummaries,
  listRouteObservedReliabilitySummaries,
} from "@bp/db/d1";
import { isSafeArtifactKey, MapManifestResponseSchema } from "@bp/domain/maps";
import { IsoMonthSchema, type RouteId, RouteIdCodec } from "@bp/domain/primitives";
import {
  HotspotListResponseSchema,
  ReleaseStatusResponseSchema,
  RouteListResponseSchema,
  RouteProfileResponseSchema,
  RouteScorecardSchema,
} from "@bp/domain/routes";
import { Result } from "effect";
import type { StudioApiEnv } from "./env.js";
import { errorResponse as errorJson } from "./http/errors.js";
import { jsonResponse as json } from "./http/json.js";
import { SERVICE_DEPENDENCY_NOT_CONFIGURED_MESSAGE } from "./http/messages.js";
import { decodeSchemaEitherStrict, decodeSchemaStrict } from "./schema-decode.js";

function dependencyNotConfigured(dependency: string, context: string): Response {
  console.error("Service dependency is not configured.", { context, dependency });
  return errorJson(503, SERVICE_DEPENDENCY_NOT_CONFIGURED_MESSAGE);
}

async function buildRouteScorecardResponse(url: URL, env: StudioApiEnv): Promise<Response> {
  if (env.DB === undefined) {
    return dependencyNotConfigured("DB", "route scorecard");
  }

  const match = url.pathname.match(/^\/api\/routes\/([^/]+)\/scorecard$/);
  const rawRouteId = match?.[1];
  const rawMonth = url.searchParams.get("month");

  if (rawRouteId === undefined) {
    return errorJson(404, "Route scorecard endpoint not found.");
  }

  const month = decodeSchemaEitherStrict(IsoMonthSchema, rawMonth);
  if (Result.isFailure(month)) {
    return errorJson(400, "Query parameter month must use YYYY-MM format.");
  }

  let routeId: RouteId;
  try {
    routeId = decodeSchemaStrict(RouteIdCodec, decodeURIComponent(rawRouteId));
  } catch {
    return errorJson(400, "Route ID is invalid.");
  }

  const scorecard = await getRouteScorecard(createD1ServingDb(env.DB), routeId, month.success);
  if (scorecard === null) {
    return errorJson(404, "Route scorecard was not found.");
  }

  return json(decodeSchemaStrict(RouteScorecardSchema, scorecard));
}

function parseLimit(url: URL, fallback: number, maximum: number): number | null {
  const rawLimit = url.searchParams.get("limit");
  if (rawLimit === null) {
    return fallback;
  }

  const limit = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(limit) || limit < 1) {
    return null;
  }

  return Math.min(limit, maximum);
}

function releaseStatusMonth(url: URL, env: StudioApiEnv): string | null {
  const month = url.searchParams.get("month") ?? env.BASELINE_MONTH ?? null;
  if (month === null) {
    return null;
  }

  const parsed = decodeSchemaEitherStrict(IsoMonthSchema, month);
  return Result.isSuccess(parsed) ? parsed.success : null;
}

function artifactApiPath(key: string): string {
  return `/api/v1/artifacts/${key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

const mapArtifactManifestKeys = [
  "artifactCount",
  "artifactKind",
  "artifacts",
  "buildStatus",
  "coverage",
  "issueCount",
  "layers",
  "publishedAt",
  "releaseId",
  "releaseProfile",
  "routeFacts",
  "routeSegmentArtifactCount",
  "routeUniverse",
  "schemaVersion",
  "sources",
  "status",
  "totalByteLength",
  "totalFeatureCount",
  "verificationStatus",
] as const;

const mapArtifactEntryKeys = [
  "artifactKey",
  "artifactKind",
  "byteLength",
  "contentType",
  "coordinateCount",
  "featureCount",
  "gzipByteLength",
  "routeId",
  "sha256",
] as const;

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  const expectedSet = new Set(expected);
  return actual.length === expected.length && actual.every((key) => expectedSet.has(key));
}

function hasExactUniqueMembers(actual: readonly string[], expected: readonly string[]): boolean {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return (
    actualSet.size === actual.length &&
    expectedSet.size === expected.length &&
    actual.length === expected.length &&
    actual.every((member) => expectedSet.has(member))
  );
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isValidArtifactKey(key: string): boolean {
  return isSafeArtifactKey(key);
}

function decodeArtifactKey(rawKey: string): string | null {
  try {
    return rawKey
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join("/");
  } catch {
    return null;
  }
}

function realtimeSourceForRunId(
  runId: string | null,
): "official_self_collected" | "third_party_recovered" | "none" {
  if (runId === null) {
    return "none";
  }

  return runId.startsWith("bus-observatory-") ? "third_party_recovered" : "official_self_collected";
}

type ObservedReliabilityRow = Awaited<
  ReturnType<typeof listRouteObservedReliabilitySummaries>
>[number];

function buildRouteCard(input: {
  routeId: string;
  month: string;
  rank: number;
  routeScore: number;
  averageSpeedMph: number;
  hotspotCount: number;
  totalRidership: number;
  aceActive: boolean;
  busLaneMatchedLaneCount: number;
  observed: ObservedReliabilityRow | null;
}) {
  const source = realtimeSourceForRunId(input.observed?.runId ?? null);
  const hasObservedReliability = input.observed?.reliabilityStatus === "observed";
  const completenessStatus =
    input.observed === null
      ? "missing_realtime"
      : hasObservedReliability
        ? "complete"
        : "insufficient_samples";

  return {
    routeId: input.routeId,
    shortName: input.routeId,
    month: input.month,
    rank: input.rank,
    routeScore: input.routeScore,
    averageSpeedMph: input.averageSpeedMph,
    hotspotCount: input.hotspotCount,
    totalRidership: input.totalRidership,
    aceActive: input.aceActive,
    busLaneMatchedLaneCount: input.busLaneMatchedLaneCount,
    observedBunchingShare: input.observed?.observedBunchingShare ?? null,
    observedLongGapShare: input.observed?.observedLongGapShare ?? null,
    reliabilityStatus: input.observed?.reliabilityStatus ?? null,
    sampleCount: input.observed?.sampleCount ?? 0,
    quality: {
      releaseLayer: hasObservedReliability
        ? ("observed_release" as const)
        : ("baseline_release" as const),
      completenessStatus,
      confidence: source === "third_party_recovered" ? ("medium" as const) : ("high" as const),
      caveats:
        source === "third_party_recovered"
          ? ["Observed reliability is recovered from the third-party Bus Observatory archive."]
          : input.observed === null
            ? ["No observed realtime reliability row is attached to this route card."]
            : [],
    },
  };
}

async function buildReleaseStatusResponse(url: URL, env: StudioApiEnv): Promise<Response> {
  if (env.DB === undefined) {
    return dependencyNotConfigured("DB", "release status");
  }

  const month = releaseStatusMonth(url, env);
  if (month === null) {
    return errorJson(400, "Query parameter month or BASELINE_MONTH must use YYYY-MM format.");
  }

  const db = createD1ServingDb(env.DB);
  const [batchStatus, reliability, currentSignalMonth] = await Promise.all([
    getRouteBatchStatus(db, month),
    listRouteObservedReliabilitySummaries(db, month),
    findLatestNonBaselineObservedMonth(db, month),
  ]);

  if (batchStatus === null) {
    return errorJson(404, "Release status was not found.");
  }

  const observedRows = reliability.filter((row) => row.reliabilityStatus === "observed");
  const insufficientRows = reliability.filter(
    (row) => row.reliabilityStatus === "insufficient_gtfs_rt_samples",
  );
  const runIds = [...new Set(observedRows.map((row) => row.runId))].sort();
  const runId = runIds.length === 1 ? (runIds[0] ?? null) : null;
  const observedRouteCount = observedRows.length;
  const sampleCount = reliability.reduce((sum, row) => sum + row.sampleCount, 0);
  const routeCoverageShare =
    batchStatus.routeCount === 0
      ? 0
      : Number((observedRouteCount / batchStatus.routeCount).toFixed(4));
  const source = realtimeSourceForRunId(runId);
  const caveats =
    source === "third_party_recovered"
      ? [
          "Observed GTFS-RT reliability is recovered from the third-party Bus Observatory archive, not official MTA historical replay.",
          "Monthly public speed evidence remains official MTA Open Data; realtime evidence has separate provenance.",
        ]
      : source === "none"
        ? ["No observed realtime evidence is attached to this release."]
        : ["Observed realtime evidence comes from self-collected MTA Bus Time GTFS-RT snapshots."];

  const currentObservedSignal = currentSignalMonth
    ? await buildCurrentObservedSignal(db, currentSignalMonth)
    : null;

  return json(
    decodeSchemaStrict(ReleaseStatusResponseSchema, {
      schemaVersion: 1,
      generatedAt: batchStatus.generatedAt,
      baselineMonth: month,
      currentSignalMonth: currentObservedSignal?.month ?? null,
      canonicalMonthlyRelease: {
        month,
        status: batchStatus.status,
        routeCount: batchStatus.routeCount,
        artifactCount: batchStatus.artifactCount,
        issueCount: batchStatus.issueCount,
      },
      observedRealtimeEvidence: {
        runId,
        source,
        observedRouteCount,
        insufficientRouteCount: insufficientRows.length,
        sampleCount,
        routeCoverageShare,
      },
      currentObservedSignal,
      quality: {
        releaseLayer: observedRouteCount > 0 ? "observed_release" : "baseline_release",
        completenessStatus:
          batchStatus.status === "pass" ? "complete" : "partial_public_monthly_only",
        confidence: source === "third_party_recovered" ? "medium" : "high",
        caveats,
      },
    }),
  );
}

async function buildCurrentObservedSignal(
  db: ReturnType<typeof createD1ServingDb>,
  month: string,
): Promise<{
  month: string;
  runId: string | null;
  source: "official_self_collected" | "third_party_recovered" | "none";
  releaseLayer: "current_signal";
  routeCount: number;
  observedRouteCount: number;
  insufficientRouteCount: number;
  sampleCount: number;
  caveats: readonly string[];
}> {
  const rows = await listRouteObservedReliabilitySummaries(db, month);
  const observedRows = rows.filter((row) => row.reliabilityStatus === "observed");
  const insufficientRows = rows.filter(
    (row) => row.reliabilityStatus === "insufficient_gtfs_rt_samples",
  );
  const runIds = [...new Set(rows.map((row) => row.runId))].sort();
  const runId = runIds.length === 1 ? (runIds[0] ?? null) : null;
  const source = realtimeSourceForRunId(runId);
  const sampleCount = rows.reduce((sum, row) => sum + row.sampleCount, 0);
  const caveats =
    source === "third_party_recovered"
      ? [
          "Current observed signal is recovered from the third-party Bus Observatory archive, not official MTA historical replay.",
          "Public monthly speed data is not yet available for this month; reliability evidence stands alone.",
        ]
      : source === "official_self_collected"
        ? [
            "Current observed signal comes from self-collected MTA Bus Time GTFS-RT snapshots.",
            "Public monthly speed data is not yet available for this month; reliability evidence stands alone.",
          ]
        : ["Current observed signal has ambiguous provenance; multiple runs cover the same month."];
  return {
    month,
    runId,
    source,
    releaseLayer: "current_signal",
    routeCount: rows.length,
    observedRouteCount: observedRows.length,
    insufficientRouteCount: insufficientRows.length,
    sampleCount,
    caveats,
  };
}

async function buildRouteListResponse(url: URL, env: StudioApiEnv): Promise<Response> {
  if (env.DB === undefined) {
    return dependencyNotConfigured("DB", "route list");
  }

  const month = releaseStatusMonth(url, env);
  if (month === null) {
    return errorJson(400, "Query parameter month or BASELINE_MONTH must use YYYY-MM format.");
  }

  const limit = parseLimit(url, 50, 250);
  if (limit === null) {
    return errorJson(400, "Query parameter limit must be a positive integer.");
  }

  const db = createD1ServingDb(env.DB);
  const [summaries, reliability] = await Promise.all([
    listRouteBriefSummaries(db, month),
    listRouteObservedReliabilitySummaries(db, month),
  ]);
  const reliabilityByRoute = new Map(reliability.map((row) => [row.routeId, row]));

  const routes = summaries.slice(0, limit).map((summary, index) => {
    const observed = reliabilityByRoute.get(summary.routeId) ?? null;
    return buildRouteCard({
      routeId: summary.routeId,
      month: summary.month,
      rank: index + 1,
      routeScore: summary.routeScore,
      averageSpeedMph: summary.averageSpeedMph,
      hotspotCount: summary.hotspotCount,
      totalRidership: summary.totalRidership,
      aceActive: summary.aceActive,
      busLaneMatchedLaneCount: summary.busLaneMatchedLaneCount,
      observed,
    });
  });

  return json(
    decodeSchemaStrict(RouteListResponseSchema, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      baselineMonth: month,
      routes,
      quality: {
        releaseLayer: routes.some((route) => route.quality.releaseLayer === "observed_release")
          ? "observed_release"
          : "baseline_release",
        completenessStatus: routes.every((route) => route.quality.completenessStatus === "complete")
          ? "complete"
          : "insufficient_samples",
        confidence: routes.some((route) => route.quality.confidence === "medium")
          ? "medium"
          : "high",
        caveats: [
          "Route cards are compact D1 serving projections; full evidence lives in generated route briefs and artifacts.",
        ],
      },
    }),
  );
}

async function buildRouteProfileResponse(url: URL, env: StudioApiEnv): Promise<Response> {
  if (env.DB === undefined) {
    return dependencyNotConfigured("DB", "route profile");
  }

  const match = url.pathname.match(/^\/api\/v1\/routes\/([^/]+)\/profile$/);
  const rawRouteId = match?.[1];
  if (rawRouteId === undefined) {
    return errorJson(404, "Route profile endpoint not found.");
  }

  const month = releaseStatusMonth(url, env);
  if (month === null) {
    return errorJson(400, "Query parameter month or BASELINE_MONTH must use YYYY-MM format.");
  }

  let routeId: RouteId;
  try {
    routeId = decodeSchemaStrict(RouteIdCodec, decodeURIComponent(rawRouteId));
  } catch {
    return errorJson(400, "Route ID is invalid.");
  }

  const db = createD1ServingDb(env.DB);
  const [summary, reliability, artifacts] = await Promise.all([
    getRouteBriefSummary(db, routeId, month),
    listRouteObservedReliabilitySummaries(db, month),
    listRouteArtifacts(db, month),
  ]);

  if (summary === null) {
    return errorJson(404, "Route profile was not found.");
  }

  const observed = reliability.find((row) => row.routeId === routeId) ?? null;
  const source = realtimeSourceForRunId(observed?.runId ?? null);
  const hasObservedReliability = observed?.reliabilityStatus === "observed";
  const completenessStatus =
    observed === null
      ? "missing_realtime"
      : hasObservedReliability
        ? "complete"
        : "insufficient_samples";
  const quality = {
    releaseLayer: hasObservedReliability ? "observed_release" : "baseline_release",
    completenessStatus,
    confidence: source === "third_party_recovered" ? "medium" : "high",
    caveats:
      source === "third_party_recovered"
        ? ["Observed reliability is recovered from the third-party Bus Observatory archive."]
        : observed === null
          ? ["No observed realtime reliability row is attached to this route profile."]
          : [],
  };

  return json(
    decodeSchemaStrict(RouteProfileResponseSchema, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      baselineMonth: month,
      route: {
        ...buildRouteCard({
          routeId: summary.routeId,
          month: summary.month,
          rank: 1,
          routeScore: summary.routeScore,
          averageSpeedMph: summary.averageSpeedMph,
          hotspotCount: summary.hotspotCount,
          totalRidership: summary.totalRidership,
          aceActive: summary.aceActive,
          busLaneMatchedLaneCount: summary.busLaneMatchedLaneCount,
          observed,
        }),
        quality,
      },
      peakRidership:
        summary.peakRidership === null
          ? null
          : {
              dayOfWeek: summary.peakRidership.dayOfWeek,
              hourOfDay: summary.peakRidership.hourOfDay,
              ridership: summary.peakRidership.ridership,
              transfers: summary.peakRidership.transfers,
              weightedAverageSpeedMph: summary.peakRidership.weightedAverageSpeedMph,
            },
      slowestWindow:
        summary.slowestWindow === null
          ? null
          : {
              dayOfWeek: summary.slowestWindow.dayOfWeek,
              hourOfDay: summary.slowestWindow.hourOfDay,
              observationCount: summary.slowestWindow.observationCount,
              busTripCount: summary.slowestWindow.busTripCount,
              weightedAverageSpeedMph: summary.slowestWindow.weightedAverageSpeedMph,
              slowObservationShare: summary.slowestWindow.slowObservationShare,
            },
      observedReliability:
        observed === null
          ? null
          : {
              runId: observed.runId,
              reliabilityStatus: observed.reliabilityStatus,
              sampleCount: observed.sampleCount,
              medianObservedHeadwayMinutes: observed.medianObservedHeadwayMinutes,
              p90ObservedHeadwayMinutes: observed.p90ObservedHeadwayMinutes,
              observedBunchingShare: observed.observedBunchingShare,
              observedLongGapShare: observed.observedLongGapShare,
              excessWaitMinutes: observed.excessWaitMinutes,
            },
      artifacts: artifacts
        .filter((artifact) => artifact.route_id === routeId)
        .map((artifact) => ({
          name: artifact.artifact_name,
          key: artifact.artifact_key,
          contentType: artifact.content_type,
          byteLength: artifact.byte_length,
          sha256: artifact.sha256,
        })),
      quality,
    }),
  );
}

async function buildMapManifestResponse(_url: URL, env: StudioApiEnv): Promise<Response> {
  if (env.DB === undefined) {
    return dependencyNotConfigured("DB", "map release catalog");
  }
  if (env.ARTIFACTS === undefined) {
    return dependencyNotConfigured("ARTIFACTS", "map manifest");
  }

  let catalog: Awaited<ReturnType<typeof findLatestVerifiedFullMapRelease>>;
  try {
    catalog = await findLatestVerifiedFullMapRelease(createD1ServingDb(env.DB));
  } catch (error) {
    console.error("Map release catalog query failed.", { error });
    return errorJson(503, "The verified map release catalog is unavailable.");
  }
  if (catalog === null) {
    return errorJson(503, "No verified full map release is registered.");
  }

  let object: R2ObjectBody | null;
  try {
    object = await env.ARTIFACTS.get(catalog.manifestKey);
  } catch (error) {
    console.error("Registered map manifest fetch failed.", {
      error,
      manifestKey: catalog.manifestKey,
    });
    return errorJson(502, "The registered map manifest could not be fetched.");
  }
  if (object === null) {
    return errorJson(502, "The registered map manifest is unavailable.");
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await object.arrayBuffer();
  } catch (error) {
    console.error("Registered map manifest body read failed.", {
      error,
      manifestKey: catalog.manifestKey,
    });
    return errorJson(502, "The registered map manifest body could not be read.");
  }
  const actualSha256 = await sha256Hex(bytes);
  if (actualSha256 !== catalog.manifestSha256) {
    return errorJson(502, "The registered map manifest failed integrity verification.");
  }

  let manifest: {
    schemaVersion?: unknown;
    artifactKind?: unknown;
    releaseId?: unknown;
    publishedAt?: unknown;
    coverage?: unknown;
    releaseProfile?: unknown;
    buildStatus?: unknown;
    verificationStatus?: unknown;
    routeFacts?: unknown;
    sources?: unknown;
    layers?: unknown;
    routeUniverse?: unknown;
    status?: unknown;
    artifactCount?: unknown;
    routeSegmentArtifactCount?: unknown;
    totalFeatureCount?: unknown;
    totalByteLength?: unknown;
    issueCount?: unknown;
    artifacts?: Array<{
      artifactKind?: unknown;
      artifactKey?: unknown;
      contentType?: unknown;
      byteLength?: unknown;
      gzipByteLength?: unknown;
      sha256?: unknown;
      featureCount?: unknown;
      coordinateCount?: unknown;
      routeId?: unknown;
    }>;
  };

  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return errorJson(502, "The registered map manifest has an invalid contract.");
    }
    if (
      !hasExactKeys(value as Record<string, unknown>, mapArtifactManifestKeys) ||
      !Array.isArray((value as { artifacts?: unknown }).artifacts) ||
      !(value as { artifacts: unknown[] }).artifacts.every(
        (artifact) =>
          typeof artifact === "object" &&
          artifact !== null &&
          !Array.isArray(artifact) &&
          hasExactKeys(artifact as Record<string, unknown>, mapArtifactEntryKeys),
      )
    ) {
      return errorJson(502, "The registered map manifest has an invalid v2 shape.");
    }
    manifest = value as typeof manifest;
  } catch {
    return errorJson(502, "The registered map manifest is not valid JSON.");
  }

  if (manifest.artifactKind !== "map_artifact_manifest") {
    return errorJson(502, "The registered map manifest has an invalid artifact kind.");
  }

  const response = decodeSchemaEitherStrict(MapManifestResponseSchema, {
    schemaVersion: manifest.schemaVersion,
    releaseId: manifest.releaseId,
    publishedAt: manifest.publishedAt,
    coverage: manifest.coverage,
    releaseProfile: manifest.releaseProfile,
    buildStatus: manifest.buildStatus,
    verificationStatus: manifest.verificationStatus,
    routeFacts: manifest.routeFacts,
    sources: manifest.sources,
    layers: manifest.layers,
    routeUniverse: manifest.routeUniverse,
    status: manifest.status,
    artifactCount: manifest.artifactCount,
    routeSegmentArtifactCount: manifest.routeSegmentArtifactCount,
    totalFeatureCount: manifest.totalFeatureCount,
    totalByteLength: manifest.totalByteLength,
    issueCount: manifest.issueCount,
    artifacts: Array.isArray(manifest.artifacts)
      ? manifest.artifacts.map((artifact) => ({
          artifactKind: artifact.artifactKind,
          artifactKey: artifact.artifactKey,
          contentType: artifact.contentType,
          byteLength: artifact.byteLength,
          gzipByteLength: artifact.gzipByteLength,
          sha256: artifact.sha256,
          featureCount: artifact.featureCount,
          coordinateCount: artifact.coordinateCount,
          routeId: artifact.routeId,
          apiPath:
            typeof artifact.artifactKey === "string" ? artifactApiPath(artifact.artifactKey) : "",
        }))
      : manifest.artifacts,
    quality: {
      releaseLayer: "observed_release",
      completenessStatus: "complete",
      confidence: "high",
      caveats: [
        "Map payloads are verified generated artifacts served from R2; the manifest carries coverage metadata and fetch paths.",
      ],
    },
  });
  if (Result.isFailure(response)) {
    return errorJson(502, "The registered map manifest has an invalid v2 contract.");
  }

  const value = response.success;
  const routeCount = value.routeUniverse.expectedRouteIds.length;
  const identityMatches =
    value.releaseId === catalog.releaseId &&
    value.publishedAt === catalog.publishedAt &&
    value.coverage.start === catalog.coverage.start &&
    value.coverage.end === catalog.coverage.end;
  const publicationMatches =
    value.releaseProfile === catalog.releaseProfile &&
    value.verificationStatus === catalog.verificationStatus &&
    value.releaseProfile === "full" &&
    value.buildStatus === "pass" &&
    value.verificationStatus === "pass" &&
    value.status === "pass" &&
    value.issueCount === 0;
  const routeCountsMatch =
    routeCount === catalog.routeCount &&
    value.routeFacts.status === "available" &&
    value.routeFacts.routeCount >= catalog.routeCount &&
    hasExactUniqueMembers(
      value.routeUniverse.routeFactRouteIds,
      value.routeUniverse.expectedRouteIds,
    );
  if (!identityMatches || !publicationMatches || !routeCountsMatch) {
    return errorJson(502, "The registered map manifest does not match its catalog record.");
  }

  return json(value);
}

async function buildArtifactResponse(url: URL, env: StudioApiEnv): Promise<Response> {
  if (env.ARTIFACTS === undefined) {
    return dependencyNotConfigured("ARTIFACTS", "artifact passthrough");
  }

  const prefix = "/api/v1/artifacts/";
  const rawKey = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
  const key = decodeArtifactKey(rawKey);

  if (key === null || !isValidArtifactKey(key)) {
    return errorJson(400, "Artifact key is invalid.");
  }

  const object = await env.ARTIFACTS.get(key);
  if (object === null) {
    return errorJson(404, "Artifact was not found.");
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set(
    "Cache-Control",
    isContentAddressedArtifactKey(key)
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300, stale-while-revalidate=3600",
  );
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/octet-stream");
  }

  return new Response(object.body, { headers });
}

export function isContentAddressedArtifactKey(key: string): boolean {
  const filename = key.split("/").at(-1) ?? "";
  return /^.+\.[a-f0-9]{64}\.[^.]+$/.test(filename);
}

async function buildHotspotListResponse(url: URL, env: StudioApiEnv): Promise<Response> {
  if (env.DB === undefined) {
    return dependencyNotConfigured("DB", "hotspot list");
  }

  const month = releaseStatusMonth(url, env);
  if (month === null) {
    return errorJson(400, "Query parameter month or BASELINE_MONTH must use YYYY-MM format.");
  }

  const limit = parseLimit(url, 50, 250);
  if (limit === null) {
    return errorJson(400, "Query parameter limit must be a positive integer.");
  }

  const corridors = await listCorridorSummaries(createD1ServingDb(env.DB), month);
  const hotspots = corridors
    .flatMap((corridor) =>
      corridor.topHotspots.map((hotspot) => ({
        corridorId: corridor.corridorId,
        corridorName: corridor.corridorName,
        routeId: hotspot.route_id,
        month: hotspot.month,
        rank: hotspot.corridor_hotspot_rank,
        routeHotspotRank: hotspot.route_hotspot_rank,
        fromStopName: hotspot.from_stop_name,
        toStopName: hotspot.to_stop_name,
        averageSpeedMph: hotspot.weighted_average_speed_mph,
        hotspotScore: hotspot.hotspot_score,
        riderImpactScore: hotspot.rider_impact_score,
        quality: {
          releaseLayer: "baseline_release" as const,
          completenessStatus: "complete" as const,
          confidence: "high" as const,
          caveats: ["Hotspots are precomputed from the canonical monthly public speed release."],
        },
      })),
    )
    .sort((left, right) => {
      const impactDelta = (right.riderImpactScore ?? -1) - (left.riderImpactScore ?? -1);
      return (
        impactDelta ||
        right.hotspotScore - left.hotspotScore ||
        left.averageSpeedMph - right.averageSpeedMph ||
        left.routeId.localeCompare(right.routeId)
      );
    })
    .slice(0, limit)
    .map((hotspot, index) => ({ ...hotspot, rank: index + 1 }));

  return json(
    decodeSchemaStrict(HotspotListResponseSchema, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      baselineMonth: month,
      hotspots,
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: "complete",
        confidence: "high",
        caveats: [
          "Hotspot cards are generated monthly evidence, not live GTFS-RT current-state claims.",
        ],
      },
    }),
  );
}

export async function handlePublicApiRoutes(url: URL, env: StudioApiEnv): Promise<Response | null> {
  if (url.pathname === "/api/v1/status") {
    return buildReleaseStatusResponse(url, env);
  }

  if (url.pathname === "/api/v1/routes") {
    return buildRouteListResponse(url, env);
  }

  if (url.pathname.match(/^\/api\/v1\/routes\/[^/]+\/profile$/)) {
    return buildRouteProfileResponse(url, env);
  }

  if (url.pathname === "/api/v1/map/manifest") {
    return buildMapManifestResponse(url, env);
  }

  if (url.pathname.startsWith("/api/v1/artifacts/")) {
    return buildArtifactResponse(url, env);
  }

  if (url.pathname === "/api/v1/hotspots") {
    return buildHotspotListResponse(url, env);
  }

  if (url.pathname.match(/^\/api\/routes\/[^/]+\/scorecard$/)) {
    return buildRouteScorecardResponse(url, env);
  }

  return null;
}
