import {
  freshnessForDataAsOf,
  freshnessReferenceMonth,
  type RouteCapabilityManifest,
  type RouteCapabilityManifestRow,
  type RouteSurfaceCapability,
  type RouteSurfaceState,
} from "@bp/domain/studio";
import { type CoverageWindow, releaseIdFromPublishedAt } from "@bp/domain/studio/shared";

/**
 * Pure builder for the route capability manifest (frontend §7.1 / hard-cutover C1).
 *
 * Takes one explicit input row per route — already resolved from the pipeline's
 * local-DB readers and the detector readiness manifest — and emits the per-surface
 * state machine the Worker serves. No DB or filesystem access: the messy join lives
 * in the pipeline adapter (`tools/pipeline-v2/.../export/d1-inputs.ts`); this stays a
 * deterministic, unit-testable projection.
 *
 * Surfaces are KPI-aligned (§4.1: Condition / Trend / Reliability / Riders / Treatment
 * posture). The route-level `overallState` is a readiness rollup whose mapping onto the
 * legacy support tiers is exact, so the snapshot counts re-derive without the deleted
 * `supportLevel` enum:
 *   summaryReady  = overallState !== "insufficient_data"
 *   artifactReady = overallState in {partial, checked_clean, ready}
 *   evidenceReady = overallState === "ready"
 */

/** Per-surface source availability, normalized by the adapter from `route_month_source_status`. */
export type RouteCapabilitySourceStatus = "available" | "partial" | "blocked" | "absent";

export type RouteCapabilityInputRow = {
  readonly routeId: string;
  /** Summary (route brief) presence + public visibility — drives `condition`. */
  readonly hasSummary: boolean;
  readonly publicVisible: boolean;
  /** Source month behind the summary — `condition` dataAsOf. */
  readonly conditionDataAsOf: string | null;
  /** Rich route-detail (Tier-2) artifact present — lifts `overallState` past `building`. */
  readonly hasArtifact: boolean;
  readonly history: {
    readonly endMonth: string | null;
    readonly pointCount: number;
    readonly speedMonthCount: number;
    readonly ridershipMonthCount: number;
  };
  readonly speedHistory: {
    readonly endMonth: string | null;
    readonly monthCount: number;
    readonly missingCellCount: number;
  } | null;
  readonly scheduleTimepointCount: number;
  readonly treatment: {
    readonly aceActive: boolean;
    readonly busLaneMatchedLaneCount: number;
  };
  readonly detector: {
    /** Route appears in the detector readiness manifest at all. */
    readonly present: boolean;
    readonly findingCandidateCount: number;
    readonly contextCount: number;
    readonly reviewQueueCount: number;
    readonly suppressedCount: number;
    /** Reliability-family subset (observed reliability / headway), classified by the adapter. */
    readonly reliabilityFindingCount: number;
    readonly reliabilityContextCount: number;
    readonly months: readonly string[];
    readonly caveats: readonly string[];
  };
  /**
   * Per-route source availability, normalized from `route_month_source_status`. That
   * table tracks the `reliability` (Bus Observatory) and `equity_context` (ridership)
   * scopes — there is no speed/schedule source there, so only those two surfaces can
   * go `blocked` from a source failure today.
   */
  readonly sourceStatus: {
    readonly reliability: RouteCapabilitySourceStatus;
    readonly ridership: RouteCapabilitySourceStatus;
  };
};

export type BuildRouteCapabilityManifestInput = {
  readonly generatedAt: string;
  readonly releaseId: string;
  readonly publishedAt: string;
  readonly coverage: CoverageWindow;
  readonly rows: readonly RouteCapabilityInputRow[];
};

function latestMonth(months: readonly string[]): string | null {
  let latest: string | null = null;
  for (const month of months) {
    if (latest === null || month > latest) latest = month;
  }
  return latest;
}

function surface(
  referenceMonth: string,
  input: {
    state: RouteSurfaceState;
    reason: string | null;
    depth: RouteSurfaceCapability["depth"];
    dataAsOf: string | null;
  },
): RouteSurfaceCapability {
  return {
    state: input.state,
    reason: input.reason,
    depth: input.depth,
    dataAsOf: input.dataAsOf,
    freshness: freshnessForDataAsOf(input.dataAsOf, referenceMonth),
  };
}

function conditionSurface(
  row: RouteCapabilityInputRow,
  referenceMonth: string,
): RouteSurfaceCapability {
  if (!row.hasSummary) {
    return surface(referenceMonth, {
      state: "insufficient_data",
      reason: "no route summary",
      depth: null,
      dataAsOf: null,
    });
  }
  return surface(referenceMonth, {
    state: row.publicVisible ? "ready" : "partial",
    reason: row.publicVisible ? null : "summary built but not public",
    depth: null,
    dataAsOf: row.conditionDataAsOf,
  });
}

function trendSurface(
  row: RouteCapabilityInputRow,
  referenceMonth: string,
): RouteSurfaceCapability {
  if (row.history.pointCount === 0) {
    return surface(referenceMonth, {
      state: "insufficient_data",
      reason: "no multi-month history",
      depth: null,
      dataAsOf: null,
    });
  }
  const partial = row.speedHistory !== null && row.speedHistory.missingCellCount > 0;
  return surface(referenceMonth, {
    state: partial ? "partial" : "ready",
    reason: partial ? "speed history has missing cells" : null,
    depth: { monthsCovered: row.history.pointCount, grains: ["route_month"] },
    dataAsOf: row.history.endMonth,
  });
}

function speedHistorySurface(
  row: RouteCapabilityInputRow,
  referenceMonth: string,
): RouteSurfaceCapability {
  if (row.speedHistory !== null) {
    const partial = row.speedHistory.missingCellCount > 0;
    return surface(referenceMonth, {
      state: partial ? "partial" : "ready",
      reason: partial ? `${row.speedHistory.missingCellCount} cells missing` : null,
      depth: { monthsCovered: row.speedHistory.monthCount, grains: ["segment_month"] },
      dataAsOf: row.speedHistory.endMonth,
    });
  }
  if (row.history.speedMonthCount > 0) {
    return surface(referenceMonth, {
      state: "building",
      reason: "speed months present, history artifact not built",
      depth: { monthsCovered: row.history.speedMonthCount, grains: ["segment_month"] },
      dataAsOf: null,
    });
  }
  return surface(referenceMonth, {
    state: "insufficient_data",
    reason: "no segment speed history",
    depth: null,
    dataAsOf: null,
  });
}

function ridershipSurface(
  row: RouteCapabilityInputRow,
  referenceMonth: string,
): RouteSurfaceCapability {
  if (row.sourceStatus.ridership === "blocked") {
    return surface(referenceMonth, {
      state: "blocked",
      reason: "ridership source blocked",
      depth: null,
      dataAsOf: null,
    });
  }
  if (row.history.ridershipMonthCount > 0) {
    return surface(referenceMonth, {
      state: "ready",
      reason: null,
      depth: { monthsCovered: row.history.ridershipMonthCount, grains: ["route_month"] },
      dataAsOf: row.history.endMonth,
    });
  }
  return surface(referenceMonth, {
    state: "insufficient_data",
    reason: "no ridership history",
    depth: null,
    dataAsOf: null,
  });
}

function scheduleBaselineSurface(
  row: RouteCapabilityInputRow,
  referenceMonth: string,
): RouteSurfaceCapability {
  if (row.scheduleTimepointCount > 0) {
    return surface(referenceMonth, {
      state: "ready",
      reason: null,
      depth: { monthsCovered: 1, grains: ["schedule_timepoint"] },
      dataAsOf: row.conditionDataAsOf,
    });
  }
  return surface(referenceMonth, {
    state: "insufficient_data",
    reason: "no schedule timepoints",
    depth: null,
    dataAsOf: null,
  });
}

function treatmentSurface(
  row: RouteCapabilityInputRow,
  referenceMonth: string,
): RouteSurfaceCapability {
  const hasTreatment = row.treatment.aceActive || row.treatment.busLaneMatchedLaneCount > 0;
  if (hasTreatment) {
    const parts: string[] = [];
    if (row.treatment.busLaneMatchedLaneCount > 0) {
      parts.push(`${row.treatment.busLaneMatchedLaneCount} bus-lane segments`);
    }
    if (row.treatment.aceActive) parts.push("ACE active");
    return surface(referenceMonth, {
      state: "ready",
      reason: parts.join("; ") || null,
      depth: null,
      dataAsOf: row.conditionDataAsOf,
    });
  }
  if (row.hasSummary) {
    return surface(referenceMonth, {
      state: "checked_clean",
      reason: "no bus lane or ACE treatment on record",
      depth: null,
      dataAsOf: row.conditionDataAsOf,
    });
  }
  return surface(referenceMonth, {
    state: "insufficient_data",
    reason: "no summary to assess treatment",
    depth: null,
    dataAsOf: null,
  });
}

function reliabilitySurface(
  row: RouteCapabilityInputRow,
  referenceMonth: string,
): RouteSurfaceCapability {
  if (row.sourceStatus.reliability === "blocked") {
    return surface(referenceMonth, {
      state: "blocked",
      reason: "reliability source blocked",
      depth: null,
      dataAsOf: null,
    });
  }
  const dataAsOf = latestMonth(row.detector.months);
  if (row.detector.reliabilityFindingCount > 0) {
    return surface(referenceMonth, {
      state: "ready",
      reason: null,
      depth: { monthsCovered: row.detector.months.length, grains: ["detector_run"] },
      dataAsOf,
    });
  }
  if (row.detector.reliabilityContextCount > 0) {
    return surface(referenceMonth, {
      state: "checked_clean",
      reason: "reliability detectors ran; no public finding",
      depth: { monthsCovered: row.detector.months.length, grains: ["detector_run"] },
      dataAsOf,
    });
  }
  if (row.detector.present) {
    return surface(referenceMonth, {
      state: "building",
      reason: "reliability detectors not yet calibrated for this route",
      depth: null,
      dataAsOf,
    });
  }
  return surface(referenceMonth, {
    state: "insufficient_data",
    reason: "no detector coverage",
    depth: null,
    dataAsOf: null,
  });
}

function detectorFindingsSurface(
  row: RouteCapabilityInputRow,
  referenceMonth: string,
): RouteSurfaceCapability {
  const dataAsOf = latestMonth(row.detector.months);
  if (row.detector.findingCandidateCount > 0) {
    return surface(referenceMonth, {
      state: "ready",
      reason: `${row.detector.findingCandidateCount} finding candidate(s)`,
      depth: { monthsCovered: row.detector.months.length, grains: ["detector_run"] },
      dataAsOf,
    });
  }
  if (
    row.detector.contextCount + row.detector.reviewQueueCount + row.detector.suppressedCount >
    0
  ) {
    return surface(referenceMonth, {
      state: "checked_clean",
      reason: "detectors ran; nothing public",
      depth: { monthsCovered: row.detector.months.length, grains: ["detector_run"] },
      dataAsOf,
    });
  }
  if (row.detector.present) {
    return surface(referenceMonth, {
      state: "building",
      reason: "detector coverage expanding",
      depth: null,
      dataAsOf,
    });
  }
  return surface(referenceMonth, {
    state: "insufficient_data",
    reason: "no detector coverage",
    depth: null,
    dataAsOf: null,
  });
}

/**
 * Readiness rollup. The mapping to legacy support tiers is intentional and exact (see
 * file header): no-summary => insufficient_data, summary-only => building,
 * artifact-without-public-finding => partial/checked_clean, artifact+finding => ready.
 * Source-level failures surface as per-surface `blocked`, not at the route level, so
 * the snapshot counts stay derivable from `overallState` alone.
 */
function overallState(row: RouteCapabilityInputRow): RouteSurfaceState {
  if (!row.hasSummary) return "insufficient_data";
  if (!row.hasArtifact) return "building";
  if (row.detector.findingCandidateCount > 0) return "ready";
  if (
    row.detector.contextCount + row.detector.reviewQueueCount + row.detector.suppressedCount >
    0
  ) {
    return "checked_clean";
  }
  return "partial";
}

function buildRow(
  row: RouteCapabilityInputRow,
  referenceMonth: string,
): RouteCapabilityManifestRow {
  return {
    routeId: row.routeId,
    overallState: overallState(row),
    surfaces: {
      condition: conditionSurface(row, referenceMonth),
      trend: trendSurface(row, referenceMonth),
      speedHistory: speedHistorySurface(row, referenceMonth),
      reliability: reliabilitySurface(row, referenceMonth),
      ridership: ridershipSurface(row, referenceMonth),
      treatment: treatmentSurface(row, referenceMonth),
      scheduleBaseline: scheduleBaselineSurface(row, referenceMonth),
      detectorFindings: detectorFindingsSurface(row, referenceMonth),
    },
    caveats: [...new Set(row.detector.caveats)].sort((left, right) => left.localeCompare(right)),
  };
}

export function buildRouteCapabilityManifest(
  input: BuildRouteCapabilityManifestInput,
): RouteCapabilityManifest {
  if (input.releaseId !== releaseIdFromPublishedAt(input.publishedAt)) {
    throw new Error("releaseId must match the canonical publishedAt-derived release ID.");
  }
  const referenceMonth = freshnessReferenceMonth(input.publishedAt);
  const routes = [...input.rows]
    .sort((left, right) => left.routeId.localeCompare(right.routeId))
    .map((row) => buildRow(row, referenceMonth));
  return {
    artifactKind: "route_capability_manifest",
    schemaVersion: 2,
    generatedAt: input.generatedAt,
    releaseId: input.releaseId,
    publishedAt: input.publishedAt,
    coverage: input.coverage,
    routes,
  };
}
