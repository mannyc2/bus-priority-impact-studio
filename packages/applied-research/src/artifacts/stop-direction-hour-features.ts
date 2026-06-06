import { join } from "node:path";
import type { StopDirectionHourFeature } from "@bp/analytics/features";
import { Glob } from "bun";

type StopDirectionHourFeatureArtifact = {
  readonly routeId?: unknown;
  readonly summary?: Record<string, unknown>;
  readonly features?: StopDirectionHourFeature[];
};

export type LoadedStopDirectionHourFeatures = {
  readonly features: StopDirectionHourFeature[];
  readonly summary: Record<string, unknown>;
};

export function stopDirectionHourEwtFeatureArtifactPath(input: {
  readonly artifactRoot: string;
  readonly month: string;
  readonly runId: string;
  readonly routeId: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-stop-direction-hour-ewt",
    input.month,
    input.runId,
    input.routeId.toLowerCase(),
    "stop-direction-hour-ewt-features.json",
  );
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function loadStopDirectionHourFeaturesFromArtifacts(input: {
  readonly artifactRoot: string;
  readonly month: string;
  readonly runId: string;
  readonly routeId?: string;
}): Promise<LoadedStopDirectionHourFeatures> {
  const root = join(
    input.artifactRoot,
    "analytics-stop-direction-hour-ewt",
    input.month,
    input.runId,
  );
  const features: StopDirectionHourFeature[] = [];
  let artifactCount = 0;
  const totals = {
    featureCount: 0,
    readyFeatureCount: 0,
    baselineUnavailableCount: 0,
    insufficientHeadwayCount: 0,
    lowCoverageCount: 0,
    observedHeadwaySampleCount: 0,
  };
  const glob = new Glob("**/stop-direction-hour-ewt-features.json");
  for await (const relativePath of glob.scan({ cwd: root, onlyFiles: true })) {
    const artifact = (await Bun.file(
      join(root, relativePath),
    ).json()) as StopDirectionHourFeatureArtifact;
    const artifactRouteId = text(artifact.routeId);
    if (input.routeId !== undefined && artifactRouteId !== input.routeId) continue;
    artifactCount += 1;
    features.push(...(Array.isArray(artifact.features) ? artifact.features : []));
    const summary = artifact.summary ?? {};
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      totals[key] += numberValue(summary[key]) ?? 0;
    }
  }
  return {
    features,
    summary: {
      sourceKind: "stop_direction_hour_ewt_feature_artifacts",
      artifactCount,
      ...totals,
      loadedFeatureCount: features.length,
    },
  };
}
