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
