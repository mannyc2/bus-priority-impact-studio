import {
  type Plan097FreshnessEvidence,
  Plan097FreshnessEvidenceSchema,
  type Plan097FreshnessMatrix,
  Plan097FreshnessMatrixSchema,
} from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";
import type { FreshnessLedger } from "./freshness-ledger.ts";

export type { Plan097FreshnessEvidence, Plan097FreshnessMatrix };
export { Plan097FreshnessEvidenceSchema, Plan097FreshnessMatrixSchema };

export type Plan097RouteSpeedAvailability = {
  readonly minSpeedRoutes: number;
  readonly releaseDecision: {
    readonly latestCompleteMonth: string | null;
  };
};

function previousMonth(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (!Number.isInteger(year) || monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid month ${month}`);
  }
  return monthNumber === 1
    ? `${year - 1}-12`
    : `${year}-${String(monthNumber - 1).padStart(2, "0")}`;
}

export function latestClosedUpstreamMonth(
  upstreamLatest: string | null,
  checkedAt: string,
): string | null {
  if (upstreamLatest === null) return null;
  const currentMonth = checkedAt.slice(0, 7);
  if (!/^\d{4}-\d{2}$/u.test(upstreamLatest) || !/^\d{4}-\d{2}$/u.test(currentMonth)) {
    return null;
  }
  return upstreamLatest >= currentMonth ? previousMonth(currentMonth) : upstreamLatest;
}

const monthlySources = [
  "bus_segment_speeds_2025",
  "bus_hourly_ridership_2025",
  "bus_wait_assessment",
  "ace_violations",
] as const;
const snapshotSources = ["ace_routes", "nyc_dot_bus_lanes_local_streets"] as const;
const realtimeSource = "bus_time_gtfsrt_vehicle_positions";

export function buildPlan097FreshnessMatrix(input: {
  checkedAt: string;
  ledger: FreshnessLedger;
  routeSpeedAvailability: Plan097RouteSpeedAvailability;
  evidence: readonly Plan097FreshnessEvidence[];
}): Plan097FreshnessMatrix {
  const ledgerBySource = new Map(input.ledger.rows.map((row) => [row.sourceId, row]));
  const evidenceBySource = new Map(input.evidence.map((row) => [row.sourceId, row]));
  const datasets: Plan097FreshnessMatrix["datasets"][number][] = [];

  for (const sourceId of monthlySources) {
    const ledger = ledgerBySource.get(sourceId);
    const evidence = evidenceBySource.get(sourceId) ?? null;
    const routeSpeed = sourceId === "bus_segment_speeds_2025";
    const selectedCompletePartition = routeSpeed
      ? input.routeSpeedAvailability.releaseDecision.latestCompleteMonth
      : latestClosedUpstreamMonth(ledger?.upstreamLatest ?? null, input.checkedAt);
    const reasons: string[] = [];
    if (ledger === undefined) reasons.push("missing_freshness_ledger_row");
    if (selectedCompletePartition === null) reasons.push("complete_partition_unknown");
    if (routeSpeed && input.routeSpeedAvailability.minSpeedRoutes < 300) {
      reasons.push("route_speed_probe_threshold_below_300_routes");
    }
    if (ledger?.ingestedLatest === null || ledger?.ingestedLatest === undefined) {
      reasons.push("ingested_partition_unknown");
    } else if (
      selectedCompletePartition !== null &&
      ledger.ingestedLatest < selectedCompletePartition
    ) {
      reasons.push("latest_complete_partition_not_ingested");
    }
    if (
      evidence === null ||
      evidence.partition !== selectedCompletePartition ||
      evidence.rowCount === 0
    ) {
      reasons.push("selected_partition_evidence_missing_or_empty");
    }
    if (routeSpeed && (evidence?.routeCount ?? 0) < input.routeSpeedAvailability.minSpeedRoutes) {
      reasons.push("selected_route_speed_partition_below_route_threshold");
    }
    datasets.push({
      sourceId,
      grain: "month",
      selectionBasis: routeSpeed ? "source_complete_probe" : "latest_closed_upstream_month",
      upstreamLatest: ledger?.upstreamLatest ?? null,
      selectedCompletePartition,
      ingestedLatest: ledger?.ingestedLatest ?? null,
      evidence,
      status: reasons.length === 0 ? "ready" : "stop",
      reasons,
    });
  }

  for (const sourceId of snapshotSources) {
    const evidence = evidenceBySource.get(sourceId) ?? null;
    const reasons =
      evidence === null || evidence.rowCount === 0
        ? ["atomic_snapshot_evidence_missing_or_empty"]
        : [];
    datasets.push({
      sourceId,
      grain: "snapshot",
      selectionBasis: "atomic_snapshot",
      upstreamLatest: null,
      selectedCompletePartition: evidence?.partition ?? null,
      ingestedLatest: evidence?.partition ?? null,
      evidence,
      status: reasons.length === 0 ? "ready" : "stop",
      reasons,
    });
  }

  const realtimeLedger = ledgerBySource.get(realtimeSource);
  const realtimeEvidence = evidenceBySource.get(realtimeSource) ?? null;
  const realtimeReasons: string[] = [];
  if (realtimeLedger?.ingestedLatest === null || realtimeLedger?.ingestedLatest === undefined) {
    realtimeReasons.push("current_signal_fingerprint_source_unknown");
  }
  if (realtimeEvidence === null || realtimeEvidence.rowCount === 0) {
    realtimeReasons.push("current_signal_evidence_missing_or_empty");
  }
  datasets.push({
    sourceId: realtimeSource,
    grain: "realtime",
    selectionBasis: "preserved_current_signal",
    upstreamLatest: realtimeLedger?.upstreamLatest ?? null,
    selectedCompletePartition: realtimeLedger?.ingestedLatest ?? null,
    ingestedLatest: realtimeLedger?.ingestedLatest ?? null,
    evidence: realtimeEvidence,
    status: realtimeReasons.length === 0 ? "ready" : "stop",
    reasons: realtimeReasons,
  });

  return decodeStrict(Plan097FreshnessMatrixSchema)({
    artifactKind: "bp.ops.plan097.freshness-matrix.v1",
    schemaVersion: 1,
    checkedAt: input.checkedAt,
    status: datasets.every((row) => row.status === "ready") ? "ready" : "stop",
    candidateCompatibilityCoverageEnd:
      datasets.find((row) => row.sourceId === "bus_segment_speeds_2025")
        ?.selectedCompletePartition ?? null,
    datasets,
  });
}
