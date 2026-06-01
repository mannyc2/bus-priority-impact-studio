import {
  DEFAULT_SPEED_PACE_HOTSPOT_THRESHOLDS,
  detectSpeedPaceHotspots,
  SPEED_PACE_HOTSPOT_DETECTOR_ID,
} from "@bp/analytics";
import { buildSegmentDaypartFeaturesFromSpeedRows } from "../feature-resolvers";
import type { SegmentDaypartSpeedSourceRow } from "../feature-resolvers";

export type SpeedPaceScoreVectorMonth = {
  readonly month: string;
  readonly sourceRowCount: number;
  readonly featureCount: number;
  readonly routeCount: number;
  readonly candidateCount: number;
  readonly hitCount: number;
  readonly cleanNoHitCount: number;
  readonly skippedCount: number;
  readonly medianCandidateScore: number | null;
  readonly p95CandidateScore: number | null;
};

export type SpeedPaceScoreVectorArtifact = {
  readonly artifactKind: "speed_pace_hotspot_score_vectors";
  readonly schemaVersion: 1;
  readonly detectorId: typeof SPEED_PACE_HOTSPOT_DETECTOR_ID;
  readonly generatedAt: string;
  readonly dbPath: string | null;
  readonly artifactPath: string;
  readonly window: {
    readonly startMonth: string;
    readonly endMonth: string;
  };
  readonly summary: {
    readonly usableMonthCount: number;
    readonly totalFeatureCount: number;
    readonly totalCandidateCount: number;
    readonly totalSkippedCount: number;
    readonly routeCount: number;
    readonly releaseFeatureCount: number;
    readonly releaseCandidateCount: number;
    readonly releaseSkippedCount: number;
  };
  readonly monthly: SpeedPaceScoreVectorMonth[];
  readonly releaseTopCandidates: Array<{
    readonly candidateId: string;
    readonly routeId: string | null;
    readonly scopeId: string;
    readonly detectorScore: number;
    readonly claimText: string;
  }>;
};

function percentile(values: readonly number[], percentileValue: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * percentileValue;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined) return null;
  if (upper === undefined || lowerIndex === upperIndex) return lower;
  return Math.round((lower + (upper - lower) * (position - lowerIndex)) * 10) / 10;
}

export function buildSpeedPaceScoreVectorArtifact(input: {
  readonly rowsByMonth: ReadonlyMap<string, readonly SegmentDaypartSpeedSourceRow[]>;
  readonly months: readonly string[];
  readonly startMonth: string;
  readonly endMonth: string;
  readonly releaseMonth: string;
  readonly generatedAt: string;
  readonly dbPath: string | null;
  readonly artifactPath: string;
  readonly candidateLimit?: number;
}): SpeedPaceScoreVectorArtifact {
  const monthly: SpeedPaceScoreVectorMonth[] = [];
  const routeIds = new Set<string>();
  let releaseTopCandidates: SpeedPaceScoreVectorArtifact["releaseTopCandidates"] = [];

  for (const month of input.months) {
    const resolved = buildSegmentDaypartFeaturesFromSpeedRows({
      rows: input.rowsByMonth.get(month) ?? [],
      minSampleCount: DEFAULT_SPEED_PACE_HOTSPOT_THRESHOLDS.minTraversals,
    });
    for (const feature of resolved.features) routeIds.add(feature.routeId);
    const detectorInput = {
      detectorRunId: `${SPEED_PACE_HOTSPOT_DETECTOR_ID}-${month}-score-vector`,
      month,
      generatedAt: input.generatedAt,
      features: resolved.features,
      ...(input.candidateLimit === undefined
        ? {}
        : { thresholds: { candidateLimit: input.candidateLimit } }),
    };
    const output = detectSpeedPaceHotspots(detectorInput);
    const scores = output.candidates.map((candidate) => candidate.detectorScore);
    monthly.push({
      month,
      sourceRowCount: resolved.summary.sourceRowCount,
      featureCount: resolved.summary.featureCount,
      routeCount: resolved.summary.routeCount,
      candidateCount: output.candidates.length,
      hitCount: output.coverage.filter((row) => row.outcome === "hit").length,
      cleanNoHitCount: output.coverage.filter((row) => row.outcome === "clean_no_hit").length,
      skippedCount: output.coverage.filter((row) => row.outcome.startsWith("skipped")).length,
      medianCandidateScore: percentile(scores, 0.5),
      p95CandidateScore: percentile(scores, 0.95),
    });
    if (month === input.releaseMonth) {
      releaseTopCandidates = output.candidates.slice(0, 25).map((candidate) => ({
        candidateId: candidate.candidateId,
        routeId: candidate.routeId,
        scopeId: candidate.scopeId,
        detectorScore: candidate.detectorScore,
        claimText: candidate.claimText,
      }));
    }
  }

  const release = monthly.find((month) => month.month === input.releaseMonth);
  return {
    artifactKind: "speed_pace_hotspot_score_vectors",
    schemaVersion: 1,
    detectorId: SPEED_PACE_HOTSPOT_DETECTOR_ID,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    window: {
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    },
    summary: {
      usableMonthCount: monthly.filter((month) => month.featureCount > 0).length,
      totalFeatureCount: monthly.reduce((sum, month) => sum + month.featureCount, 0),
      totalCandidateCount: monthly.reduce((sum, month) => sum + month.candidateCount, 0),
      totalSkippedCount: monthly.reduce((sum, month) => sum + month.skippedCount, 0),
      routeCount: routeIds.size,
      releaseFeatureCount: release?.featureCount ?? 0,
      releaseCandidateCount: release?.candidateCount ?? 0,
      releaseSkippedCount: release?.skippedCount ?? 0,
    },
    monthly,
    releaseTopCandidates,
  };
}
