import { createHash } from "node:crypto";
import {
  DetectorIdSchema,
  DetectorRunIdSchema,
  type FindingCandidate,
  FindingCandidateSchema,
  type FindingCoverageAudit,
  FindingCoverageAuditSchema,
  type FindingEvidenceLink,
  FindingEvidenceLinkSchema,
  FindingReasonCodeSchema,
} from "@bp/domain/findings";
import { IsoMonthSchema, RouteIdSchema } from "@bp/domain/primitives";

// Pure source-gap detector. Given coverage facts for a release month, emit:
//   - a finding candidate per missing source (claim_safe_label = insufficient_evidence)
//   - one coverage audit row per considered route (hit | clean_no_hit)
//
// No DB, filesystem, or external IO. The pipeline orchestrator (tools/pipeline)
// loads the inputs from local SQLite and persists outputs via replaceFindingsForMonth.

export const SOURCE_GAP_DETECTOR_ID = "source_gap";

export type SourceGapRouteInput = {
  routeId: string;
  hasSpeedData: boolean;
  speedObservationCount: number;
  hasGeometry: boolean;
  observedHeadwaySampleCount: number;
  scheduledBaselineHeadwaySampleCount: number;
};

export type SourceGapContextJoinInput = {
  sourceId: string;
  eventKinds: readonly string[];
  joinableEventCount: number;
  joinedEventCount: number;
};

export type SourceGapBusLaneDateInput = {
  routeId: string;
  sentinelDate: string;
  interventionCount: number;
};

export type SourceGapFreshnessInput = {
  sourceId: string;
  latestIngestedAt: string | null;
  expectedLagDays: number;
};

export type SourceGapTreatmentSourceInput = {
  routeId: string | null;
  treatmentType: string;
  gapKind: string;
  sourceGapCount: number;
  blocksClaims: readonly string[];
  sourceRefs: readonly string[];
  publicStatements: readonly string[];
};

export type SourceGapThresholds = {
  minGtfsRtHeadwaySamples: number;
  minContextJoinRate: number;
  minContextJoinableEvents: number;
  sourceLagGraceDays: number;
};

export const BUS_LANE_DATE_SENTINELS = [
  // Current March 2026 corpus inspection found 115 bus-lane intervention rows
  // stamped exactly at the release-month start, far above normal one-off
  // implementation dates. That value is a pipeline placeholder for matched bus
  // lanes without a parseable opening date, not an actual implementation date.
  "2026-03-01T00:00:00.000Z",
] as const;

export const DEFAULT_SOURCE_GAP_THRESHOLDS: SourceGapThresholds = {
  // Why: March 2026 has 381 observed-reliability route summaries; 37 are below
  // 100 samples, and the next nonzero rows quickly move into hundreds. 100 keeps
  // tiny or structural placeholders out of observed-reliability claims while
  // retaining the real recovered Bus Observatory coverage.
  minGtfsRtHeadwaySamples: 100,
  // Why: March 2026 context joins split cleanly: parking violations join at
  // 3.0%, while every other joinable source is at least 45.0%. A 40% floor
  // catches the broken parking bridge without flagging the next-lowest sources.
  minContextJoinRate: 0.4,
  // Why: The live corpus has all joinable sources above 50 rows, but this floor
  // prevents a tiny exploratory source, such as 0-of-2, from looking like a
  // system-level join failure before enough evidence exists.
  minContextJoinableEvents: 50,
  // Why: Freshness policy is source-specific; this one-day grace absorbs
  // timezone and end-of-run skew so daily/weekly/monthly policies don't fire
  // just because a local build crosses midnight.
  sourceLagGraceDays: 1,
};

export type SourceGapDetectorInput = {
  detectorRunId: string;
  month: string;
  generatedAt: string;
  routes: ReadonlyArray<SourceGapRouteInput>;
  contextJoins?: ReadonlyArray<SourceGapContextJoinInput>;
  busLaneDates?: ReadonlyArray<SourceGapBusLaneDateInput>;
  sourceFreshness?: ReadonlyArray<SourceGapFreshnessInput>;
  treatmentSourceGaps?: ReadonlyArray<SourceGapTreatmentSourceInput>;
  thresholds?: Partial<SourceGapThresholds>;
};

export type SourceGapDetectorOutput = {
  candidates: FindingCandidate[];
  evidence: FindingEvidenceLink[];
  coverage: FindingCoverageAudit[];
};

type CheckResult = {
  reasonCode: string;
  claimText: string;
  severity: "info" | "low" | "medium" | "high";
  detectorScore: number;
  inputsSeen: Record<string, unknown>;
  inputsExpected: Record<string, unknown>;
};

function checkSourceGapsForRoute(
  route: SourceGapRouteInput,
  thresholds: SourceGapThresholds,
): CheckResult[] {
  const results: CheckResult[] = [];

  if (!route.hasSpeedData || route.speedObservationCount === 0) {
    results.push({
      reasonCode: "missing_speed",
      claimText: `Route ${route.routeId} has no public segment-speed observations for this month.`,
      // Without speed data the route cannot be ranked at all — most severe gap.
      severity: "high",
      detectorScore: 95,
      inputsSeen: { speedObservationCount: route.speedObservationCount },
      inputsExpected: { speedObservationCount: ">0" },
    });
  }

  if (!route.hasGeometry) {
    results.push({
      reasonCode: "missing_geometry",
      claimText: `Route ${route.routeId} has no LION segment links; no map can be rendered.`,
      severity: "high",
      detectorScore: 90,
      inputsSeen: { hasGeometry: false },
      inputsExpected: { hasGeometry: true },
    });
  }

  if (route.observedHeadwaySampleCount < thresholds.minGtfsRtHeadwaySamples) {
    results.push({
      reasonCode: "insufficient_gtfs_rt_samples",
      claimText: `Route ${route.routeId} has ${route.observedHeadwaySampleCount} GTFS-RT headway samples this month (need >= ${thresholds.minGtfsRtHeadwaySamples}).`,
      // Reliability inference is still possible with public-speed data, so
      // this is "medium" — it blocks observed-reliability claims, not all
      // claims about the route.
      severity: "medium",
      detectorScore: 60,
      inputsSeen: { observedHeadwaySampleCount: route.observedHeadwaySampleCount },
      inputsExpected: {
        observedHeadwaySampleCount: `>=${thresholds.minGtfsRtHeadwaySamples}`,
      },
    });
  }

  if (route.scheduledBaselineHeadwaySampleCount <= 0) {
    results.push({
      reasonCode: "missing_scheduled_baseline",
      claimText: `Route ${route.routeId} has no scheduled headway baseline for this month.`,
      severity: "medium",
      detectorScore: 65,
      inputsSeen: {
        scheduledBaselineHeadwaySampleCount: route.scheduledBaselineHeadwaySampleCount,
      },
      inputsExpected: { scheduledBaselineHeadwaySampleCount: ">0" },
    });
  }

  return results;
}

function checkFailedContextJoin(
  source: SourceGapContextJoinInput,
  thresholds: SourceGapThresholds,
): CheckResult | null {
  if (source.joinableEventCount < thresholds.minContextJoinableEvents) return null;
  const joinRate = source.joinedEventCount / source.joinableEventCount;
  if (joinRate >= thresholds.minContextJoinRate) return null;

  return {
    reasonCode: "failed_context_join",
    claimText: `Context source ${source.sourceId} joined ${Math.round(joinRate * 100)}% of joinable events to route touches (need >= ${Math.round(thresholds.minContextJoinRate * 100)}%).`,
    severity: "medium",
    detectorScore: 80,
    inputsSeen: {
      sourceId: source.sourceId,
      eventKinds: source.eventKinds,
      joinableEventCount: source.joinableEventCount,
      joinedEventCount: source.joinedEventCount,
      joinRate,
    },
    inputsExpected: {
      joinableEventCount: `>=${thresholds.minContextJoinableEvents}`,
      joinRate: `>=${thresholds.minContextJoinRate}`,
    },
  };
}

function checkBusLaneDateGap(input: SourceGapBusLaneDateInput): CheckResult {
  return {
    reasonCode: "bus_lane_date_gap",
    claimText: `Route ${input.routeId} has ${input.interventionCount} bus-lane intervention row(s) with placeholder implementation date ${input.sentinelDate}.`,
    severity: "medium",
    detectorScore: 70,
    inputsSeen: {
      sentinelDate: input.sentinelDate,
      interventionCount: input.interventionCount,
    },
    inputsExpected: { implementationDate: "parseable non-sentinel date" },
  };
}

function daysSince(latestIngestedAt: string, generatedAt: string): number {
  const latest = Date.parse(latestIngestedAt);
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(latest) || !Number.isFinite(generated)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (generated - latest) / 86_400_000);
}

function checkSourceLag(
  source: SourceGapFreshnessInput,
  generatedAt: string,
  thresholds: SourceGapThresholds,
): CheckResult | null {
  if (source.latestIngestedAt === null) return null;
  const observedLagDays = daysSince(source.latestIngestedAt, generatedAt);
  const maxAllowedLagDays = source.expectedLagDays + thresholds.sourceLagGraceDays;
  if (observedLagDays <= maxAllowedLagDays) return null;

  return {
    reasonCode: "source_lag",
    claimText: `Context source ${source.sourceId} was last ingested ${observedLagDays.toFixed(1)} days before this detector run (expected <= ${maxAllowedLagDays} days).`,
    severity: "low",
    detectorScore: 45,
    inputsSeen: {
      sourceId: source.sourceId,
      latestIngestedAt: source.latestIngestedAt,
      observedLagDays,
      expectedLagDays: source.expectedLagDays,
      sourceLagGraceDays: thresholds.sourceLagGraceDays,
    },
    inputsExpected: { observedLagDays: `<=${maxAllowedLagDays}` },
  };
}

function treatmentSourceGapReason(row: SourceGapTreatmentSourceInput): string {
  return row.treatmentType === "transit_signal_priority" &&
    row.gapKind === "current_inventory_missing"
    ? "tsp_current_inventory_missing"
    : "treatment_source_gap";
}

function treatmentSourceGapClaimText(row: SourceGapTreatmentSourceInput): string {
  const routeText = row.routeId === null ? "The route universe" : `Route ${row.routeId}`;
  if (treatmentSourceGapReason(row) === "tsp_current_inventory_missing") {
    return `${routeText} has a transit-signal-priority source gap: current route/intersection inventory is missing from public sources.`;
  }
  return `${routeText} has ${row.sourceGapCount} public source gap row(s) for ${row.treatmentType}/${row.gapKind}.`;
}

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}

export function detectSourceGaps(input: SourceGapDetectorInput): SourceGapDetectorOutput {
  const detectorId = DetectorIdSchema.parse(SOURCE_GAP_DETECTOR_ID);
  const detectorRunId = DetectorRunIdSchema.parse(input.detectorRunId);
  const month = IsoMonthSchema.parse(input.month);
  const thresholds: SourceGapThresholds = {
    ...DEFAULT_SOURCE_GAP_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };

  const candidates: FindingCandidate[] = [];
  const evidence: FindingEvidenceLink[] = [];
  const coverage: FindingCoverageAudit[] = [];

  for (const route of input.routes) {
    const routeId = RouteIdSchema.parse(route.routeId);
    const checks = checkSourceGapsForRoute(route, thresholds);

    for (const check of checks) {
      const candidateId = stableId(detectorRunId, "candidate", routeId, check.reasonCode);
      const candidate = FindingCandidateSchema.parse({
        candidateId,
        detectorId,
        detectorRunId,
        month,
        scopeKind: "route",
        scopeId: routeId,
        routeId,
        physicalId: null,
        category: "data_quality",
        severity: check.severity,
        confidence: "high",
        detectorScore: check.detectorScore,
        reasonCode: FindingReasonCodeSchema.parse(check.reasonCode),
        claimSafeLabel: "insufficient_evidence",
        claimText: check.claimText,
        status: "open",
        reviewState: "unreviewed",
        windowStart: null,
        windowEnd: null,
        createdAt: input.generatedAt,
      });
      candidates.push(candidate);

      const link = FindingEvidenceLinkSchema.parse({
        linkId: stableId(candidateId, "evidence", "missing"),
        candidateId,
        evidenceKind: "missing_data",
        evidenceRole: "missing_data",
        evidenceRef: JSON.stringify({
          scopeKind: "route",
          scopeId: routeId,
          month,
          reasonCode: check.reasonCode,
          inputsSeen: check.inputsSeen,
          inputsExpected: check.inputsExpected,
        }),
        evidenceWeight: 1,
        note: null,
      });
      evidence.push(link);
    }

    const auditId = stableId(detectorRunId, "audit", routeId);
    const outcome: "hit" | "clean_no_hit" = checks.length > 0 ? "hit" : "clean_no_hit";
    coverage.push(
      FindingCoverageAuditSchema.parse({
        auditId,
        detectorRunId,
        detectorId,
        month,
        scopeKind: "route",
        scopeId: routeId,
        outcome,
        reasonCode: null,
        reason: null,
        inputsSeenJson: JSON.stringify({
          hasSpeedData: route.hasSpeedData,
          speedObservationCount: route.speedObservationCount,
          hasGeometry: route.hasGeometry,
          observedHeadwaySampleCount: route.observedHeadwaySampleCount,
          scheduledBaselineHeadwaySampleCount: route.scheduledBaselineHeadwaySampleCount,
        }),
        inputsExpectedJson: JSON.stringify({
          hasSpeedData: true,
          speedObservationCount: ">0",
          hasGeometry: true,
          observedHeadwaySampleCount: `>=${thresholds.minGtfsRtHeadwaySamples}`,
          scheduledBaselineHeadwaySampleCount: ">0",
        }),
        createdAt: input.generatedAt,
      }),
    );
  }

  for (const source of input.contextJoins ?? []) {
    const scopeId = `context_join:${source.sourceId}`;
    const check = checkFailedContextJoin(source, thresholds);

    if (check !== null) {
      const candidateId = stableId(detectorRunId, "candidate", scopeId, check.reasonCode);
      const candidate = FindingCandidateSchema.parse({
        candidateId,
        detectorId,
        detectorRunId,
        month,
        scopeKind: "system",
        scopeId,
        routeId: null,
        physicalId: null,
        category: "data_quality",
        severity: check.severity,
        confidence: "high",
        detectorScore: check.detectorScore,
        reasonCode: FindingReasonCodeSchema.parse(check.reasonCode),
        claimSafeLabel: "insufficient_evidence",
        claimText: check.claimText,
        status: "open",
        reviewState: "unreviewed",
        windowStart: null,
        windowEnd: null,
        createdAt: input.generatedAt,
      });
      candidates.push(candidate);

      const link = FindingEvidenceLinkSchema.parse({
        linkId: stableId(candidateId, "evidence", "coverage_audit"),
        candidateId,
        evidenceKind: "coverage_audit",
        evidenceRole: "coverage_audit",
        evidenceRef: JSON.stringify({
          scopeKind: "system",
          scopeId,
          month,
          reasonCode: check.reasonCode,
          inputsSeen: check.inputsSeen,
          inputsExpected: check.inputsExpected,
        }),
        evidenceWeight: 1,
        note: null,
      });
      evidence.push(link);
    }

    const outcome =
      source.joinableEventCount < thresholds.minContextJoinableEvents
        ? "skipped_missing_input"
        : check === null
          ? "clean_no_hit"
          : "hit";
    coverage.push(
      FindingCoverageAuditSchema.parse({
        auditId: stableId(detectorRunId, "audit", scopeId),
        detectorRunId,
        detectorId,
        month,
        scopeKind: "system",
        scopeId,
        outcome,
        reasonCode: check === null ? null : FindingReasonCodeSchema.parse(check.reasonCode),
        reason:
          source.joinableEventCount < thresholds.minContextJoinableEvents
            ? "Not enough context events with route_id or physical_id were available to score join health."
            : null,
        inputsSeenJson: JSON.stringify({
          sourceId: source.sourceId,
          eventKinds: source.eventKinds,
          joinableEventCount: source.joinableEventCount,
          joinedEventCount: source.joinedEventCount,
        }),
        inputsExpectedJson: JSON.stringify({
          joinableEventCount: `>=${thresholds.minContextJoinableEvents}`,
          joinRate: `>=${thresholds.minContextJoinRate}`,
        }),
        createdAt: input.generatedAt,
      }),
    );
  }

  for (const row of input.busLaneDates ?? []) {
    const routeId = RouteIdSchema.parse(row.routeId);
    const check = checkBusLaneDateGap(row);
    const candidateId = stableId(detectorRunId, "candidate", routeId, check.reasonCode);
    candidates.push(
      FindingCandidateSchema.parse({
        candidateId,
        detectorId,
        detectorRunId,
        month,
        scopeKind: "route",
        scopeId: routeId,
        routeId,
        physicalId: null,
        category: "data_quality",
        severity: check.severity,
        confidence: "high",
        detectorScore: check.detectorScore,
        reasonCode: FindingReasonCodeSchema.parse(check.reasonCode),
        claimSafeLabel: "insufficient_evidence",
        claimText: check.claimText,
        status: "open",
        reviewState: "unreviewed",
        windowStart: null,
        windowEnd: null,
        createdAt: input.generatedAt,
      }),
    );
    evidence.push(
      FindingEvidenceLinkSchema.parse({
        linkId: stableId(candidateId, "evidence", "missing_bus_lane_date"),
        candidateId,
        evidenceKind: "missing_data",
        evidenceRole: "missing_data",
        evidenceRef: JSON.stringify({
          scopeKind: "route",
          scopeId: routeId,
          month,
          reasonCode: check.reasonCode,
          inputsSeen: check.inputsSeen,
          inputsExpected: check.inputsExpected,
        }),
        evidenceWeight: 1,
        note: null,
      }),
    );
  }

  for (const source of input.sourceFreshness ?? []) {
    const scopeId = `source_lag:${source.sourceId}`;
    const check = checkSourceLag(source, input.generatedAt, thresholds);
    if (check !== null) {
      const candidateId = stableId(detectorRunId, "candidate", scopeId, check.reasonCode);
      candidates.push(
        FindingCandidateSchema.parse({
          candidateId,
          detectorId,
          detectorRunId,
          month,
          scopeKind: "system",
          scopeId,
          routeId: null,
          physicalId: null,
          category: "data_quality",
          severity: check.severity,
          confidence: "high",
          detectorScore: check.detectorScore,
          reasonCode: FindingReasonCodeSchema.parse(check.reasonCode),
          claimSafeLabel: "source_lag_expected",
          claimText: check.claimText,
          status: "open",
          reviewState: "unreviewed",
          windowStart: null,
          windowEnd: null,
          createdAt: input.generatedAt,
        }),
      );
      evidence.push(
        FindingEvidenceLinkSchema.parse({
          linkId: stableId(candidateId, "evidence", "coverage_audit"),
          candidateId,
          evidenceKind: "coverage_audit",
          evidenceRole: "coverage_audit",
          evidenceRef: JSON.stringify({
            scopeKind: "system",
            scopeId,
            month,
            reasonCode: check.reasonCode,
            inputsSeen: check.inputsSeen,
            inputsExpected: check.inputsExpected,
          }),
          evidenceWeight: 1,
          note: null,
        }),
      );
    }

    coverage.push(
      FindingCoverageAuditSchema.parse({
        auditId: stableId(detectorRunId, "audit", scopeId),
        detectorRunId,
        detectorId,
        month,
        scopeKind: "system",
        scopeId,
        outcome:
          source.latestIngestedAt === null
            ? "skipped_missing_input"
            : check === null
              ? "clean_no_hit"
              : "source_lag",
        reasonCode: check === null ? null : FindingReasonCodeSchema.parse(check.reasonCode),
        reason: source.latestIngestedAt === null ? "No ingested context events for source." : null,
        inputsSeenJson: JSON.stringify({
          sourceId: source.sourceId,
          latestIngestedAt: source.latestIngestedAt,
          expectedLagDays: source.expectedLagDays,
          sourceLagGraceDays: thresholds.sourceLagGraceDays,
        }),
        inputsExpectedJson: JSON.stringify({
          observedLagDays: `<=${source.expectedLagDays + thresholds.sourceLagGraceDays}`,
        }),
        createdAt: input.generatedAt,
      }),
    );
  }

  for (const row of input.treatmentSourceGaps ?? []) {
    if (row.sourceGapCount <= 0) continue;
    const routeId = row.routeId === null ? null : RouteIdSchema.parse(row.routeId);
    const scopeId =
      routeId === null
        ? `treatment_source_gap:${row.treatmentType}:${row.gapKind}`
        : routeId;
    const reasonCode = treatmentSourceGapReason(row);
    const candidateId = stableId(detectorRunId, "candidate", scopeId, reasonCode);
    candidates.push(
      FindingCandidateSchema.parse({
        candidateId,
        detectorId,
        detectorRunId,
        month,
        scopeKind: routeId === null ? "system" : "route",
        scopeId,
        routeId,
        physicalId: null,
        category: "data_quality",
        severity: "medium",
        confidence: "high",
        detectorScore: reasonCode === "tsp_current_inventory_missing" ? 75 : 65,
        reasonCode: FindingReasonCodeSchema.parse(reasonCode),
        claimSafeLabel: "insufficient_evidence",
        claimText: treatmentSourceGapClaimText(row),
        status: "open",
        reviewState: "unreviewed",
        windowStart: null,
        windowEnd: null,
        createdAt: input.generatedAt,
      }),
    );
    evidence.push(
      FindingEvidenceLinkSchema.parse({
        linkId: stableId(candidateId, "evidence", "source-gap-model"),
        candidateId,
        evidenceKind: "missing_data",
        evidenceRole: "missing_data",
        evidenceRef: JSON.stringify({
          scopeKind: routeId === null ? "system" : "route",
          scopeId,
          month,
          reasonCode,
          sourceGapModel: {
            treatmentType: row.treatmentType,
            gapKind: row.gapKind,
            sourceGapCount: row.sourceGapCount,
            blocksClaims: row.blocksClaims,
            sourceRefs: row.sourceRefs,
            publicStatements: row.publicStatements,
          },
        }),
        evidenceWeight: 1,
        note: "Source-gap model row blocks stronger treatment/TSP coverage language until public inventory evidence exists.",
      }),
    );
    coverage.push(
      FindingCoverageAuditSchema.parse({
        auditId: stableId(detectorRunId, "audit", scopeId, reasonCode),
        detectorRunId,
        detectorId,
        month,
        scopeKind: routeId === null ? "system" : "route",
        scopeId,
        outcome: "hit",
        reasonCode: FindingReasonCodeSchema.parse(reasonCode),
        reason: "Treatment source-gap model row is present.",
        inputsSeenJson: JSON.stringify({
          treatmentType: row.treatmentType,
          gapKind: row.gapKind,
          sourceGapCount: row.sourceGapCount,
          blocksClaims: row.blocksClaims,
          sourceRefs: row.sourceRefs,
        }),
        inputsExpectedJson: JSON.stringify({
          sourceGapCount: 0,
          publicInventoryEvidence: "available",
        }),
        createdAt: input.generatedAt,
      }),
    );
  }

  return { candidates, evidence, coverage };
}
