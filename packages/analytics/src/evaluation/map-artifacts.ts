import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  MAP_LAYER_CONTRACTS,
  MapBusLaneFeatureCollectionSchema,
  MapContextFeatureCollectionSchema,
  type MapCurrencyEvidence,
  type MapLayerStatus,
  MapNetworkFeatureCollectionSchema,
  type MapRouteUniverse,
  MapRouteSegmentFeatureCollectionSchema,
  type MapSourceStatus,
} from "@bp/domain/maps";
import { Result } from "effect";
import { decodeSchemaEitherStrict } from "../schema-decode.js";

export const MAP_ARTIFACT_SCHEMA_VERSION = 1;
export const MAP_ARTIFACT_JSON_CONTENT_TYPE = "application/json" as const;
export const MAP_ARTIFACT_GEOJSON_CONTENT_TYPE = "application/geo+json" as const;

export const MAP_LAYER_REGISTRY = MAP_LAYER_CONTRACTS;

export type MapLayerId = keyof typeof MAP_LAYER_REGISTRY;
export type MapCurrencyStatus =
  | "current"
  | "stale"
  | "period_aligned"
  | "revision_pinned"
  | "unknown";

export type MapCurrencyResult = { status: MapCurrencyStatus; reason: string };

export function evaluateMaxAgeSnapshotCurrency(input: {
  fetchedAt: string | null;
  evaluatedAt: string;
  maxAgeDays?: 45 | undefined;
}): MapCurrencyResult & { ageDays: number | null; maxAgeDays: 45 } {
  const maxAgeDays = input.maxAgeDays ?? 45;
  const evaluatedAt = Date.parse(input.evaluatedAt);
  const fetchedAt = input.fetchedAt === null ? Number.NaN : Date.parse(input.fetchedAt);
  if (!Number.isFinite(evaluatedAt) || !Number.isFinite(fetchedAt)) {
    return {
      status: "unknown",
      reason: "Snapshot timestamp evidence is missing or invalid.",
      ageDays: null,
      maxAgeDays,
    };
  }
  const ageMs = evaluatedAt - fetchedAt;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (ageMs < 0) {
    return {
      status: "unknown",
      reason: "Snapshot timestamp is later than its currency evaluation.",
      ageDays,
      maxAgeDays,
    };
  }
  const current = ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
  return {
    status: current ? "current" : "stale",
    reason: current
      ? `Snapshot age ${ageDays.toFixed(3)} days is within the ${maxAgeDays}-day limit.`
      : `Snapshot age ${ageDays.toFixed(3)} days exceeds the ${maxAgeDays}-day limit.`,
    ageDays,
    maxAgeDays,
  };
}

export function evaluateAnalysisPeriodCurrency(input: {
  baselineMonth: string;
  releaseMonth: string;
  coveragePassed: boolean;
}): MapCurrencyResult {
  if (input.baselineMonth !== input.releaseMonth) {
    return {
      status: "stale",
      reason: `Analysis period ${input.baselineMonth} does not match release month ${input.releaseMonth}.`,
    };
  }
  return input.coveragePassed
    ? { status: "period_aligned", reason: `Analysis evidence covers ${input.releaseMonth}.` }
    : { status: "unknown", reason: `Analysis coverage for ${input.releaseMonth} did not pass.` };
}

export function evaluateRevisionPinnedCurrency(input: {
  embeddedSha256: string | null;
  sourceSha256: string | null;
}): MapCurrencyResult {
  if (input.embeddedSha256 === null || input.sourceSha256 === null) {
    return { status: "unknown", reason: "Source revision hash evidence is unavailable." };
  }
  return input.embeddedSha256 === input.sourceSha256
    ? { status: "revision_pinned", reason: "Derived context matches the captured source revision." }
    : { status: "stale", reason: "Derived context does not match the captured source revision." };
}

export function evaluateMapCurrencyEvidence(
  evidence: MapCurrencyEvidence,
  releaseMonth: string,
): MapCurrencyResult {
  switch (evidence.policy) {
    case "max_age_snapshot":
      return evaluateMaxAgeSnapshotCurrency({
        fetchedAt: evidence.fetchedAt,
        evaluatedAt: evidence.evaluatedAt,
        maxAgeDays: evidence.maxAgeDays,
      });
    case "analysis_period":
      return evaluateAnalysisPeriodCurrency({
        baselineMonth: evidence.baselineMonth,
        releaseMonth,
        coveragePassed: evidence.coveragePassed,
      });
    case "revision_pinned":
      return evaluateRevisionPinnedCurrency({
        embeddedSha256: evidence.embeddedSha256,
        sourceSha256: evidence.sourceSha256,
      });
  }
}

export const MAP_ARTIFACT_BUDGETS = {
  network: { rawBytes: 4_610_607, gzipBytes: 400_000, features: 400, coordinates: 60_000 },
  routeFacts: { rawBytes: 600_000, gzipBytes: 100_000, routes: 400 },
  busLanes: { rawBytes: 1_700_000, gzipBytes: 85_000, features: 3_200 },
} as const;

export function mapBudgetIssues(input: {
  kind: "network" | "routeFacts" | "busLanes";
  rawBytes: number;
  gzipBytes: number;
  features?: number | undefined;
  coordinates?: number | undefined;
  routes?: number | undefined;
}): string[] {
  const budget = MAP_ARTIFACT_BUDGETS[input.kind];
  const issues: string[] = [];
  if (input.rawBytes > budget.rawBytes)
    issues.push(`raw bytes ${input.rawBytes} > ${budget.rawBytes}`);
  if (input.gzipBytes > budget.gzipBytes)
    issues.push(`gzip bytes ${input.gzipBytes} > ${budget.gzipBytes}`);
  if ("features" in budget && (input.features ?? 0) > budget.features)
    issues.push(`features ${input.features ?? 0} > ${budget.features}`);
  if ("coordinates" in budget && (input.coordinates ?? 0) > budget.coordinates)
    issues.push(`coordinates ${input.coordinates ?? 0} > ${budget.coordinates}`);
  if ("routes" in budget && (input.routes ?? 0) > budget.routes)
    issues.push(`routes ${input.routes ?? 0} > ${budget.routes}`);
  return issues;
}

export type MapArtifactKind =
  | "map_source_snapshot"
  | "map_route_shapes_geojson"
  | "map_timepoint_stops_geojson"
  | "map_borough_context_geojson"
  | "map_bus_lanes_geojson"
  | "map_network_simplified_geojson"
  | "map_route_segments_geojson";

export type MapArtifactEntry = {
  artifactKind: MapArtifactKind;
  artifactKey: string;
  contentType: typeof MAP_ARTIFACT_JSON_CONTENT_TYPE | typeof MAP_ARTIFACT_GEOJSON_CONTENT_TYPE;
  byteLength: number;
  gzipByteLength: number;
  sha256: string;
  featureCount: number;
  coordinateCount: number;
  routeId: string | null;
};

export type MapArtifactManifest = {
  schemaVersion: typeof MAP_ARTIFACT_SCHEMA_VERSION;
  artifactKind: "map_artifact_manifest";
  analysisPeriod: string;
  generatedAt: string;
  releaseProfile: "demo" | "full";
  buildStatus: "pass" | "fail";
  verificationStatus: "not_run" | "pass" | "fail";
  routeFacts:
    | {
        status: "available";
        artifactKey: string;
        sha256: string;
        schemaVersion: 1;
        baselineMonth: string;
        routeCount: number;
        byteLength: number;
        gzipByteLength: number;
      }
    | { status: "unavailable"; reason: string };
  sources: MapSourceStatus[];
  layers: MapLayerStatus[];
  routeUniverse: MapRouteUniverse;
  status: "pass" | "fail";
  artifactCount: number;
  routeSegmentArtifactCount: number;
  totalFeatureCount: number;
  totalByteLength: number;
  issueCount: number;
  artifacts: MapArtifactEntry[];
};

export type MapArtifactIssue = {
  code: string;
  message: string;
  artifactKey?: string;
};

export type MapArtifactVerification = {
  status: "pass" | "fail";
  manifestPath: string;
  artifactCount: number;
  routeSegmentArtifactCount: number;
  totalFeatureCount: number;
  totalByteLength: number;
  issueCount: number;
  issues: MapArtifactIssue[];
};

export type MapJsonArtifact = {
  bytes: Uint8Array;
  entry: MapArtifactEntry;
};

type ManifestCandidate = {
  schemaVersion?: unknown;
  artifactKind?: unknown;
  analysisPeriod?: unknown;
  generatedAt?: unknown;
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
  artifacts?: unknown;
};

export function mapArtifactSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function coordinateCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    return 1;
  }
  return value.reduce((sum, member) => sum + coordinateCount(member), 0);
}

function payloadCoordinateCount(payload: unknown): number {
  if (!isJsonObject(payload) || !Array.isArray(payload["features"])) return 0;
  return payload["features"].reduce((sum, feature) => {
    if (!isJsonObject(feature) || !isJsonObject(feature["geometry"])) return sum;
    return sum + coordinateCount(feature["geometry"]["coordinates"]);
  }, 0);
}

export function buildMapJsonArtifact(input: {
  artifactKey: string;
  artifactKind: MapArtifactKind;
  contentType: typeof MAP_ARTIFACT_JSON_CONTENT_TYPE | typeof MAP_ARTIFACT_GEOJSON_CONTENT_TYPE;
  routeId: string | null;
  payload: unknown;
  featureCount: number;
}): MapJsonArtifact {
  const bytes = new TextEncoder().encode(`${JSON.stringify(input.payload, null, 2)}\n`);
  return {
    bytes,
    entry: {
      artifactKind: input.artifactKind,
      artifactKey: input.artifactKey,
      contentType: input.contentType,
      byteLength: bytes.byteLength,
      gzipByteLength: gzipSync(bytes, { level: 9 }).byteLength,
      sha256: mapArtifactSha256(bytes),
      featureCount: input.featureCount,
      coordinateCount: payloadCoordinateCount(input.payload),
      routeId: input.routeId,
    },
  };
}

export function buildMapArtifactManifest(input: {
  month: string;
  generatedAt: string;
  artifacts: readonly MapArtifactEntry[];
  releaseProfile: "demo" | "full";
  routeFacts: MapArtifactManifest["routeFacts"];
  sources: readonly MapSourceStatus[];
  layers: readonly MapLayerStatus[];
  routeUniverse: MapRouteUniverse;
}): MapArtifactManifest {
  const artifacts = [...input.artifacts];
  const routeSegmentArtifactCount = artifacts.filter(
    (row) => row.artifactKind === "map_route_segments_geojson",
  ).length;
  return {
    schemaVersion: MAP_ARTIFACT_SCHEMA_VERSION,
    artifactKind: "map_artifact_manifest",
    analysisPeriod: input.month,
    generatedAt: input.generatedAt,
    releaseProfile: input.releaseProfile,
    buildStatus: "pass",
    verificationStatus: "not_run",
    routeFacts: input.routeFacts,
    sources: [...input.sources],
    layers: [...input.layers],
    routeUniverse: input.routeUniverse,
    status: "pass",
    artifactCount: artifacts.length,
    routeSegmentArtifactCount,
    totalFeatureCount: artifacts.reduce((sum, row) => sum + row.featureCount, 0),
    totalByteLength: artifacts.reduce((sum, row) => sum + row.byteLength, 0),
    issueCount: 0,
    artifacts,
  };
}

export function isMapArtifactManifest(value: unknown): value is MapArtifactManifest {
  if (!isJsonObject(value)) {
    return false;
  }

  const candidate = value as ManifestCandidate;
  return (
    candidate.schemaVersion === MAP_ARTIFACT_SCHEMA_VERSION &&
    candidate.artifactKind === "map_artifact_manifest" &&
    typeof candidate.analysisPeriod === "string" &&
    typeof candidate.generatedAt === "string" &&
    (candidate.releaseProfile === "demo" || candidate.releaseProfile === "full") &&
    (candidate.buildStatus === "pass" || candidate.buildStatus === "fail") &&
    (candidate.verificationStatus === "not_run" ||
      candidate.verificationStatus === "pass" ||
      candidate.verificationStatus === "fail") &&
    isJsonObject(candidate.routeFacts) &&
    Array.isArray(candidate.sources) &&
    Array.isArray(candidate.layers) &&
    isJsonObject(candidate.routeUniverse) &&
    (candidate.status === "pass" || candidate.status === "fail") &&
    typeof candidate.artifactCount === "number" &&
    typeof candidate.routeSegmentArtifactCount === "number" &&
    typeof candidate.totalFeatureCount === "number" &&
    typeof candidate.totalByteLength === "number" &&
    typeof candidate.issueCount === "number" &&
    Array.isArray(candidate.artifacts)
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function featureCountForPayload(payload: unknown): number | null {
  if (!isJsonObject(payload)) {
    return null;
  }
  const featurePayload = payload as { features?: unknown };
  const features = featurePayload.features;
  return Array.isArray(features) ? features.length : null;
}

export function mapArtifactPayloadIssues(input: {
  artifact: MapArtifactEntry;
  payload: unknown;
  month: string;
}): MapArtifactIssue[] {
  const issues: MapArtifactIssue[] = [];
  const expectedFeatureCount = featureCountForPayload(input.payload);
  if (input.artifact.artifactKind !== "map_source_snapshot" && expectedFeatureCount === null) {
    issues.push({
      code: "map_artifact_payload_features_missing",
      artifactKey: input.artifact.artifactKey,
      message: `Map artifact ${input.artifact.artifactKey} does not include a GeoJSON features array.`,
    });
  }
  if (expectedFeatureCount !== null && expectedFeatureCount !== input.artifact.featureCount) {
    issues.push({
      code: "map_artifact_payload_feature_count_mismatch",
      artifactKey: input.artifact.artifactKey,
      message: `Map artifact ${input.artifact.artifactKey} manifest featureCount is ${input.artifact.featureCount}, but payload has ${expectedFeatureCount}.`,
    });
  }
  if (input.artifact.artifactKind === "map_route_segments_geojson") {
    const result = decodeSchemaEitherStrict(MapRouteSegmentFeatureCollectionSchema, input.payload);
    if (Result.isFailure(result)) {
      issues.push({
        code: "map_route_segment_payload_invalid",
        artifactKey: input.artifact.artifactKey,
        message: `Map route-segment artifact ${input.artifact.artifactKey} failed the domain GeoJSON contract.`,
      });
    } else {
      const monthMismatches = result.success.features.filter(
        (feature) => feature.properties.month !== input.month,
      );
      if (monthMismatches.length > 0) {
        issues.push({
          code: "map_route_segment_payload_month_mismatch",
          artifactKey: input.artifact.artifactKey,
          message: `Map route-segment artifact ${input.artifact.artifactKey} has ${monthMismatches.length} feature(s) outside ${input.month}.`,
        });
      }
      const routeMismatches =
        input.artifact.routeId === null
          ? []
          : result.success.features.filter(
              (feature) => feature.properties.routeId !== input.artifact.routeId,
            );
      if (routeMismatches.length > 0) {
        issues.push({
          code: "map_route_segment_payload_route_mismatch",
          artifactKey: input.artifact.artifactKey,
          message: `Map route-segment artifact ${input.artifact.artifactKey} has ${routeMismatches.length} feature(s) for a different route.`,
        });
      }
    }
  }

  if (input.artifact.artifactKind === "map_network_simplified_geojson") {
    const result = decodeSchemaEitherStrict(MapNetworkFeatureCollectionSchema, input.payload);
    if (Result.isFailure(result)) {
      issues.push({
        code: "map_network_payload_invalid",
        artifactKey: input.artifact.artifactKey,
        message: `Map artifact ${input.artifact.artifactKey} failed its domain GeoJSON contract.`,
      });
    } else {
      const monthMismatches = result.success.features.filter(
        (feature) => feature.properties.month !== input.month,
      );
      if (monthMismatches.length > 0) {
        issues.push({
          code: "map_network_payload_month_mismatch",
          artifactKey: input.artifact.artifactKey,
          message: `Map network artifact ${input.artifact.artifactKey} has ${monthMismatches.length} feature(s) outside ${input.month}.`,
        });
      }
    }
    for (const issue of mapBudgetIssues({
      kind: "network",
      rawBytes: input.artifact.byteLength,
      gzipBytes: input.artifact.gzipByteLength,
      features: input.artifact.featureCount,
      coordinates: input.artifact.coordinateCount,
    })) {
      issues.push({
        code: "map_network_budget_exceeded",
        artifactKey: input.artifact.artifactKey,
        message: `Map network artifact ${input.artifact.artifactKey} exceeds its budget: ${issue}.`,
      });
    }
  }
  for (const [kind, schema, code] of [
    [
      "map_borough_context_geojson",
      MapContextFeatureCollectionSchema,
      "map_borough_context_payload_invalid",
    ],
    ["map_bus_lanes_geojson", MapBusLaneFeatureCollectionSchema, "map_bus_lane_payload_invalid"],
  ] as const) {
    if (input.artifact.artifactKind !== kind) continue;
    if (Result.isFailure(decodeSchemaEitherStrict(schema, input.payload))) {
      issues.push({
        code,
        artifactKey: input.artifact.artifactKey,
        message: `Map artifact ${input.artifact.artifactKey} failed its domain GeoJSON contract.`,
      });
    }
  }
  if (input.artifact.artifactKind === "map_bus_lanes_geojson") {
    for (const issue of mapBudgetIssues({
      kind: "busLanes",
      rawBytes: input.artifact.byteLength,
      gzipBytes: input.artifact.gzipByteLength,
      features: input.artifact.featureCount,
    })) {
      issues.push({
        code: "map_bus_lane_budget_exceeded",
        artifactKey: input.artifact.artifactKey,
        message: `Map bus-lane artifact ${input.artifact.artifactKey} exceeds its budget: ${issue}.`,
      });
    }
  }

  return issues;
}

export function verifyMapArtifactManifestContents(input: {
  manifestPath: string;
  month: string;
  manifest: MapArtifactManifest | null;
  expectedProfile?: "demo" | "full";
  expectedRouteIds?: readonly string[];
  artifactIssues?: readonly MapArtifactIssue[];
}): MapArtifactVerification {
  if (input.manifest === null) {
    return {
      status: "fail",
      manifestPath: input.manifestPath,
      artifactCount: 0,
      routeSegmentArtifactCount: 0,
      totalFeatureCount: 0,
      totalByteLength: 0,
      issueCount: 1,
      issues: [
        {
          code: "map_artifact_manifest_missing",
          message: `Missing or invalid map artifact manifest for ${input.month}.`,
        },
      ],
    };
  }

  const manifest = input.manifest;
  const issues: MapArtifactIssue[] = [];
  if (input.expectedProfile !== undefined && manifest.releaseProfile !== input.expectedProfile) {
    issues.push({
      code: "map_artifact_manifest_profile_mismatch",
      message: `Map artifact manifest profile is ${manifest.releaseProfile}, expected ${input.expectedProfile}.`,
    });
  }
  if (manifest.analysisPeriod !== input.month) {
    issues.push({
      code: "map_artifact_manifest_month_mismatch",
      message: `Map artifact manifest is for ${manifest.analysisPeriod}, expected ${input.month}.`,
    });
  }

  const acceptableCurrency = new Set(["current", "period_aligned", "revision_pinned"]);
  const layerIds = new Set(manifest.layers.map((layer) => layer.layerId));
  for (const [layerId, contract] of Object.entries(MAP_LAYER_REGISTRY)) {
    const matching = manifest.layers.filter((layer) => layer.layerId === layerId);
    if (matching.length !== 1) {
      issues.push({
        code: "map_layer_registry_coverage_invalid",
        message: `Map manifest must contain exactly one ${layerId} layer record; found ${matching.length}.`,
      });
      continue;
    }
    const layer = matching[0];
    if (
      layer === undefined ||
      layer.priority !== contract.priority ||
      layer.requiredForFull !== contract.requiredForFull
    ) {
      issues.push({
        code: "map_layer_registry_contract_mismatch",
        message: `Map layer ${layerId} does not match its fixed priority contract.`,
      });
      continue;
    }
    if (
      manifest.releaseProfile === "full" &&
      contract.requiredForFull &&
      (layer.readiness !== "available" || !acceptableCurrency.has(layer.currencyStatus))
    ) {
      issues.push({
        code: "map_required_layer_unpublishable",
        message: `Required ${layerId} layer is ${layer.readiness}/${layer.currencyStatus}: ${layer.reason}`,
      });
    }
    const evaluatedCurrency = evaluateMapCurrencyEvidence(layer.currency, input.month);
    if (layer.currencyStatus !== evaluatedCurrency.status) {
      issues.push({
        code: "map_layer_currency_mismatch",
        message: `Map layer ${layerId} declares ${layer.currencyStatus}, but its evidence evaluates to ${evaluatedCurrency.status}.`,
      });
    }
  }
  if (layerIds.size !== manifest.layers.length) {
    issues.push({
      code: "map_layer_registry_duplicate",
      message: "Map manifest contains duplicate layer records.",
    });
  }
  const sourceIds = new Set(manifest.sources.map((source) => source.sourceId));
  if (sourceIds.size !== manifest.sources.length) {
    issues.push({
      code: "map_source_registry_duplicate",
      message: "Map manifest contains duplicate source records.",
    });
  }
  for (const source of manifest.sources) {
    const evaluatedCurrency = evaluateMapCurrencyEvidence(source.currency, input.month);
    if (source.currencyStatus !== evaluatedCurrency.status) {
      issues.push({
        code: "map_source_currency_mismatch",
        message: `Map source ${source.sourceId} declares ${source.currencyStatus}, but its evidence evaluates to ${evaluatedCurrency.status}.`,
      });
    }
    if (
      manifest.releaseProfile === "full" &&
      source.requiredForFull &&
      (source.readiness !== "available" || !acceptableCurrency.has(source.currencyStatus))
    ) {
      issues.push({
        code: "map_required_source_unpublishable",
        message: `Required source ${source.sourceId} is ${source.readiness}/${source.currencyStatus}: ${source.reason}`,
      });
    }
  }
  for (const layer of manifest.layers) {
    const missingSources = layer.sourceIds.filter((sourceId) => !sourceIds.has(sourceId));
    if (missingSources.length > 0) {
      issues.push({
        code: "map_layer_source_reference_missing",
        message: `Map layer ${layer.layerId} references missing source(s): ${missingSources.join(", ")}.`,
      });
    }
  }
  const laneLayer = manifest.layers.find((layer) => layer.layerId === "bus_lanes");
  if (
    laneLayer !== undefined &&
    laneLayer.artifactKey !== null &&
    (laneLayer.readiness !== "available" || laneLayer.currencyStatus !== "current")
  ) {
    issues.push({
      code: "map_optional_lane_reference_unpublishable",
      message: "Optional bus-lane artifact is referenced without available/current posture.",
    });
  }

  const requiredKinds: MapArtifactKind[] = [
    "map_source_snapshot",
    "map_route_shapes_geojson",
    "map_timepoint_stops_geojson",
    "map_network_simplified_geojson",
    "map_borough_context_geojson",
  ];
  for (const kind of requiredKinds) {
    if (!manifest.artifacts.some((row) => row.artifactKind === kind)) {
      issues.push({
        code: "map_artifact_manifest_required_artifact_missing",
        message: `Map artifact manifest lacks required artifact kind ${kind}.`,
      });
    }
  }

  const routeSegmentArtifacts = manifest.artifacts.filter(
    (row) => row.artifactKind === "map_route_segments_geojson",
  );
  if (manifest.routeSegmentArtifactCount !== routeSegmentArtifacts.length) {
    issues.push({
      code: "map_artifact_manifest_route_segment_count_mismatch",
      message: `Map artifact manifest routeSegmentArtifactCount is ${manifest.routeSegmentArtifactCount}; actual rows ${routeSegmentArtifacts.length}.`,
    });
  }
  const expectedRouteIds = input.expectedRouteIds ?? manifest.routeUniverse.expectedRouteIds;
  if (input.expectedRouteIds !== undefined) {
    const callerExpected = new Set(input.expectedRouteIds);
    const declaredExpected = new Set<string>(manifest.routeUniverse.expectedRouteIds);
    const declarationMismatch =
      input.expectedRouteIds.some((routeId) => !declaredExpected.has(routeId)) ||
      manifest.routeUniverse.expectedRouteIds.some((routeId) => !callerExpected.has(routeId));
    if (declarationMismatch) {
      issues.push({
        code: "map_route_universe_expected_mismatch",
        message: "Manifest expected-route universe differs from the authoritative build universe.",
      });
    }
  }
  {
    const actualRouteIds = new Set(
      routeSegmentArtifacts
        .map((row) => row.routeId)
        .filter((routeId): routeId is string => routeId !== null),
    );
    const missingRoutes = expectedRouteIds.filter((routeId) => !actualRouteIds.has(routeId));
    if (missingRoutes.length > 0) {
      issues.push({
        code: "map_route_segment_artifact_routes_missing",
        message: `${missingRoutes.length} public route(s) lack map route-segment artifacts: ${missingRoutes.slice(0, 5).join(", ")}.`,
      });
    }
    const expected = new Set(expectedRouteIds);
    const extraRoutes = [...actualRouteIds].filter((routeId) => !expected.has(routeId));
    if (extraRoutes.length > 0) {
      issues.push({
        code: "map_route_segment_artifact_routes_extra",
        message: `${extraRoutes.length} map route-segment artifact route(s) are outside the expected universe: ${extraRoutes.slice(0, 5).join(", ")}.`,
      });
    }
  }
  for (const [field, routeIds] of [
    ["geometry", manifest.routeUniverse.geometryRouteIds],
    ["route-segment", manifest.routeUniverse.routeSegmentRouteIds],
  ] as const) {
    const actual = new Set<string>(routeIds);
    const missing = expectedRouteIds.filter((routeId) => !actual.has(routeId));
    const expected = new Set(expectedRouteIds);
    const extra = routeIds.filter((routeId) => !expected.has(routeId));
    if (missing.length > 0 || extra.length > 0) {
      issues.push({
        code: `map_route_universe_${field}_mismatch`,
        message: `${field} universe differs from expected routes (${missing.length} missing, ${extra.length} extra).`,
      });
    }
  }
  if (manifest.routeFacts.status === "available") {
    const actual = new Set<string>(manifest.routeUniverse.routeFactRouteIds);
    const missing = expectedRouteIds.filter((routeId) => !actual.has(routeId));
    if (missing.length > 0) {
      issues.push({
        code: "map_route_universe_route_fact_mismatch",
        message: `route-fact universe differs from expected routes (${missing.length} missing).`,
      });
    }
  }

  if (manifest.releaseProfile === "full") {
    if (manifest.routeFacts.status !== "available") {
      issues.push({
        code: "map_route_facts_unavailable",
        message: "Full map release lacks the manifest-referenced route-facts projection.",
      });
    } else if (manifest.routeFacts.baselineMonth !== input.month) {
      issues.push({
        code: "map_route_facts_month_mismatch",
        message: `Map route facts are for ${manifest.routeFacts.baselineMonth}, expected ${input.month}.`,
      });
    }
  }

  issues.push(...(input.artifactIssues ?? []));

  const totalByteLength = manifest.artifacts.reduce((sum, row) => sum + row.byteLength, 0);
  const totalFeatureCount = manifest.artifacts.reduce((sum, row) => sum + row.featureCount, 0);
  if (manifest.artifactCount !== manifest.artifacts.length) {
    issues.push({
      code: "map_artifact_manifest_count_mismatch",
      message: `Map artifact manifest artifactCount is ${manifest.artifactCount}; actual rows ${manifest.artifacts.length}.`,
    });
  }
  if (manifest.totalByteLength !== totalByteLength) {
    issues.push({
      code: "map_artifact_manifest_byte_total_mismatch",
      message: `Map artifact manifest totalByteLength is ${manifest.totalByteLength}; artifact rows total ${totalByteLength}.`,
    });
  }
  if (manifest.totalFeatureCount !== totalFeatureCount) {
    issues.push({
      code: "map_artifact_manifest_feature_total_mismatch",
      message: `Map artifact manifest totalFeatureCount is ${manifest.totalFeatureCount}; artifact rows total ${totalFeatureCount}.`,
    });
  }

  return {
    status: issues.length === 0 ? "pass" : "fail",
    manifestPath: input.manifestPath,
    artifactCount: manifest.artifacts.length,
    routeSegmentArtifactCount: routeSegmentArtifacts.length,
    totalFeatureCount,
    totalByteLength,
    issueCount: issues.length,
    issues,
  };
}
