import { describe, expect, test } from "bun:test";
import {
  buildSpeedPaceReviewQueue,
  type SpeedPaceCandidateLike,
  type SpeedPaceCoverageLike,
  type SpeedPaceEvidenceLike,
} from "../src/evaluation/speed-pace-review-queue";
import {
  buildSpeedPaceReadinessProjection,
  buildSpeedPaceReviewedGoldArtifact,
  evaluateSpeedPaceReviewedGold,
  type SpeedPaceReviewedDecision,
  speedPacePromotionGates,
} from "../src/evaluation/speed-pace-reviewed-gold";

const DET = "speed_pace_hotspot";
const FREE_FLOW = 2.0;

type SegSpec = {
  route: string;
  dir: string;
  seq: number;
  daypart: string;
  slowness: number;
  traversals: number;
  segLen: number | null;
  spatial: number | null;
  emitted: boolean;
  score?: number;
  outcome?: "clean_no_hit" | "skipped_failed_join" | "skipped_missing_input";
  reasonCode?: string;
};

function segmentId(s: SegSpec): string {
  return `${s.route}:${s.dir}:${s.seq}:${s.seq}00:${s.seq}01`;
}
function scopeId(s: SegSpec): string {
  return `${s.route}:2026-03:${s.dir}:${segmentId(s)}:${s.daypart}`;
}
function candidateId(s: SegSpec): string {
  return `cand-${scopeId(s)}`;
}

function metricsFields(s: SegSpec) {
  return {
    routeId: s.route,
    segmentId: segmentId(s),
    direction: s.dir,
    daypart: s.daypart,
    month: "2026-03",
    traversalCount: s.traversals,
    medianSpeedMph: 5,
    medianPaceMinutesPerMile: s.slowness * FREE_FLOW,
    freeFlowPaceMinutesPerMile: FREE_FLOW,
    systematicDelayMinutesPerMile: 1,
    stochasticDelayMinutesPerMile: 1,
    segmentLengthFeet: s.segLen,
    spatialConfidence: s.spatial,
    slownessIndex: s.slowness,
  };
}

function buildInputs(specs: SegSpec[]): {
  candidates: SpeedPaceCandidateLike[];
  evidence: SpeedPaceEvidenceLike[];
  coverage: SpeedPaceCoverageLike[];
} {
  const candidates: SpeedPaceCandidateLike[] = [];
  const evidence: SpeedPaceEvidenceLike[] = [];
  const coverage: SpeedPaceCoverageLike[] = [];
  for (const s of specs) {
    const m = metricsFields(s);
    coverage.push({
      detectorId: DET,
      scopeId: scopeId(s),
      routeId: s.route,
      outcome: s.emitted ? "hit" : (s.outcome ?? "clean_no_hit"),
      reasonCode: s.reasonCode ?? null,
      reason: null,
      inputsSeenJson: m,
    });
    if (s.emitted) {
      candidates.push({
        candidateId: candidateId(s),
        detectorId: DET,
        scopeId: scopeId(s),
        routeId: s.route,
        physicalId: segmentId(s),
        detectorScore: s.score ?? 90,
        severity: "medium",
        confidence: "medium",
        claimText: `Route ${s.route} segment ${segmentId(s)} runs at ${s.slowness}x free-flow pace during ${s.daypart}.`,
      });
      evidence.push({
        candidateId: candidateId(s),
        evidenceRole: "primary",
        evidenceRef: m,
      });
      evidence.push({
        candidateId: candidateId(s),
        evidenceRole: "counter_evidence",
        evidenceRef: { counterEvidence: ["Descriptive pace only."] },
      });
    }
  }
  return { candidates, evidence, coverage };
}

// A coherent synthetic slice exercising each stratum and gate.
const A: SegSpec = {
  route: "M1",
  dir: "N",
  seq: 10,
  daypart: "midday",
  slowness: 3.0,
  traversals: 600,
  segLen: 4000,
  spatial: 1,
  emitted: true,
  score: 95,
};
const B: SegSpec = {
  route: "M2",
  dir: "S",
  seq: 1,
  daypart: "midday",
  slowness: 2.5,
  traversals: 500,
  segLen: 4000,
  spatial: 1,
  emitted: true,
  score: 90,
}; // terminal first
const C: SegSpec = {
  route: "M3",
  dir: "N",
  seq: 5,
  daypart: "am_peak",
  slowness: 2.2,
  traversals: 18,
  segLen: 4000,
  spatial: 1,
  emitted: true,
  score: 84,
}; // low obs
const D: SegSpec = {
  route: "B12",
  dir: "E",
  seq: 7,
  daypart: "midday",
  slowness: 2.6,
  traversals: 700,
  segLen: 4500,
  spatial: 1,
  emitted: true,
  score: 92,
}; // dup canonical
const E: SegSpec = {
  route: "B12",
  dir: "E",
  seq: 7,
  daypart: "pm_peak",
  slowness: 2.4,
  traversals: 650,
  segLen: 4500,
  spatial: 1,
  emitted: true,
  score: 88,
}; // dup non-canonical
const P: SegSpec = {
  route: "M7",
  dir: "S",
  seq: 12,
  daypart: "midday",
  slowness: 2.3,
  traversals: 400,
  segLen: 4000,
  spatial: 1,
  emitted: true,
  score: 80,
}; // unreviewed, near_threshold

// Controls (not emitted) — including extent padding so emitted candidates are non-terminal.
const F: SegSpec = {
  route: "B36",
  dir: "S",
  seq: 8,
  daypart: "midday",
  slowness: 1.8,
  traversals: 400,
  segLen: 4000,
  spatial: 1,
  emitted: false,
}; // cap suppressed (Brooklyn)
const G: SegSpec = {
  route: "Q20",
  dir: "N",
  seq: 8,
  daypart: "midday",
  slowness: 1.7,
  traversals: 380,
  segLen: 4000,
  spatial: 1,
  emitted: false,
}; // cap suppressed (Queens)
const Hc: SegSpec = {
  route: "M1",
  dir: "N",
  seq: 1,
  daypart: "midday",
  slowness: 1.1,
  traversals: 300,
  segLen: 4000,
  spatial: 1,
  emitted: false,
};
const Ic: SegSpec = {
  route: "M1",
  dir: "N",
  seq: 20,
  daypart: "midday",
  slowness: 1.0,
  traversals: 300,
  segLen: 4000,
  spatial: 1,
  emitted: false,
}; // M1:N extent 1..20 -> A(10) mid
const Jc: SegSpec = {
  route: "M2",
  dir: "S",
  seq: 5,
  daypart: "midday",
  slowness: 1.0,
  traversals: 300,
  segLen: 4000,
  spatial: 1,
  emitted: false,
}; // M2:S extent 1..5 -> B(1) first
const Kc: SegSpec = {
  route: "M3",
  dir: "N",
  seq: 1,
  daypart: "midday",
  slowness: 1.0,
  traversals: 300,
  segLen: 4000,
  spatial: 1,
  emitted: false,
};
const Lc: SegSpec = {
  route: "M3",
  dir: "N",
  seq: 9,
  daypart: "midday",
  slowness: 1.0,
  traversals: 300,
  segLen: 4000,
  spatial: 1,
  emitted: false,
}; // M3:N extent 1..9 -> C(5) mid
const Nc: SegSpec = {
  route: "B12",
  dir: "E",
  seq: 1,
  daypart: "midday",
  slowness: 1.0,
  traversals: 300,
  segLen: 4000,
  spatial: 1,
  emitted: false,
};
const Oc: SegSpec = {
  route: "B12",
  dir: "E",
  seq: 15,
  daypart: "midday",
  slowness: 1.0,
  traversals: 300,
  segLen: 4000,
  spatial: 1,
  emitted: false,
}; // B12:E extent 1..15 -> D/E(7) mid
const Mskip: SegSpec = {
  route: "M5",
  dir: "N",
  seq: 3,
  daypart: "midday",
  slowness: 2.0,
  traversals: 10,
  segLen: 200,
  spatial: 1,
  emitted: false,
  outcome: "skipped_failed_join",
  reasonCode: "segment_too_short",
};
const Pc1: SegSpec = {
  route: "M7",
  dir: "S",
  seq: 1,
  daypart: "midday",
  slowness: 1.0,
  traversals: 300,
  segLen: 4000,
  spatial: 1,
  emitted: false,
};
const Pc2: SegSpec = {
  route: "M7",
  dir: "S",
  seq: 20,
  daypart: "midday",
  slowness: 1.0,
  traversals: 300,
  segLen: 4000,
  spatial: 1,
  emitted: false,
}; // M7:S extent 1..20 -> P(12) mid

const SPECS = [A, B, C, D, E, P, F, G, Hc, Ic, Jc, Kc, Lc, Nc, Oc, Mskip, Pc1, Pc2];
const INPUTS = buildInputs(SPECS);

const GENERATED_AT = "2026-06-08T00:00:00.000Z";
const RELEASE = "2026-03";

function queue() {
  return buildSpeedPaceReviewQueue({
    generatedAt: GENERATED_AT,
    releaseMonth: RELEASE,
    candidates: INPUTS.candidates,
    evidence: INPUTS.evidence,
    coverage: INPUTS.coverage,
  });
}

describe("speed pace review queue", () => {
  test("derives terminal position, duplicate scope, low observation, and cap suppression", () => {
    const q = queue();
    const byScope = new Map(q.items.map((it) => [it.scopeId, it]));
    expect(byScope.get(scopeId(B))?.terminalPosition).toBe("first");
    expect(byScope.get(scopeId(A))?.terminalPosition).toBe("mid");
    expect(byScope.get(scopeId(D))?.duplicatePhysicalCount).toBe(2);
    // Physical identity is the directed stop pair (last two segmentId components), route/order-free.
    expect(byScope.get(scopeId(D))?.physicalNodePairId).toBe("700:701");
    expect(byScope.get(scopeId(C))?.lowObservation).toBe(true);
    expect(byScope.get(scopeId(F))?.capSuppressed).toBe(true);
    expect(byScope.get(scopeId(Hc))?.capSuppressed).toBe(false); // slowness < 1.5
    expect(q.summary.capSuppressedCount).toBe(2); // F, G
  });

  test("assigns strata and selects a stratified, borough-spread batch", () => {
    const q = queue();
    const stratumByScope = new Map(q.items.map((it) => [it.scopeId, it.stratum]));
    expect(stratumByScope.get(scopeId(A))).toBe("top_score");
    expect(stratumByScope.get(scopeId(B))).toBe("terminal_segment");
    expect(stratumByScope.get(scopeId(C))).toBe("low_observation");
    expect(stratumByScope.get(scopeId(D))).toBe("duplicate_physical");
    expect(stratumByScope.get(scopeId(P))).toBe("near_threshold");
    expect(stratumByScope.get(scopeId(F))).toBe("cap_suppressed_control");
    expect(stratumByScope.get(scopeId(Mskip))).toBe("skipped_control");
    // cap-suppressed controls span both boroughs (round-robin spread), not just one.
    const capControls = q.items.filter(
      (it) => it.stratum === "cap_suppressed_control" && it.selectedForReview,
    );
    expect(new Set(capControls.map((it) => it.routeId?.[0])).size).toBeGreaterThan(1);
    expect(q.summary.emittedByBoroughPrefix["M"]).toBe(4); // A,B,C,P
    expect(q.summary.emittedByBoroughPrefix["B"]).toBe(2); // D,E
  });
});

const DECISIONS: SpeedPaceReviewedDecision[] = [
  {
    detectorId: DET,
    scopeId: scopeId(A),
    frontendUse: "primary_finding",
    calibrationTags: ["real_slow_segment"],
    reviewBatch: "speed_pace_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
  },
  {
    detectorId: DET,
    scopeId: scopeId(B),
    frontendUse: "suppress",
    falsePositiveRootCause: "terminal_or_layover",
    calibrationTags: ["terminal_or_layover"],
    reviewBatch: "speed_pace_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
  },
  {
    detectorId: DET,
    scopeId: scopeId(C),
    frontendUse: "primary_finding",
    calibrationTags: ["low_observation_count"],
    reviewBatch: "speed_pace_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "low",
  },
  {
    detectorId: DET,
    scopeId: scopeId(D),
    frontendUse: "primary_finding",
    calibrationTags: ["real_slow_segment", "duplicate_physical_scope"],
    reviewBatch: "speed_pace_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "high",
  },
  {
    detectorId: DET,
    scopeId: scopeId(E),
    frontendUse: "primary_finding",
    calibrationTags: ["duplicate_physical_scope"],
    reviewBatch: "speed_pace_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "medium",
  },
  {
    detectorId: DET,
    scopeId: scopeId(F),
    frontendUse: "primary_finding",
    calibrationTags: ["real_slow_segment", "cap_suppressed"],
    reviewBatch: "speed_pace_initial_2026_03",
    reviewDepth: "adversarial",
    reviewerConfidence: "medium",
  },
];

function gold() {
  return buildSpeedPaceReviewedGoldArtifact({
    generatedAt: GENERATED_AT,
    releaseMonth: RELEASE,
    decisionsPath: "decisions.json",
    reviewQueuePath: "queue.json",
    decisions: DECISIONS,
    reviewItems: queue().items,
  });
}

describe("speed pace reviewed gold", () => {
  test("builds labels with stable identity, tags, and bucket counts", () => {
    const g = gold();
    expect(g.summary.labelCount).toBe(6);
    expect(g.summary.primaryFindingCount).toBe(5); // A,C,D,E,F
    expect(g.summary.suppressCount).toBe(1); // B
    const labelA = g.labels.find((l) => l.scopeId === scopeId(A));
    expect(labelA?.identityKey).toBe(`${DET}\u0000${scopeId(A)}`);
    expect(labelA?.routeId).toBe("M1");
    expect(g.summary.byCalibrationTag["duplicate_physical_scope"]).toBe(2);
  });

  test("evaluator reports primary survival, suppress leakage, and cap-suppressed recall loss", () => {
    const g = gold();
    const evaluation = evaluateSpeedPaceReviewedGold({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE,
      gold: g,
      reviewItems: queue().items,
    });
    expect(evaluation.summary.primaryExpectedCount).toBe(5); // A,C,D,E,F
    expect(evaluation.summary.primarySurvivedCount).toBe(4); // F not emitted
    expect(evaluation.summary.primaryDroppedCount).toBe(1); // F
    expect(evaluation.summary.suppressExpectedCount).toBe(1); // B
    expect(evaluation.summary.suppressStillEmittedCount).toBe(1); // B leaks (still emitted)
    expect(evaluation.summary.unreviewedEmittedCount).toBe(1); // P
    expect(evaluation.summary.capSuppressedReviewedCount).toBe(1); // F
    expect(evaluation.summary.capSuppressedShouldEmitCount).toBe(1); // F
    expect(evaluation.byCalibrationTag["terminal_or_layover"]?.expected).toBe(1);
  });
});

describe("speed pace promotion gates + readiness", () => {
  test("gates block terminal, low observation, weak baseline, and unconfirmed geometry", () => {
    const q = queue();
    const byScope = new Map(q.items.map((it) => [it.scopeId, it]));
    const need = (s: SegSpec) => {
      const item = byScope.get(scopeId(s));
      if (item === undefined) throw new Error(`missing item ${scopeId(s)}`);
      return item;
    };
    expect(speedPacePromotionGates(need(A)).pass).toBe(true);
    expect(speedPacePromotionGates(need(B)).blockers).toContain("terminal_segment");
    expect(speedPacePromotionGates(need(C)).blockers).toContain("low_observation");
  });

  test("projects readiness buckets with duplicate downgrade and cap-recall in review queue", () => {
    const projection = buildSpeedPaceReadinessProjection({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE,
      gold: gold(),
      reviewItems: queue().items,
    });
    const bucketByScope = new Map(projection.items.map((it) => [it.scopeId, it.bucket]));
    expect(bucketByScope.get(scopeId(A))).toBe("public_finding_candidate");
    expect(bucketByScope.get(scopeId(D))).toBe("public_finding_candidate"); // canonical duplicate
    expect(bucketByScope.get(scopeId(E))).toBe("route_context"); // non-canonical duplicate downgrade
    expect(bucketByScope.get(scopeId(C))).toBe("review_queue"); // primary blocked by low-obs gate
    expect(bucketByScope.get(scopeId(B))).toBe("suppressed"); // reviewed suppress
    expect(bucketByScope.get(scopeId(F))).toBe("review_queue"); // reviewer wants it but cap dropped it
    expect(bucketByScope.get(scopeId(P))).toBe("review_queue"); // emitted but unreviewed
    expect(projection.summary.publicFindingCandidateCount).toBe(2);
    expect(projection.summary.reviewedSuppressedCount).toBe(1);
    expect(projection.summary.coverageSkippedCount).toBe(1); // F reviewed-but-not-emitted
  });
});

describe("physical node-pair dedupe across routes", () => {
  // Two different routes traverse the SAME directed stop pair (seq 34 -> stops 3400:3401), both
  // emitted primaries. They must collapse to one public candidate; the lower-score route is
  // downgraded to route_context with a duplicate_physical_scope caveat.
  const u1: SegSpec = {
    route: "M101",
    dir: "N",
    seq: 34,
    daypart: "midday",
    slowness: 4.0,
    traversals: 900,
    segLen: 1000,
    spatial: 1,
    emitted: true,
    score: 100,
  };
  const u2: SegSpec = {
    route: "M102",
    dir: "N",
    seq: 34,
    daypart: "midday",
    slowness: 3.6,
    traversals: 700,
    segLen: 1000,
    spatial: 1,
    emitted: true,
    score: 98,
  };
  // Extent padding so seq 34 is mid (not terminal) on each route+direction.
  const pad = (route: string, seq: number): SegSpec => ({
    route,
    dir: "N",
    seq,
    daypart: "midday",
    slowness: 1.0,
    traversals: 300,
    segLen: 1000,
    spatial: 1,
    emitted: false,
  });
  const SPECS2 = [u1, u2, pad("M101", 1), pad("M101", 60), pad("M102", 1), pad("M102", 60)];
  const INPUTS2 = buildInputs(SPECS2);

  function queue2() {
    return buildSpeedPaceReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE,
      candidates: INPUTS2.candidates,
      evidence: INPUTS2.evidence,
      coverage: INPUTS2.coverage,
    });
  }

  test("counts cross-route duplicates and promotes only one canonical public candidate", () => {
    const q = queue2();
    const byScope = new Map(q.items.map((it) => [it.scopeId, it]));
    expect(byScope.get(scopeId(u1))?.physicalNodePairId).toBe("3400:3401");
    expect(byScope.get(scopeId(u2))?.physicalNodePairId).toBe("3400:3401");
    // Both routes share the physical scope -> duplicate count 2 despite different routes.
    expect(byScope.get(scopeId(u1))?.duplicatePhysicalCount).toBe(2);
    expect(byScope.get(scopeId(u2))?.duplicatePhysicalCount).toBe(2);

    const decisions: SpeedPaceReviewedDecision[] = [
      {
        detectorId: DET,
        scopeId: scopeId(u1),
        frontendUse: "primary_finding",
        calibrationTags: ["real_slow_segment"],
        reviewBatch: "b",
        reviewDepth: "d",
      },
      {
        detectorId: DET,
        scopeId: scopeId(u2),
        frontendUse: "primary_finding",
        calibrationTags: ["real_slow_segment", "duplicate_physical_scope"],
        reviewBatch: "b",
        reviewDepth: "d",
      },
    ];
    const g = buildSpeedPaceReviewedGoldArtifact({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE,
      decisionsPath: "d.json",
      reviewQueuePath: "q.json",
      decisions,
      reviewItems: q.items,
    });
    const projection = buildSpeedPaceReadinessProjection({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE,
      gold: g,
      reviewItems: q.items,
    });
    const byScopeBucket = new Map(projection.items.map((it) => [it.scopeId, it]));
    expect(byScopeBucket.get(scopeId(u1))?.bucket).toBe("public_finding_candidate"); // higher score wins
    expect(byScopeBucket.get(scopeId(u2))?.bucket).toBe("route_context"); // cross-route duplicate downgrade
    expect(byScopeBucket.get(scopeId(u2))?.caveats).toContain("duplicate_physical_scope");
    expect(projection.summary.publicFindingCandidateCount).toBe(1);
  });
});
