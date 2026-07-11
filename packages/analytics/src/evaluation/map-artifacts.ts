import { createHash } from "node:crypto";
import { MapRouteSegmentFeatureCollectionSchema } from "@bp/domain/maps";
import { Result } from "effect";
import { decodeSchemaEitherStrict } from "../schema-decode.js";

export const MAP_ARTIFACT_SCHEMA_VERSION = 1;
export const MAP_ARTIFACT_JSON_CONTENT_TYPE = "application/json" as const;
export const MAP_ARTIFACT_GEOJSON_CONTENT_TYPE = "application/geo+json" as const;

export type MapArtifactKind =
  | "map_source_snapshot"
  | "map_route_shapes_geojson"
  | "map_timepoint_stops_geojson"
  | "map_bus_lanes_geojson"
  | "map_network_simplified_geojson"
  | "map_route_segments_geojson";

export type MapArtifactEntry = {
  artifactKind: MapArtifactKind;
  artifactKey: string;
  contentType: typeof MAP_ARTIFACT_JSON_CONTENT_TYPE | typeof MAP_ARTIFACT_GEOJSON_CONTENT_TYPE;
  byteLength: number;
  sha256: string;
  featureCount: number;
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
      }
    | { status: "unavailable"; reason: string };
  status: "pass";
  artifactCount: number;
  routeSegmentArtifactCount: number;
  totalFeatureCount: number;
  totalByteLength: number;
  issueCount: 0;
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
      sha256: mapArtifactSha256(bytes),
      featureCount: input.featureCount,
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
    candidate.buildStatus === "pass" &&
    (candidate.verificationStatus === "not_run" ||
      candidate.verificationStatus === "pass" ||
      candidate.verificationStatus === "fail") &&
    isJsonObject(candidate.routeFacts) &&
    candidate.status === "pass" &&
    typeof candidate.artifactCount === "number" &&
    typeof candidate.routeSegmentArtifactCount === "number" &&
    typeof candidate.totalFeatureCount === "number" &&
    typeof candidate.totalByteLength === "number" &&
    candidate.issueCount === 0 &&
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

  return issues;
}

export function verifyMapArtifactManifestContents(input: {
  manifestPath: string;
  month: string;
  manifest: MapArtifactManifest | null;
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
  if (manifest.analysisPeriod !== input.month) {
    issues.push({
      code: "map_artifact_manifest_month_mismatch",
      message: `Map artifact manifest is for ${manifest.analysisPeriod}, expected ${input.month}.`,
    });
  }

  const requiredKinds: MapArtifactKind[] = [
    "map_source_snapshot",
    "map_route_shapes_geojson",
    "map_timepoint_stops_geojson",
    "map_bus_lanes_geojson",
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
  if (input.expectedRouteIds !== undefined) {
    const actualRouteIds = new Set(
      routeSegmentArtifacts
        .map((row) => row.routeId)
        .filter((routeId): routeId is string => routeId !== null),
    );
    const missingRoutes = input.expectedRouteIds.filter((routeId) => !actualRouteIds.has(routeId));
    if (missingRoutes.length > 0) {
      issues.push({
        code: "map_route_segment_artifact_routes_missing",
        message: `${missingRoutes.length} public route(s) lack map route-segment artifacts: ${missingRoutes.slice(0, 5).join(", ")}.`,
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
