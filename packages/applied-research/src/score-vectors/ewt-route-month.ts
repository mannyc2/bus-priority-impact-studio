import {
  buildEwtRouteMonthScoreVectorArtifact as buildAnalyticsEwtRouteMonthScoreVectorArtifact,
  type EwtRouteMonthReliabilityRow,
  type EwtRouteMonthScoreVectorArtifact,
} from "@bp/analytics";

export type RawEwtRouteMonthReliabilityRow = {
  route_id: unknown;
  month: unknown;
  run_id: unknown;
  reliability_status: unknown;
  sample_count: unknown;
  stop_count: unknown;
  direction_count: unknown;
  average_observed_headway_minutes: unknown;
  expected_wait_minutes: unknown;
  scheduled_expected_wait_minutes: unknown;
  excess_wait_minutes: unknown;
  wait_reliability_ratio: unknown;
};

function textValue(value: unknown): string | null {
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

export function routeMonthKey(routeId: string, month: string): string {
  return `${routeId}\0${month}`;
}

export function parseEwtRouteMonthRows(
  rows: readonly RawEwtRouteMonthReliabilityRow[],
): EwtRouteMonthReliabilityRow[] {
  return rows.flatMap((row) => {
    const routeId = textValue(row.route_id);
    const month = textValue(row.month);
    const runId = textValue(row.run_id);
    const reliabilityStatus = textValue(row.reliability_status);
    const sampleCount = numberValue(row.sample_count);
    const stopCount = numberValue(row.stop_count);
    const directionCount = numberValue(row.direction_count);
    if (
      routeId === null ||
      month === null ||
      runId === null ||
      reliabilityStatus === null ||
      sampleCount === null ||
      stopCount === null ||
      directionCount === null
    ) {
      return [];
    }
    return [
      {
        routeId,
        month,
        runId,
        reliabilityStatus,
        sampleCount,
        stopCount,
        directionCount,
        averageObservedHeadwayMinutes: numberValue(row.average_observed_headway_minutes),
        expectedWaitMinutes: numberValue(row.expected_wait_minutes),
        scheduledExpectedWaitMinutes: numberValue(row.scheduled_expected_wait_minutes),
        excessWaitMinutes: numberValue(row.excess_wait_minutes),
        mtaAbstMinutes: null,
        waitReliabilityRatio: numberValue(row.wait_reliability_ratio),
      },
    ];
  });
}

export function buildEwtRouteMonthScoreVectorArtifact(input: {
  rows: readonly EwtRouteMonthReliabilityRow[];
  startMonth: string;
  endMonth: string;
  releaseMonth: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  minSampleCount: number;
  fleetFlagQuantile: number;
}): EwtRouteMonthScoreVectorArtifact {
  return buildAnalyticsEwtRouteMonthScoreVectorArtifact(input);
}

export type { EwtRouteMonthReliabilityRow, EwtRouteMonthScoreVectorArtifact };
