import { join } from "node:path";

export type CorridorShapeReviewStatus =
  | "pass"
  | "shape_distance_warning"
  | "missing_shape"
  | "missing_segment_coordinates"
  | "missing_segment_evidence"
  | "unassigned";

export type CorridorShapeReviewRoute = {
  routeId: string;
  corridorId: string;
  corridorName: string;
  assignmentStatus: string;
  assignmentReason: string;
  shapeCount: number;
  shapeCoordinateCount: number;
  matchedSegmentCount: number;
  reviewedSegmentCount: number;
  missingSegmentCoordinateCount: number;
  maxEndpointDistanceMeters: number | null;
  medianEndpointDistanceMeters: number | null;
  reviewStatus: CorridorShapeReviewStatus;
  caveat: string;
};

export type CorridorShapeReviewArtifact = {
  schemaVersion: 1;
  artifactKind: "corridor_shape_review";
  month: string;
  generatedAt: string;
  routeShapeSnapshotPath: string;
  routeShapeSnapshotFetchedAt: string | null;
  maxAllowedEndpointDistanceMeters: number;
  summary: {
    publicRouteCount: number;
    segmentBackedRouteCount: number;
    shapeReviewedRouteCount: number;
    passRouteCount: number;
    warningRouteCount: number;
    missingShapeRouteCount: number;
    missingSegmentEvidenceRouteCount: number;
    missingSegmentCoordinateRouteCount: number;
    unassignedRouteCount: number;
    maxEndpointDistanceMeters: number | null;
    p95EndpointDistanceMeters: number | null;
  };
  routes: CorridorShapeReviewRoute[];
};

export function corridorShapeReviewArtifactPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "route-batches", month, "corridor-shape-review.json");
}

export async function readCorridorShapeReviewArtifact(input: {
  artifactRoot: string;
  month: string;
}): Promise<CorridorShapeReviewArtifact | null> {
  const path = corridorShapeReviewArtifactPath(input.artifactRoot, input.month);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }
  try {
    return (await file.json()) as CorridorShapeReviewArtifact;
  } catch {
    return null;
  }
}

export type RouteBatchAuditStatus = "pass" | "fail";

export type RouteBatchAuditManifest = {
  schemaVersion: 1;
  artifactKind: "brief_artifact_manifest";
  analysisPeriod: string;
  generatedAt: string;
  status: RouteBatchAuditStatus;
  requiredArtifactNames: readonly string[];
  routeCount: number;
  publicRouteCount: number;
  corridorCount: number;
  routeArtifactCount: number;
  corridorArtifactCount: number;
  artifactCount: number;
  totalByteLength: number;
  missingArtifactCount: number;
  hashMismatchCount: number;
  byteLengthMismatchCount: number;
  issueCount: number;
  artifacts: Array<{
    ownerKind: "route" | "corridor";
    ownerId: string;
    month: string;
    artifactName: string;
    artifactKey: string;
    contentType: string;
    byteLength: number;
    sha256: string;
  }>;
  issues: Array<{
    routeId: string | null;
    severity: "error";
    issueCode: string;
    message: string;
  }>;
};

export function routeBatchAuditManifestPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "briefs", month, "manifest.json");
}

export type RouteBatchAuditArtifactSummary = {
  status: RouteBatchAuditStatus;
  manifestPath: string;
  artifactCount: number;
  missingArtifactCount: number;
  hashMismatchCount: number;
  byteLengthMismatchCount: number;
  issueCount: number;
  found: boolean;
};

export async function readRouteBatchAuditArtifact(input: {
  artifactRoot: string;
  month: string;
}): Promise<RouteBatchAuditArtifactSummary> {
  const manifestPath = routeBatchAuditManifestPath(input.artifactRoot, input.month);
  const file = Bun.file(manifestPath);
  if (!(await file.exists())) {
    return {
      status: "fail",
      manifestPath,
      artifactCount: 0,
      missingArtifactCount: 0,
      hashMismatchCount: 0,
      byteLengthMismatchCount: 0,
      issueCount: 0,
      found: false,
    };
  }
  let parsed: RouteBatchAuditManifest | null = null;
  try {
    parsed = (await file.json()) as RouteBatchAuditManifest;
  } catch {
    parsed = null;
  }
  if (parsed === null || parsed.artifactKind !== "brief_artifact_manifest") {
    return {
      status: "fail",
      manifestPath,
      artifactCount: 0,
      missingArtifactCount: 0,
      hashMismatchCount: 0,
      byteLengthMismatchCount: 0,
      issueCount: 0,
      found: false,
    };
  }
  return {
    status: parsed.status,
    manifestPath,
    artifactCount: parsed.artifactCount,
    missingArtifactCount: parsed.missingArtifactCount,
    hashMismatchCount: parsed.hashMismatchCount,
    byteLengthMismatchCount: parsed.byteLengthMismatchCount,
    issueCount: parsed.issueCount,
    found: true,
  };
}
