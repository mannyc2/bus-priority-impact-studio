import { join } from "node:path";

export function detectorCorpusGrainAuditPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "detector-corpus-grain",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "grain-audit.json",
  );
}

export function detectorCorpusGrainAuditMarkdownPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "detector-corpus-grain",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "grain-audit.md",
  );
}

export async function detectDetectorSpecificScoreVectorIds(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): Promise<ReadonlySet<string>> {
  const detectorIds = new Set<string>();
  const ewtScoreVectorsPath = join(
    input.artifactRoot,
    "analytics-ewt-score-vectors",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "ewt-route-month-score-vectors.json",
  );
  if (await Bun.file(ewtScoreVectorsPath).exists()) {
    detectorIds.add("headway_reliability_ewt");
  }
  const speedPaceScoreVectorsPath = join(
    input.artifactRoot,
    "speed-pace-score-vectors",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "speed-pace-score-vectors.json",
  );
  if (await Bun.file(speedPaceScoreVectorsPath).exists()) {
    detectorIds.add("speed_pace_hotspot");
  }
  const runtimeTrendScoreVectorsPath = join(
    input.artifactRoot,
    "runtime-trend-score-vectors",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "runtime-trend-score-vectors.json",
  );
  if (await Bun.file(runtimeTrendScoreVectorsPath).exists()) {
    detectorIds.add("schedule_mismatch");
    detectorIds.add("travel_time_variability");
    detectorIds.add("degradation_trend");
  }
  return detectorIds;
}
