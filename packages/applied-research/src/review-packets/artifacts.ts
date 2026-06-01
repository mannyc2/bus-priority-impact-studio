import { stableId } from "@bp/analytics/core";
import {
  buildFindingDetectorSpecsArtifact,
  getFindingDetectorSpec,
  listAnalyticsDetectors,
} from "@bp/analytics/registry";
import {
  FindingPromotionQueueArtifactSchema,
  FindingReviewPacketsArtifactSchema,
  type FindingCandidate,
  type FindingCoverageAudit,
  type FindingEvidenceLink,
  type FindingPromotionNextAction,
  type FindingPromotionQueueArtifact,
  type FindingPromotionReadiness,
  type FindingReviewPacket,
  type FindingReviewPacketsArtifact,
} from "@bp/domain";

export type FindingReviewPacketCoverageArtifact = {
  artifactKind: "finding_review_packet_coverage";
  schemaVersion: 1;
  generatedAt: string;
  month: string;
  reviewPacketsArtifactPath: string;
  promotionQueueArtifactPath: string;
  detectorSpecsArtifactPath: string;
  summary: {
    registeredDetectorCount: number;
    detectorWithCandidateCount: number;
    detectorWithPacketCount: number;
    candidateCount: number;
    packetCount: number;
    missingPacketCandidateCount: number;
    packetCompleteDetectorCount: number;
    packetPartialDetectorCount: number;
    packetMissingDetectorCount: number;
    noCandidateDetectorCount: number;
  };
  detectors: Array<{
    detectorId: string;
    registered: boolean;
    candidateCount: number;
    packetCount: number;
    evidenceLinkCount: number;
    coverageHitCount: number;
    missingPacketCount: number;
    packetsWithoutPrimaryEvidence: number;
    packetsWithoutCounterEvidence: number;
    packetsWithoutCoverage: number;
    status: "complete" | "partial" | "missing" | "no_candidates";
  }>;
};

type FindingReviewQueueCandidate = {
  reviewRank: number;
  reviewState: string;
  candidateId: string;
  detectorId: string;
  routeId: string | null;
  scopeKind: string;
  scopeId: string;
  reasonCode: string;
  category: string;
  severity: string;
  confidence: string;
  detectorScore: number;
  reviewPriority: number;
  reviewPriorityBand: "critical" | "high" | "medium" | "low";
  reviewSignals: string[];
  claimSafeLabel: string;
  claimText: string;
  evidenceRefs: string[];
  evidenceRefCount: number;
  readiness: FindingPromotionReadiness;
  recommendedNextAction: FindingPromotionNextAction;
  promotionBlockers: string[];
};

export type FindingReviewQueueArtifact = {
  artifactKind: "finding_review_queue";
  schemaVersion: 1;
  generatedAt: string;
  month: string;
  totalCandidateCount: number;
  candidateCount: number;
  evidenceLinkedCandidateCount: number;
  unlinkedCandidateCount: number;
  omittedCandidateCount: number;
  queueLimit: number;
  detectorCounts: Record<string, number>;
  totalDetectorCounts: Record<string, number>;
  summary: {
    totalPriorityBandCounts: Record<"critical" | "high" | "medium" | "low", number>;
    surfacedPriorityBandCounts: Record<"critical" | "high" | "medium" | "low", number>;
    omittedPriorityBandCounts: Record<"critical" | "high" | "medium" | "low", number>;
    surfacedCategoryCounts: Record<string, number>;
    routePriorityBandCounts: Record<"critical" | "high" | "medium" | "low", number>;
    multiDetectorRouteCount: number;
    criticalRouteGroupCount: number;
    capExhaustedPriorityBands: string[];
  };
  health: {
    status: "ok" | "warn";
    issues: Array<{
      severity: "info" | "warn";
      code: string;
      message: string;
      count: number;
    }>;
  };
  agentReview: {
    source: "review_packets";
    packetCoverageArtifactPath: string;
    promotionQueueArtifactPath: string;
  };
  routeGroups: Array<{
    routeId: string;
    candidateCount: number;
    detectorIds: string[];
    topReviewPriority: number;
    topReviewPriorityBand: "critical" | "high" | "medium" | "low";
    candidateIds: string[];
  }>;
  routeGroupCount: number;
  candidates: FindingReviewQueueCandidate[];
};

export type ReviewPacketBuildArtifacts = {
  detectorSpecs: ReturnType<typeof buildFindingDetectorSpecsArtifact>;
  reviewPackets: FindingReviewPacketsArtifact;
  promotionQueue: FindingPromotionQueueArtifact;
  reviewQueue: FindingReviewQueueArtifact;
  coverage: FindingReviewPacketCoverageArtifact;
};

const COMMON_REVIEW_CHECKLIST = [
  "Read the claim text, detector/reason code, scope, priority, confidence, and evidence objects.",
  "Audit whether detector inputs support emitting this candidate without relying on detector score alone.",
  "Check whether the detector claim overstates, conflates, or underspecifies the evidence.",
  "Return one detector action: keep, downgrade, suppress, split, or enrich.",
];

const REVIEWER_DECISION_OPTIONS = [
  {
    decision: "approve",
    meaning: "Promote the finding as written with the approved evidence refs.",
  },
  {
    decision: "approve_with_revisions",
    meaning: "Promote after applying the revised claim text or caveats.",
  },
  {
    decision: "defer",
    meaning: "Keep in review because more evidence or reviewer time is needed.",
  },
  {
    decision: "reject",
    meaning: "Reject as unsupported, misleading, duplicate, or otherwise not useful.",
  },
  {
    decision: "downgrade_to_context",
    meaning: "Do not promote as a finding; keep as context for another packet or brief.",
  },
] as const;

const PROMOTION_READINESS_VALUES = [
  "ready_for_review",
  "needs_enrichment",
  "blocked",
] as const;

const PROMOTION_NEXT_ACTION_VALUES = [
  "review_for_promotion",
  "revise_claim_before_promotion",
  "keep_as_data_quality",
  "enrich_before_promotion",
  "do_not_promote",
] as const;

const COUNTER_EVIDENCE_WAIVED_DETECTORS = new Set(["source_gap"]);

function parseJsonRef(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function countBy<T extends string>(values: readonly T[]): Record<T, number> {
  const output = {} as Record<T, number>;
  for (const value of values) output[value] = (output[value] ?? 0) + 1;
  return output;
}

function countKnownValues<const T extends readonly string[]>(
  values: readonly string[],
  knownValues: T,
): Record<T[number], number> {
  const output = Object.fromEntries(knownValues.map((value) => [value, 0])) as Record<
    T[number],
    number
  >;
  for (const value of values) {
    if (value in output) output[value as T[number]] += 1;
  }
  return output;
}

function severityPriority(severity: string): number {
  if (severity === "high") return 10;
  if (severity === "medium") return 5;
  if (severity === "low") return 2;
  return 0;
}

function confidencePriority(confidence: string): number {
  if (confidence === "high") return 5;
  if (confidence === "medium") return 2;
  return 0;
}

function priorityBand(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 100) return "critical";
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function candidatePriority(candidate: FindingCandidate): {
  score: number;
  band: "critical" | "high" | "medium" | "low";
  signals: string[];
} {
  const score = Math.round(
    candidate.detectorScore +
      severityPriority(candidate.severity) +
      confidencePriority(candidate.confidence),
  );
  return {
    score,
    band: priorityBand(score),
    signals: [
      `${candidate.detectorId}:${candidate.reasonCode}`,
      `${candidate.severity}_severity`,
      `${candidate.confidence}_confidence`,
    ],
  };
}

function coverageKey(input: {
  detectorRunId: string;
  detectorId: string;
  scopeKind: string;
  scopeId: string;
}): string {
  return [input.detectorRunId, input.detectorId, input.scopeKind, input.scopeId].join("\0");
}

function roleGroups(evidence: readonly FindingEvidenceLink[]): FindingReviewPacket["evidence"] {
  return {
    primary: evidence.filter((link) => link.evidenceRole === "primary"),
    context: evidence.filter((link) => link.evidenceRole === "context"),
    counterEvidence: evidence.filter((link) => link.evidenceRole === "counter_evidence"),
    caveats: evidence.filter((link) => link.evidenceRole === "caveat"),
    missingData: evidence.filter((link) => link.evidenceRole === "missing_data"),
    coverageAudit: evidence.filter((link) => link.evidenceRole === "coverage_audit"),
  };
}

function evidenceObjects(
  evidence: FindingReviewPacket["evidence"],
): FindingReviewPacket["evidenceObjects"] {
  return {
    primary: evidence.primary.map((link) => parseJsonRef(link.evidenceRef)),
    context: evidence.context.map((link) => parseJsonRef(link.evidenceRef)),
    counterEvidence: evidence.counterEvidence.map((link) => parseJsonRef(link.evidenceRef)),
    caveats: evidence.caveats.map((link) => parseJsonRef(link.evidenceRef)),
    missingData: evidence.missingData.map((link) => parseJsonRef(link.evidenceRef)),
    coverageAudit: evidence.coverageAudit.map((link) => parseJsonRef(link.evidenceRef)),
  };
}

function reviewChecklist(input: {
  candidate: FindingCandidate;
  detectorChecklist: readonly string[];
}): string[] {
  const scopeChecklist =
    input.candidate.scopeKind === "route"
      ? []
      : ["Check whether the non-route scope is specific enough or should be split/enriched."];
  return [
    ...input.detectorChecklist,
    ...COMMON_REVIEW_CHECKLIST.slice(0, 2),
    ...scopeChecklist,
    ...COMMON_REVIEW_CHECKLIST.slice(2),
  ];
}

function promotionBlockers(input: {
  candidate: FindingCandidate;
  evidence: FindingReviewPacket["evidence"];
  coverage: readonly FindingCoverageAudit[];
  hasDetectorSpec: boolean;
}): string[] {
  const blockers: string[] = [];
  if (!input.hasDetectorSpec) blockers.push("Detector spec is missing from the registry.");
  if (input.evidence.primary.length === 0 && input.evidence.missingData.length === 0) {
    blockers.push("No primary or missing-data evidence link is attached.");
  }
  if (input.evidence.counterEvidence.length === 0) {
    blockers.push("No counter-evidence or caveat suppressor is attached.");
  }
  if (input.coverage.length === 0) blockers.push("No matching coverage audit row is attached.");
  if (input.candidate.detectorId === "source_gap" || input.candidate.category === "data_quality") {
    blockers.push("Data-quality packets should not be promoted as service-performance findings.");
  }
  return blockers;
}

function buildPacket(input: {
  candidate: FindingCandidate;
  reviewRank: number;
  evidenceLinks: readonly FindingEvidenceLink[];
  coverage: readonly FindingCoverageAudit[];
  existingPacketId: string | null;
}): FindingReviewPacket {
  const detectorSpec = getFindingDetectorSpec(input.candidate.detectorId);
  if (detectorSpec === null) {
    throw new Error(`Missing detector spec for ${input.candidate.detectorId}`);
  }
  const evidence = roleGroups(input.evidenceLinks);
  const checklist = reviewChecklist({
    candidate: input.candidate,
    detectorChecklist: detectorSpec.promotionChecklist,
  });
  const packetCompleteness = {
    hasPrimaryEvidence: evidence.primary.length > 0 || evidence.missingData.length > 0,
    hasCounterEvidence: evidence.counterEvidence.length > 0,
    hasCoverageAudit: input.coverage.length > 0,
    hasDetectorSpec: true,
    hasReviewChecklist: checklist.length > 0,
  };
  return {
    packetId:
      input.existingPacketId ?? stableId("finding-review-packet", input.candidate.candidateId),
    reviewRank: input.reviewRank,
    candidate: input.candidate,
    detectorSpec,
    priority: candidatePriority(input.candidate),
    evidence,
    evidenceObjects: evidenceObjects(evidence),
    coverage: [...input.coverage],
    derivedMetricWarnings: [],
    promotionBlockers: promotionBlockers({
      candidate: input.candidate,
      evidence,
      coverage: input.coverage,
      hasDetectorSpec: true,
    }),
    reviewChecklist: checklist,
    allowedClaimStrength: detectorSpec.allowedClaimStrength,
    packetCompleteness,
  };
}

function evidenceSummary(packet: FindingReviewPacket) {
  return {
    primaryCount: packet.evidence.primary.length,
    contextCount: packet.evidence.context.length,
    counterEvidenceCount: packet.evidence.counterEvidence.length,
    caveatCount: packet.evidence.caveats.length,
    missingDataCount: packet.evidence.missingData.length,
    coverageAuditCount: packet.coverage.length + packet.evidence.coverageAudit.length,
  };
}

function readinessForPacket(packet: FindingReviewPacket): FindingPromotionReadiness {
  if (
    packet.candidate.detectorId === "source_gap" ||
    packet.candidate.category === "data_quality" ||
    !packet.packetCompleteness.hasPrimaryEvidence ||
    !packet.packetCompleteness.hasCoverageAudit
  ) {
    return "blocked" as FindingPromotionReadiness;
  }
  if (!packet.packetCompleteness.hasCounterEvidence) {
    return "needs_enrichment" as FindingPromotionReadiness;
  }
  return "ready_for_review" as FindingPromotionReadiness;
}

function nextActionForPacket(packet: FindingReviewPacket): FindingPromotionNextAction {
  if (packet.candidate.detectorId === "source_gap" || packet.candidate.category === "data_quality") {
    return "keep_as_data_quality" as FindingPromotionNextAction;
  }
  if (!packet.packetCompleteness.hasPrimaryEvidence || !packet.packetCompleteness.hasCoverageAudit) {
    return "enrich_before_promotion" as FindingPromotionNextAction;
  }
  if (!packet.packetCompleteness.hasCounterEvidence) {
    return "enrich_before_promotion" as FindingPromotionNextAction;
  }
  if (packet.candidate.claimSafeLabel === "issue_needs_review") {
    return "revise_claim_before_promotion" as FindingPromotionNextAction;
  }
  return "review_for_promotion" as FindingPromotionNextAction;
}

function promotionQueueFromPackets(input: {
  month: string;
  generatedAt: string;
  reviewPacketsArtifactPath: string;
  packets: readonly FindingReviewPacket[];
}): FindingPromotionQueueArtifact {
  const candidates = input.packets.map((packet) => {
    const readiness = readinessForPacket(packet);
    const recommendedNextAction = nextActionForPacket(packet);
    return {
      packetId: packet.packetId,
      reviewRank: packet.reviewRank,
      candidate: packet.candidate,
      readiness,
      recommendedNextAction,
      promotionPriority: packet.priority.score,
      promotionPriorityBand: packet.priority.band,
      allowedClaimStrength: packet.allowedClaimStrength,
      maxPromotableClaimStrength:
        readiness === "ready_for_review"
          ? packet.allowedClaimStrength
          : Math.min(1, packet.allowedClaimStrength),
      promotionBlockers: packet.promotionBlockers,
      requiredReviewerActions: [
        "Confirm primary evidence directly supports the claim text and scope.",
        "Confirm counter-evidence does not block promotion or requires claim revision.",
        "Choose one promotion decision and include rationale plus evidence refs approved.",
      ],
      evidenceSummary: evidenceSummary(packet),
      reviewChecklist: packet.reviewChecklist,
    };
  });
  return FindingPromotionQueueArtifactSchema.parse({
    artifactKind: "finding_promotion_queue",
    schemaVersion: 1,
    month: input.month,
    generatedAt: input.generatedAt,
    reviewPacketsArtifactPath: input.reviewPacketsArtifactPath,
    candidateCount: candidates.length,
    summary: {
      candidateCount: candidates.length,
      readinessCounts: countKnownValues(
        candidates.map((candidate) => candidate.readiness),
        PROMOTION_READINESS_VALUES,
      ),
      recommendedNextActionCounts: countKnownValues(
        candidates.map((candidate) => candidate.recommendedNextAction),
        PROMOTION_NEXT_ACTION_VALUES,
      ),
      detectorCounts: countBy(candidates.map((candidate) => candidate.candidate.detectorId)),
      readyForReviewCount: candidates.filter(
        (candidate) => candidate.readiness === "ready_for_review",
      ).length,
      blockedCount: candidates.filter((candidate) => candidate.readiness === "blocked").length,
    },
    reviewerDecisionOptions: REVIEWER_DECISION_OPTIONS,
    outputSchema: {
      candidateId: "string",
      decision: "approve | approve_with_revisions | defer | reject | downgrade_to_context",
      revisedClaimText: "string | null",
      rationale: "string",
      evidenceRefsApproved: "string[]",
      reviewer: "string",
      reviewedAt: "ISO datetime",
    },
    candidates,
  });
}

function evidenceRefsForPacket(packet: FindingReviewPacket): string[] {
  return [
    ...packet.evidence.primary,
    ...packet.evidence.context,
    ...packet.evidence.counterEvidence,
    ...packet.evidence.caveats,
    ...packet.evidence.missingData,
    ...packet.evidence.coverageAudit,
  ].map((link) => link.evidenceRef);
}

function routeGroupKey(candidate: {
  routeId: string | null;
  scopeKind: string;
  scopeId: string;
}): string | null {
  return candidate.routeId ?? (candidate.scopeKind === "route" ? candidate.scopeId : null);
}

function reviewQueueFromPackets(input: {
  month: string;
  generatedAt: string;
  reviewPacketsArtifactPath: string;
  promotionQueueArtifactPath: string;
  packetCoverageArtifactPath: string;
  packets: readonly FindingReviewPacket[];
  queueLimit: number;
}): FindingReviewQueueArtifact {
  const allCandidates = input.packets.map((packet) => {
    const readiness = readinessForPacket(packet);
    const recommendedNextAction = nextActionForPacket(packet);
    const evidenceRefs = evidenceRefsForPacket(packet);
    return {
      reviewRank: packet.reviewRank,
      reviewState: packet.candidate.reviewState,
      candidateId: packet.candidate.candidateId,
      detectorId: packet.candidate.detectorId,
      routeId: packet.candidate.routeId,
      scopeKind: packet.candidate.scopeKind,
      scopeId: packet.candidate.scopeId,
      reasonCode: packet.candidate.reasonCode,
      category: packet.candidate.reasonCode,
      severity: packet.candidate.severity,
      confidence: packet.candidate.confidence,
      detectorScore: packet.candidate.detectorScore,
      reviewPriority: packet.priority.score,
      reviewPriorityBand: packet.priority.band,
      reviewSignals: packet.priority.signals,
      claimSafeLabel: packet.candidate.claimSafeLabel,
      claimText: packet.candidate.claimText,
      evidenceRefs,
      evidenceRefCount: evidenceRefs.length,
      readiness,
      recommendedNextAction,
      promotionBlockers: packet.promotionBlockers,
    } satisfies FindingReviewQueueCandidate;
  });
  const surfaced = allCandidates.slice(0, input.queueLimit);
  const omitted = allCandidates.slice(input.queueLimit);
  const routeBuckets = new Map<string, FindingReviewQueueCandidate[]>();
  for (const candidate of surfaced) {
    const key = routeGroupKey(candidate);
    if (key === null) continue;
    const current = routeBuckets.get(key) ?? [];
    current.push(candidate);
    routeBuckets.set(key, current);
  }
  const routeGroups = [...routeBuckets.entries()]
    .map(([routeId, candidates]) => {
      const top = [...candidates].sort(
        (left, right) =>
          right.reviewPriority - left.reviewPriority ||
          left.candidateId.localeCompare(right.candidateId),
      )[0];
      return {
        routeId,
        candidateCount: candidates.length,
        detectorIds: [...new Set(candidates.map((candidate) => candidate.detectorId))].sort(),
        topReviewPriority: top?.reviewPriority ?? 0,
        topReviewPriorityBand: top?.reviewPriorityBand ?? "low",
        candidateIds: candidates.map((candidate) => candidate.candidateId),
      };
    })
    .sort(
      (left, right) =>
        right.topReviewPriority - left.topReviewPriority || left.routeId.localeCompare(right.routeId),
    );
  const surfacedRouteIds = surfaced
    .map((candidate) => candidate.routeId)
    .filter((routeId) => routeId !== null);
  const detectorSetsByRoute = new Map<string, Set<string>>();
  for (const candidate of surfaced) {
    if (candidate.routeId === null) continue;
    const current = detectorSetsByRoute.get(candidate.routeId) ?? new Set<string>();
    current.add(candidate.detectorId);
    detectorSetsByRoute.set(candidate.routeId, current);
  }
  const totalBandCounts = countKnownValues(
    allCandidates.map((candidate) => candidate.reviewPriorityBand),
    ["critical", "high", "medium", "low"] as const,
  );
  const surfacedBandCounts = countKnownValues(
    surfaced.map((candidate) => candidate.reviewPriorityBand),
    ["critical", "high", "medium", "low"] as const,
  );
  const omittedBandCounts = countKnownValues(
    omitted.map((candidate) => candidate.reviewPriorityBand),
    ["critical", "high", "medium", "low"] as const,
  );
  const omittedPriorityBands = Object.entries(omittedBandCounts)
    .filter(([, count]) => count > 0)
    .map(([band]) => band);
  const omittedCandidateCount = Math.max(0, allCandidates.length - surfaced.length);
  return {
    artifactKind: "finding_review_queue",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    month: input.month,
    totalCandidateCount: allCandidates.length,
    candidateCount: surfaced.length,
    evidenceLinkedCandidateCount: allCandidates.filter((candidate) => candidate.evidenceRefCount > 0)
      .length,
    unlinkedCandidateCount: allCandidates.filter((candidate) => candidate.evidenceRefCount === 0)
      .length,
    omittedCandidateCount,
    queueLimit: input.queueLimit,
    detectorCounts: countBy(surfaced.map((candidate) => candidate.detectorId)),
    totalDetectorCounts: countBy(allCandidates.map((candidate) => candidate.detectorId)),
    summary: {
      totalPriorityBandCounts: totalBandCounts,
      surfacedPriorityBandCounts: surfacedBandCounts,
      omittedPriorityBandCounts: omittedBandCounts,
      surfacedCategoryCounts: countBy(surfaced.map((candidate) => candidate.category)),
      routePriorityBandCounts: countKnownValues(
        surfaced
          .filter((candidate) => candidate.routeId !== null)
          .map((candidate) => candidate.reviewPriorityBand),
        ["critical", "high", "medium", "low"] as const,
      ),
      multiDetectorRouteCount: [...detectorSetsByRoute.values()].filter((detectors) => detectors.size > 1)
        .length,
      criticalRouteGroupCount: routeGroups.filter(
        (group) => group.topReviewPriorityBand === "critical",
      ).length,
      capExhaustedPriorityBands: omittedPriorityBands,
    },
    health: {
      status: "ok",
      issues:
        omittedCandidateCount === 0
          ? []
          : [
              {
                severity: "info",
                code: "lower_priority_candidates_omitted",
                message: "The review cap omitted lower-priority candidates.",
                count: omittedCandidateCount,
              },
            ],
    },
    agentReview: {
      source: "review_packets",
      packetCoverageArtifactPath: input.packetCoverageArtifactPath,
      promotionQueueArtifactPath: input.promotionQueueArtifactPath,
    },
    routeGroups,
    routeGroupCount: new Set(surfacedRouteIds).size,
    candidates: surfaced,
  };
}

function packetCoverageArtifact(input: {
  month: string;
  generatedAt: string;
  reviewPacketsArtifactPath: string;
  promotionQueueArtifactPath: string;
  detectorSpecsArtifactPath: string;
  packetCoverageArtifactPath: string;
  candidates: readonly FindingCandidate[];
  evidenceLinks: readonly FindingEvidenceLink[];
  coverageRows: readonly FindingCoverageAudit[];
  packets: readonly FindingReviewPacket[];
}): FindingReviewPacketCoverageArtifact {
  const registeredIds = new Set<string>(
    listAnalyticsDetectors().map((detector) => detector.detectorId),
  );
  const detectorIds = new Set<string>([
    ...registeredIds,
    ...input.candidates.map((candidate) => candidate.detectorId),
  ]);
  const candidateCount = new Map<string, number>();
  const packetCount = new Map<string, number>();
  const evidenceCount = new Map<string, number>();
  const coverageHitCount = new Map<string, number>();
  for (const candidate of input.candidates) {
    candidateCount.set(candidate.detectorId, (candidateCount.get(candidate.detectorId) ?? 0) + 1);
  }
  for (const packet of input.packets) {
    packetCount.set(packet.candidate.detectorId, (packetCount.get(packet.candidate.detectorId) ?? 0) + 1);
  }
  const candidateDetectorById = new Map(
    input.candidates.map((candidate) => [candidate.candidateId, candidate.detectorId] as const),
  );
  for (const link of input.evidenceLinks) {
    const detectorId = candidateDetectorById.get(link.candidateId);
    if (detectorId !== undefined) evidenceCount.set(detectorId, (evidenceCount.get(detectorId) ?? 0) + 1);
  }
  for (const row of input.coverageRows) {
    if (row.outcome === "hit") {
      coverageHitCount.set(row.detectorId, (coverageHitCount.get(row.detectorId) ?? 0) + 1);
    }
  }
  const packetMetricsByDetector = new Map<
    string,
    {
      withoutPrimary: number;
      withoutCounterEvidence: number;
      withoutCoverage: number;
    }
  >();
  for (const packet of input.packets) {
    const current =
      packetMetricsByDetector.get(packet.candidate.detectorId) ??
      {
        withoutPrimary: 0,
        withoutCounterEvidence: 0,
        withoutCoverage: 0,
      };
    if (!packet.packetCompleteness.hasPrimaryEvidence) current.withoutPrimary += 1;
    if (
      !packet.packetCompleteness.hasCounterEvidence &&
      !COUNTER_EVIDENCE_WAIVED_DETECTORS.has(packet.candidate.detectorId)
    ) {
      current.withoutCounterEvidence += 1;
    }
    if (!packet.packetCompleteness.hasCoverageAudit) current.withoutCoverage += 1;
    packetMetricsByDetector.set(packet.candidate.detectorId, current);
  }
  const detectors = [...detectorIds].sort().map((detectorId) => {
    const candidates = candidateCount.get(detectorId) ?? 0;
    const packets = packetCount.get(detectorId) ?? 0;
    const missingPacketCount = Math.max(0, candidates - packets);
    const metrics = packetMetricsByDetector.get(detectorId) ?? {
      withoutPrimary: 0,
      withoutCounterEvidence: 0,
      withoutCoverage: 0,
    };
    const incompletePacketCount =
      metrics.withoutPrimary + metrics.withoutCounterEvidence + metrics.withoutCoverage;
    const status: "complete" | "partial" | "missing" | "no_candidates" =
      candidates === 0
        ? "no_candidates"
        : packets === 0
          ? "missing"
          : missingPacketCount > 0 || incompletePacketCount > 0
            ? "partial"
            : "complete";
    return {
      detectorId,
      registered: registeredIds.has(detectorId),
      candidateCount: candidates,
      packetCount: packets,
      evidenceLinkCount: evidenceCount.get(detectorId) ?? 0,
      coverageHitCount: coverageHitCount.get(detectorId) ?? 0,
      missingPacketCount,
      packetsWithoutPrimaryEvidence: metrics.withoutPrimary,
      packetsWithoutCounterEvidence: metrics.withoutCounterEvidence,
      packetsWithoutCoverage: metrics.withoutCoverage,
      status,
    };
  });
  const candidateDetectorCount = detectors.filter((detector) => detector.candidateCount > 0).length;
  const packetedDetectorCount = detectors.filter((detector) => detector.packetCount > 0).length;
  return {
    artifactKind: "finding_review_packet_coverage",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    month: input.month,
    reviewPacketsArtifactPath: input.reviewPacketsArtifactPath,
    promotionQueueArtifactPath: input.promotionQueueArtifactPath,
    detectorSpecsArtifactPath: input.detectorSpecsArtifactPath,
    summary: {
      registeredDetectorCount: registeredIds.size,
      detectorWithCandidateCount: candidateDetectorCount,
      detectorWithPacketCount: packetedDetectorCount,
      candidateCount: input.candidates.length,
      packetCount: input.packets.length,
      missingPacketCandidateCount: detectors.reduce(
        (sum, detector) => sum + detector.missingPacketCount,
        0,
      ),
      packetCompleteDetectorCount: detectors.filter((detector) => detector.status === "complete")
        .length,
      packetPartialDetectorCount: detectors.filter((detector) => detector.status === "partial")
        .length,
      packetMissingDetectorCount: detectors.filter((detector) => detector.status === "missing")
        .length,
      noCandidateDetectorCount: detectors.filter((detector) => detector.status === "no_candidates")
        .length,
    },
    detectors,
  };
}

export function buildReviewPacketArtifacts(input: {
  month: string;
  generatedAt: string;
  detectorSpecsArtifactPath: string;
  reviewPacketsArtifactPath: string;
  promotionQueueArtifactPath: string;
  coverageArtifactPath: string;
  reviewQueueArtifactPath?: string;
  queueLimit?: number;
  candidates: readonly FindingCandidate[];
  evidenceLinks: readonly FindingEvidenceLink[];
  coverageRows: readonly FindingCoverageAudit[];
  existingPacketIdsByCandidateId?: ReadonlyMap<string, string>;
}): ReviewPacketBuildArtifacts {
  const detectorSpecs = buildFindingDetectorSpecsArtifact({ generatedAt: input.generatedAt });
  const evidenceByCandidateId = new Map<string, FindingEvidenceLink[]>();
  for (const link of input.evidenceLinks) {
    const existing = evidenceByCandidateId.get(link.candidateId) ?? [];
    existing.push(link);
    evidenceByCandidateId.set(link.candidateId, existing);
  }
  const coverageByKey = new Map<string, FindingCoverageAudit[]>();
  for (const row of input.coverageRows) {
    const key = coverageKey({
      detectorRunId: row.detectorRunId,
      detectorId: row.detectorId,
      scopeKind: row.scopeKind,
      scopeId: row.scopeId,
    });
    const existing = coverageByKey.get(key) ?? [];
    existing.push(row);
    coverageByKey.set(key, existing);
  }
  const sortedCandidates = [...input.candidates].sort((left, right) => {
    const leftPriority = candidatePriority(left).score;
    const rightPriority = candidatePriority(right).score;
    return (
      rightPriority - leftPriority ||
      left.detectorId.localeCompare(right.detectorId) ||
      left.candidateId.localeCompare(right.candidateId)
    );
  });
  const packets = sortedCandidates.map((candidate, index) => {
    const key = coverageKey({
      detectorRunId: candidate.detectorRunId,
      detectorId: candidate.detectorId,
      scopeKind: candidate.scopeKind,
      scopeId: candidate.scopeId,
    });
    return buildPacket({
      candidate,
      reviewRank: index + 1,
      evidenceLinks: evidenceByCandidateId.get(candidate.candidateId) ?? [],
      coverage: coverageByKey.get(key) ?? [],
      existingPacketId: input.existingPacketIdsByCandidateId?.get(candidate.candidateId) ?? null,
    });
  });
  const reviewPackets = FindingReviewPacketsArtifactSchema.parse({
    artifactKind: "finding_review_packets",
    schemaVersion: 1,
    month: input.month,
    generatedAt: input.generatedAt,
    detectorSpecsArtifactPath: input.detectorSpecsArtifactPath,
    packetCount: packets.length,
    summary: {
      packetCount: packets.length,
      candidatesWithoutCounterEvidence: packets.filter(
        (packet) => !packet.packetCompleteness.hasCounterEvidence,
      ).length,
      candidatesWithoutCoverage: packets.filter(
        (packet) => !packet.packetCompleteness.hasCoverageAudit,
      ).length,
      detectorCounts: countBy(packets.map((packet) => packet.candidate.detectorId)),
    },
    packets,
  });
  const promotionQueue = promotionQueueFromPackets({
    month: input.month,
    generatedAt: input.generatedAt,
    reviewPacketsArtifactPath: input.reviewPacketsArtifactPath,
    packets,
  });
  const reviewQueue = reviewQueueFromPackets({
    month: input.month,
    generatedAt: input.generatedAt,
    reviewPacketsArtifactPath: input.reviewPacketsArtifactPath,
    promotionQueueArtifactPath: input.promotionQueueArtifactPath,
    packetCoverageArtifactPath: input.coverageArtifactPath,
    packets,
    queueLimit: input.queueLimit ?? 200,
  });
  const coverage = packetCoverageArtifact({
    month: input.month,
    generatedAt: input.generatedAt,
    reviewPacketsArtifactPath: input.reviewPacketsArtifactPath,
    promotionQueueArtifactPath: input.promotionQueueArtifactPath,
    detectorSpecsArtifactPath: input.detectorSpecsArtifactPath,
    packetCoverageArtifactPath: input.coverageArtifactPath,
    candidates: input.candidates,
    evidenceLinks: input.evidenceLinks,
    coverageRows: input.coverageRows,
    packets,
  });
  return { detectorSpecs, reviewPackets, promotionQueue, reviewQueue, coverage };
}
