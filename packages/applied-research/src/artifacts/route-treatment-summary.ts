import { join } from "node:path";
import {
  buildTreatmentFeaturesFromSummaryArtifact,
  type TreatmentSummaryFeatureResolverResult,
} from "../feature-resolvers/treatment-summary";
import type { RouteTreatmentSummaryArtifact } from "../treatments";

export function routeTreatmentSummaryArtifactPath(input: {
  artifactRoot: string;
  month: string;
}): string {
  return join(
    input.artifactRoot,
    "studio",
    "v2",
    "route-treatment-summary",
    input.month,
    "route-treatment-summary.json",
  );
}

export function routeTreatmentSummaryMarkdownPath(input: {
  artifactRoot: string;
  month: string;
}): string {
  return join(
    input.artifactRoot,
    "studio",
    "v2",
    "route-treatment-summary",
    input.month,
    "route-treatment-summary.md",
  );
}

export type LoadedRouteTreatmentFeatures = TreatmentSummaryFeatureResolverResult & {
  artifactPath: string;
  artifactFound: boolean;
};

export async function loadRouteTreatmentFeaturesFromArtifact(input: {
  artifactRoot: string;
  month: string;
  routeId?: string;
}): Promise<LoadedRouteTreatmentFeatures> {
  const artifactPath = routeTreatmentSummaryArtifactPath(input);
  const file = Bun.file(artifactPath);
  if (!(await file.exists())) {
    return {
      artifactPath,
      artifactFound: false,
      routeTreatmentFeatures: [],
      routeSegmentTreatmentFeatures: [],
      routeTreatmentSourceGapFeatures: [],
      summary: {
        sourceKind: "route_treatment_summary_artifact",
        artifactPath,
        artifactFound: false,
        artifactMonth: input.month,
        routeFilter: input.routeId ?? null,
        routeTreatmentFeatureCount: 0,
        routeSegmentTreatmentFeatureCount: 0,
        routeTreatmentSourceGapFeatureCount: 0,
      },
    };
  }

  const artifact = (await file.json()) as RouteTreatmentSummaryArtifact;
  const resolved = buildTreatmentFeaturesFromSummaryArtifact({
    artifact,
    ...(input.routeId === undefined ? {} : { routeId: input.routeId }),
  });
  return {
    ...resolved,
    artifactPath,
    artifactFound: true,
    summary: {
      ...resolved.summary,
      artifactPath,
      artifactFound: true,
    },
  };
}
