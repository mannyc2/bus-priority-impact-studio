import {
  createD1ServingDb,
  findEarliestSpeedTrendMonth,
  findLatestCurrentObservedMonthExcluding,
  findLatestObservedMonthExcluding,
  findLatestPublishedStudioServingRelease,
  findLatestVerifiedFullMapRelease,
  getRouteBatchStatus,
  listCurrentObservedReliabilitySummaries,
  listRouteObservedReliabilitySummaries,
  resolvePublicArtifactForRelease,
} from "@bp/db/d1";
import { isSafeArtifactKey, MapManifestResponseSchema } from "@bp/domain/maps";
import { ReleaseStatusResponseSchema } from "@bp/domain/routes";
import {
  type ReleaseIdentity,
  ReleaseIdentitySchema,
  releaseIdFromPublishedAt,
} from "@bp/domain/studio/shared";
import { Result } from "effect";
import { loadReleaseArtifact, PLAN097_RECOVERY_NAMESPACE } from "./artifact-resolver.js";
import type { StudioApiEnv } from "./env.js";
import { errorResponse as errorJson } from "./http/errors.js";
import { jsonResponse as json } from "./http/json.js";
import { SERVICE_DEPENDENCY_NOT_CONFIGURED_MESSAGE } from "./http/messages.js";
import {
  decodeSchemaEitherStrict,
  decodeSchemaStrict,
  schemaErrorIssues,
} from "./schema-decode.js";
import { pointedReleaseIdentity } from "./serving-request-context.js";

function dependencyNotConfigured(dependency: string, context: string): Response {
  console.error("Service dependency is not configured.", { context, dependency });
  return errorJson(503, SERVICE_DEPENDENCY_NOT_CONFIGURED_MESSAGE);
}

async function resolvePublicServingRelease(
  db: ReturnType<typeof createD1ServingDb>,
  env: StudioApiEnv,
): Promise<ReleaseIdentity | null> {
  const pointed = pointedReleaseIdentity(env);
  if (pointed !== null) return decodeSchemaStrict(ReleaseIdentitySchema, pointed);
  const [publishedRelease, coverageStart] = await Promise.all([
    findLatestPublishedStudioServingRelease(db),
    findEarliestSpeedTrendMonth(db),
  ]);
  if (publishedRelease === null) {
    return null;
  }
  try {
    return decodeSchemaStrict(ReleaseIdentitySchema, {
      releaseId: releaseIdFromPublishedAt(publishedRelease.publishedAt),
      publishedAt: publishedRelease.publishedAt,
      coverage: { start: coverageStart, end: publishedRelease.end },
    });
  } catch {
    return null;
  }
}

const NO_PUBLISHED_SERVING_DATA_MESSAGE = "No published serving data is available.";

function artifactApiPath(releaseId: string, key: string): string {
  return `/api/v1/releases/${encodeURIComponent(releaseId)}/artifacts/${key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function legacyArtifactApiPath(key: string): string {
  return `/api/v1/artifacts/${key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function rawReleaseIdentityMatches(value: unknown, expected: ReleaseIdentity): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    releaseId?: unknown;
    publishedAt?: unknown;
    coverage?: unknown;
  };
  if (typeof candidate.coverage !== "object" || candidate.coverage === null) return false;
  const coverage = candidate.coverage as { start?: unknown; end?: unknown };
  return (
    candidate.releaseId === expected.releaseId &&
    candidate.publishedAt === expected.publishedAt &&
    coverage.start === expected.coverage.start &&
    coverage.end === expected.coverage.end
  );
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

function countReliabilityRoutes(rows: readonly ObservedReliabilityRow[]): {
  routeCount: number;
  observedRouteCount: number;
  insufficientRouteCount: number;
} {
  const routeIds = new Set<string>();
  const observedRouteIds = new Set<string>();
  const insufficientRouteIds = new Set<string>();

  for (const row of rows) {
    routeIds.add(row.routeId);
    if (row.reliabilityStatus === "observed") {
      observedRouteIds.add(row.routeId);
      insufficientRouteIds.delete(row.routeId);
    } else if (!observedRouteIds.has(row.routeId)) {
      insufficientRouteIds.add(row.routeId);
    }
  }

  return {
    routeCount: routeIds.size,
    observedRouteCount: observedRouteIds.size,
    insufficientRouteCount: insufficientRouteIds.size,
  };
}

async function buildReleaseStatusResponse(env: StudioApiEnv): Promise<Response> {
  if (env.DB === undefined) {
    return dependencyNotConfigured("DB", "release status");
  }

  const db = createD1ServingDb(env.DB);
  const currentSignalDb = createD1ServingDb(env.SERVING_UNSCOPED_DB ?? env.DB);
  const pointed = env.SERVING_RELEASE_CONTEXT !== undefined;
  const datasets =
    env.SERVING_RELEASE_CONTEXT?.candidate.datasets.map((dataset) => ({
      datasetId: dataset.datasetId,
      grain: dataset.grain,
      coverage: dataset.coverage,
    })) ?? [];
  const release = await resolvePublicServingRelease(db, env);
  if (release === null) {
    return errorJson(503, NO_PUBLISHED_SERVING_DATA_MESSAGE);
  }
  const month = release.coverage.end;
  const [batchStatus, reliability, currentSignalMonth] = await Promise.all([
    getRouteBatchStatus(db, month),
    listRouteObservedReliabilitySummaries(db, month),
    pointed
      ? findLatestCurrentObservedMonthExcluding(currentSignalDb, month)
      : findLatestObservedMonthExcluding(db, month),
  ]);

  if (batchStatus === null) {
    return errorJson(503, NO_PUBLISHED_SERVING_DATA_MESSAGE);
  }

  const releaseRouteIds = new Set(batchStatus.builtRouteIds);
  const releaseReliability = reliability.filter((row) => releaseRouteIds.has(row.routeId));
  const observedRows = releaseReliability.filter((row) => row.reliabilityStatus === "observed");
  const reliabilityCounts = countReliabilityRoutes(releaseReliability);
  const runIds = [...new Set(observedRows.map((row) => row.runId))].sort();
  const runId = runIds.length === 1 ? (runIds[0] ?? null) : null;
  const observedRouteCount = reliabilityCounts.observedRouteCount;
  const sampleCount = releaseReliability.reduce((sum, row) => sum + row.sampleCount, 0);
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
        ? observedRouteCount > 0
          ? [
              "Multiple observed reliability runs cover the release month; aggregate route coverage has ambiguous provenance.",
            ]
          : ["No observed realtime evidence is attached to this release."]
        : ["Observed realtime evidence comes from self-collected MTA Bus Time GTFS-RT snapshots."];

  const currentObservedSignal = currentSignalMonth
    ? await buildCurrentObservedSignal(currentSignalDb, currentSignalMonth, pointed)
    : null;

  return json(
    decodeSchemaStrict(ReleaseStatusResponseSchema, {
      schemaVersion: 1,
      generatedAt: batchStatus.generatedAt,
      ...release,
      datasets,
      currentSignalMonth: currentObservedSignal?.month ?? null,
      release: {
        ...release,
        status: batchStatus.status,
        routeCount: batchStatus.routeCount,
        artifactCount: batchStatus.artifactCount,
        issueCount: batchStatus.issueCount,
      },
      observedRealtimeEvidence: {
        runId,
        source,
        observedRouteCount,
        insufficientRouteCount: reliabilityCounts.insufficientRouteCount,
        sampleCount,
        routeCoverageShare,
      },
      currentObservedSignal,
      quality: {
        releaseLayer: observedRouteCount > 0 ? "observed_release" : "published_release",
        completenessStatus:
          batchStatus.status === "pass" ? "complete" : "partial_public_speed_only",
        confidence: source === "third_party_recovered" ? "medium" : "high",
        caveats,
      },
    }),
  );
}

async function buildCurrentObservedSignal(
  db: ReturnType<typeof createD1ServingDb>,
  month: string,
  splitCurrentSignal: boolean,
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
  const rows = splitCurrentSignal
    ? await listCurrentObservedReliabilitySummaries(db, month)
    : await listRouteObservedReliabilitySummaries(db, month);
  const reliabilityCounts = countReliabilityRoutes(rows);
  const runIds = [...new Set(rows.map((row) => row.runId))].sort();
  const runId = runIds.length === 1 ? (runIds[0] ?? null) : null;
  const source = realtimeSourceForRunId(runId);
  const sampleCount = rows.reduce((sum, row) => sum + row.sampleCount, 0);
  const caveats =
    source === "third_party_recovered"
      ? [
          "Current observed signal is recovered from the third-party Bus Observatory archive, not official MTA historical replay.",
          "The monthly public speed dataset has not published this month yet; reliability evidence stands alone.",
        ]
      : source === "official_self_collected"
        ? [
            "Current observed signal comes from self-collected MTA Bus Time GTFS-RT snapshots.",
            "The monthly public speed dataset has not published this month yet; reliability evidence stands alone.",
          ]
        : ["Current observed signal has ambiguous provenance; multiple runs cover the same month."];
  return {
    month,
    runId,
    source,
    releaseLayer: "current_signal",
    routeCount: reliabilityCounts.routeCount,
    observedRouteCount: reliabilityCounts.observedRouteCount,
    insufficientRouteCount: reliabilityCounts.insufficientRouteCount,
    sampleCount,
    caveats,
  };
}

async function buildMapManifestResponse(_url: URL, env: StudioApiEnv): Promise<Response> {
  if (env.DB === undefined) {
    return dependencyNotConfigured("DB", "map release catalog");
  }
  if (env.ARTIFACTS === undefined) {
    return dependencyNotConfigured("ARTIFACTS", "map manifest");
  }

  let catalog: Awaited<ReturnType<typeof findLatestVerifiedFullMapRelease>>;
  let studioRelease: ReleaseIdentity | null;
  try {
    const db = createD1ServingDb(env.DB);
    [catalog, studioRelease] = await Promise.all([
      findLatestVerifiedFullMapRelease(db),
      resolvePublicServingRelease(db, env),
    ]);
  } catch (error) {
    console.error("Map release catalog query failed.", { error });
    return errorJson(503, "The verified map release catalog is unavailable.");
  }
  if (catalog === null) {
    return errorJson(503, "No verified full map release is registered.");
  }
  if (
    studioRelease === null ||
    (env.SERVING_RELEASE_CONTEXT === undefined && catalog.releaseId !== studioRelease.releaseId)
  ) {
    return errorJson(503, "The verified map release does not match the active Studio release.");
  }

  let object: R2ObjectBody | null;
  try {
    object = await loadReleaseArtifact(env, catalog.manifestKey);
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

  if (!rawReleaseIdentityMatches(manifest, catalog)) {
    return errorJson(502, "The registered map manifest does not match its catalog record.");
  }
  if (
    typeof manifest.routeFacts === "object" &&
    manifest.routeFacts !== null &&
    (manifest.routeFacts as { status?: unknown }).status === "available" &&
    !rawReleaseIdentityMatches(manifest.routeFacts, catalog)
  ) {
    return errorJson(502, "The registered map manifest has an invalid v2 contract.");
  }

  const pointed = env.SERVING_RELEASE_CONTEXT !== undefined;
  const routeFacts =
    pointed &&
    typeof manifest.routeFacts === "object" &&
    manifest.routeFacts !== null &&
    (manifest.routeFacts as { status?: unknown }).status === "available"
      ? {
          ...manifest.routeFacts,
          releaseId: studioRelease.releaseId,
          publishedAt: studioRelease.publishedAt,
          coverage: studioRelease.coverage,
        }
      : manifest.routeFacts;

  const response = decodeSchemaEitherStrict(MapManifestResponseSchema, {
    schemaVersion: manifest.schemaVersion,
    releaseId: pointed ? studioRelease.releaseId : manifest.releaseId,
    publishedAt: pointed ? studioRelease.publishedAt : manifest.publishedAt,
    coverage: pointed ? studioRelease.coverage : manifest.coverage,
    releaseProfile: manifest.releaseProfile,
    buildStatus: manifest.buildStatus,
    verificationStatus: manifest.verificationStatus,
    routeFacts,
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
            typeof artifact.artifactKey === "string"
              ? pointed
                ? artifactApiPath(studioRelease.releaseId, artifact.artifactKey)
                : legacyArtifactApiPath(artifact.artifactKey)
              : "",
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
    console.error("Registered map manifest response failed strict decoding.", {
      issues: schemaErrorIssues(response.failure),
      releaseId: studioRelease.releaseId,
      coverage: studioRelease.coverage,
      routeFactsRelease:
        typeof manifest.routeFacts === "object" && manifest.routeFacts !== null
          ? {
              releaseId: (manifest.routeFacts as { releaseId?: unknown }).releaseId,
              publishedAt: (manifest.routeFacts as { publishedAt?: unknown }).publishedAt,
              coverage: (manifest.routeFacts as { coverage?: unknown }).coverage,
            }
          : null,
    });
    return errorJson(502, "The registered map manifest has an invalid v2 contract.");
  }

  const value = response.success;
  const routeCount = value.routeUniverse.expectedRouteIds.length;
  const expectedIdentity = pointed ? studioRelease : catalog;
  const identityMatches =
    value.releaseId === expectedIdentity.releaseId &&
    value.publishedAt === expectedIdentity.publishedAt &&
    value.coverage.start === expectedIdentity.coverage.start &&
    value.coverage.end === expectedIdentity.coverage.end;
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

function artifactBodyResponse(object: R2ObjectBody): Response {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/octet-stream");
  return new Response(object.body, { headers });
}

async function buildLegacyArtifactResponse(url: URL, env: StudioApiEnv): Promise<Response> {
  if (env.ARTIFACTS === undefined) {
    return dependencyNotConfigured("ARTIFACTS", "artifact passthrough");
  }

  const prefix = "/api/v1/artifacts/";
  const rawKey = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
  const key = decodeArtifactKey(rawKey);

  if (key === null || !isValidArtifactKey(key)) {
    return errorJson(400, "Artifact key is invalid.");
  }
  if (key.startsWith(PLAN097_RECOVERY_NAMESPACE)) {
    return errorJson(404, "Artifact was not found.");
  }
  const pointed = env.SERVING_RELEASE_CONTEXT;
  if (pointed !== undefined) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: artifactApiPath(pointed.release.releaseId, key),
        "Cache-Control": "no-store",
      },
    });
  }

  const object = await loadReleaseArtifact(env, key);
  if (object === null) {
    return errorJson(404, "Artifact was not found.");
  }

  const response = artifactBodyResponse(object);
  if (!isContentAddressedArtifactKey(key)) {
    response.headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  }
  return response;
}

async function buildReleaseArtifactResponse(url: URL, env: StudioApiEnv): Promise<Response> {
  if (env.ARTIFACTS === undefined || env.SERVING_UNSCOPED_DB === undefined) {
    return dependencyNotConfigured("ARTIFACTS/DB", "release-qualified artifact");
  }
  const match = /^\/api\/v1\/releases\/([^/]+)\/artifacts\/(.+)$/u.exec(url.pathname);
  const rawReleaseId = match?.[1];
  const rawLogicalId = match?.[2];
  if (rawReleaseId === undefined || rawLogicalId === undefined) {
    return errorJson(404, "Artifact was not found.");
  }
  let releaseId: string;
  try {
    releaseId = decodeURIComponent(rawReleaseId);
  } catch {
    return errorJson(400, "Release ID is invalid.");
  }
  const logicalId = decodeArtifactKey(rawLogicalId);
  if (logicalId === null || !isValidArtifactKey(logicalId)) {
    return errorJson(400, "Artifact key is invalid.");
  }
  const artifact = await resolvePublicArtifactForRelease(
    env.SERVING_UNSCOPED_DB,
    releaseId,
    logicalId,
  );
  if (artifact === null) return errorJson(404, "Artifact was not found.");
  const object = await env.ARTIFACTS.get(artifact.key);
  if (object === null || object.size !== artifact.bytes) {
    return errorJson(502, "Published artifact is unavailable or corrupt.");
  }
  const { sha256: metadataSha256 } = object.customMetadata ?? {};
  if (metadataSha256 !== artifact.sha256) {
    return errorJson(502, "Published artifact failed integrity verification.");
  }
  return artifactBodyResponse(object);
}

export function isContentAddressedArtifactKey(key: string): boolean {
  const filename = key.split("/").at(-1) ?? "";
  return /^.+\.[a-f0-9]{64}\.[^.]+$/.test(filename);
}

export async function handlePublicApiRoutes(url: URL, env: StudioApiEnv): Promise<Response | null> {
  if (url.pathname === "/api/v1/status") {
    return buildReleaseStatusResponse(env);
  }

  if (url.pathname === "/api/v1/map/manifest") {
    return buildMapManifestResponse(url, env);
  }

  if (url.pathname.startsWith("/api/v1/artifacts/")) {
    return buildLegacyArtifactResponse(url, env);
  }

  if (url.pathname.startsWith("/api/v1/releases/")) {
    return buildReleaseArtifactResponse(url, env);
  }

  return null;
}
