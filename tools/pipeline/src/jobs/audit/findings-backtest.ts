import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  FindingReviewDecisionsArtifactSchema,
  type FindingReviewPacket,
  FindingReviewPacketsArtifactSchema,
  PromotedFindingsArtifactSchema,
} from "@bp/domain";
import * as z from "zod";
import { writeJson } from "../../lib/json.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";

type Args = {
  year?: number;
  month?: number;
  dbPath?: string;
  artifactRoot?: string;
  goldSetPath?: string;
  reviewDecisionsPath?: string;
  promotedFindingsPath?: string;
};

export type FindingsBacktestResult = {
  isoMonth: string;
  status: "pass" | "fail";
  expectationCount: number;
  matchedExpectationCount: number;
  missingExpectationCount: number;
  unexpectedMatchCount: number;
  confidenceMissCount: number;
  controlMissCount: number;
  artifactPath: string;
};

const ConfidenceSchema = z.enum(["insufficient", "low", "medium", "high"]);
const MinimumControlReadinessSchema = z.enum(["weak", "partial", "strong"]);

type Confidence = z.output<typeof ConfidenceSchema>;
type MinimumControlReadiness = z.output<typeof MinimumControlReadinessSchema>;

type NormalizedControlReadiness = "strong" | "partial" | "weak" | "missing" | "not_applicable";

type NormalizedControlProfile = {
  readiness: NormalizedControlReadiness;
  plannedServiceControlStatus: string;
  plannedServiceBestMatchMethod: string;
  passengerLoadControlStatus: string;
  incidentControlStatus: string;
  controlledWindowSampleSupport: string;
};

const GoldExpectationSchema = z
  .object({
    expectationId: z.string().min(1),
    expectedOutcome: z.enum(["should_surface", "should_not_surface"]).default("should_surface"),
    routeId: z.string().min(1).optional(),
    scopeId: z.string().min(1).optional(),
    detectorId: z.string().min(1).optional(),
    reasonCode: z.string().min(1).optional(),
    expectCounterEvidence: z.boolean().default(false),
    minimumConfidence: ConfidenceSchema.optional(),
    minimumNormalizedControlReadiness: MinimumControlReadinessSchema.optional(),
    calibrationWeight: z.number().positive().default(1),
  })
  .strict();

const GoldSetSchema = z.union([
  z.array(GoldExpectationSchema),
  z
    .object({
      expectations: z.array(GoldExpectationSchema),
    })
    .strict(),
]);

type GoldExpectation = z.output<typeof GoldExpectationSchema>;

const DEFAULT_TINY_GOLD_SET: readonly GoldExpectation[] = [
  {
    expectationId: "at_least_one_persistent_speed_hotspot",
    expectedOutcome: "should_surface",
    detectorId: "persistent_speed_hotspot",
    reasonCode: "persistent_low_speed",
    expectCounterEvidence: true,
    calibrationWeight: 1,
  },
  {
    expectationId: "at_least_one_source_gap_packet",
    expectedOutcome: "should_surface",
    detectorId: "source_gap",
    expectCounterEvidence: false,
    calibrationWeight: 1,
  },
];

function parseCliArgs(args: string[]): Args {
  return parseMonthDbCliArgs(args, {} as Args, [
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--gold-set"],
      apply: (output, value) => {
        if (value !== undefined) output.goldSetPath = fromCliPath(value);
      },
    },
    {
      flags: ["--review-decisions"],
      apply: (output, value) => {
        if (value !== undefined) output.reviewDecisionsPath = fromCliPath(value);
      },
    },
    {
      flags: ["--promoted-findings"],
      apply: (output, value) => {
        if (value !== undefined) output.promotedFindingsPath = fromCliPath(value);
      },
    },
  ]);
}

export function findingsReviewPacketsPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "findings", month, "review-packets.json");
}

export function findingsBacktestArtifactPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "findings", month, "backtest.json");
}

export function findingsReviewDecisionsPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "findings", month, "review-decisions.json");
}

export function findingsPromotedFindingsPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "findings", month, "promoted-findings.json");
}

async function loadGoldSet(goldSetPath: string | undefined): Promise<readonly GoldExpectation[]> {
  if (goldSetPath === undefined) return DEFAULT_TINY_GOLD_SET;
  const parsed = GoldSetSchema.parse(await Bun.file(goldSetPath).json());
  return Array.isArray(parsed) ? parsed : parsed.expectations;
}

function packetMatchesExpectation(
  packet: FindingReviewPacket,
  expectation: GoldExpectation,
): boolean {
  if (expectation.routeId !== undefined && packet.candidate.routeId !== expectation.routeId) {
    return false;
  }
  if (expectation.scopeId !== undefined && packet.candidate.scopeId !== expectation.scopeId) {
    return false;
  }
  if (
    expectation.detectorId !== undefined &&
    packet.candidate.detectorId !== expectation.detectorId
  ) {
    return false;
  }
  if (
    expectation.reasonCode !== undefined &&
    packet.candidate.reasonCode !== expectation.reasonCode
  ) {
    return false;
  }
  if (expectation.expectCounterEvidence && !packet.packetCompleteness.hasCounterEvidence) {
    return false;
  }
  return true;
}

const CONFIDENCE_ORDER: Record<Confidence, number> = {
  insufficient: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const CONTROL_READINESS_ORDER: Record<NormalizedControlReadiness, number> = {
  not_applicable: 0,
  missing: 0,
  weak: 1,
  partial: 2,
  strong: 3,
};

function packetMeetsMinimumConfidence(
  packet: FindingReviewPacket,
  minimumConfidence: Confidence | undefined,
): boolean {
  if (minimumConfidence === undefined) return true;
  return (
    CONFIDENCE_ORDER[packet.candidate.confidence as Confidence] >=
    CONFIDENCE_ORDER[minimumConfidence]
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function packetEvidenceObjects(packet: FindingReviewPacket): unknown[] {
  return [
    ...packet.evidenceObjects.primary,
    ...packet.evidenceObjects.context,
    ...packet.evidenceObjects.counterEvidence,
    ...packet.evidenceObjects.caveats,
    ...packet.evidenceObjects.missingData,
    ...packet.evidenceObjects.coverageAudit,
  ];
}

function normalizedControlProfileForPacket(packet: FindingReviewPacket): NormalizedControlProfile {
  const weatherReliability = packetEvidenceObjects(packet)
    .map((value) => asRecord(value))
    .find((value): value is Record<string, unknown> => {
      return (
        value !== null && stringField(value, "artifactKind") === "route_weather_reliability_context"
      );
    });
  if (weatherReliability === undefined) {
    return {
      readiness:
        packet.candidate.detectorId === "observed_reliability" ? "missing" : "not_applicable",
      plannedServiceControlStatus: "not_applicable",
      plannedServiceBestMatchMethod: "not_applicable",
      passengerLoadControlStatus: "not_applicable",
      incidentControlStatus: "not_applicable",
      controlledWindowSampleSupport: "not_applicable",
    };
  }

  const controlledWindowSampleSupport =
    stringField(weatherReliability, "controlledWindowSampleSupport") ?? "unknown";
  const plannedServiceControlStatus =
    stringField(weatherReliability, "plannedServiceControlStatus") ?? "unknown";
  const plannedServiceBestMatchMethod =
    stringField(weatherReliability, "plannedServiceBestMatchMethod") ?? "unknown";
  const passengerLoadControlStatus =
    stringField(weatherReliability, "passengerLoadControlStatus") ?? "unknown";
  const incidentControlStatus =
    stringField(weatherReliability, "incidentControlStatus") ?? "unknown";
  const allControlsAvailable =
    plannedServiceControlStatus === "available" &&
    passengerLoadControlStatus === "available" &&
    incidentControlStatus === "available";
  const hasStrongScheduleMatch =
    plannedServiceBestMatchMethod === "exact_stop_hour" ||
    plannedServiceBestMatchMethod === "mixed";
  const hasControlledSplit = controlledWindowSampleSupport === "sufficient_split";
  const readiness: NormalizedControlReadiness =
    hasControlledSplit && allControlsAvailable && hasStrongScheduleMatch
      ? "strong"
      : hasControlledSplit && allControlsAvailable
        ? "partial"
        : hasControlledSplit
          ? "weak"
          : "missing";

  return {
    readiness,
    plannedServiceControlStatus,
    plannedServiceBestMatchMethod,
    passengerLoadControlStatus,
    incidentControlStatus,
    controlledWindowSampleSupport,
  };
}

function packetMeetsMinimumNormalizedControlReadiness(
  packet: FindingReviewPacket,
  minimumReadiness: MinimumControlReadiness | undefined,
): boolean {
  if (minimumReadiness === undefined) return true;
  return (
    CONTROL_READINESS_ORDER[normalizedControlProfileForPacket(packet).readiness] >=
    CONTROL_READINESS_ORDER[minimumReadiness]
  );
}

function downgradeConfidence(confidence: Confidence): Confidence {
  if (confidence === "high") return "medium";
  if (confidence === "medium") return "low";
  if (confidence === "low") return "insufficient";
  return "insufficient";
}

function adjustedConfidenceForPacket(packet: FindingReviewPacket): Confidence {
  const confidence = packet.candidate.confidence as Confidence;
  if (packet.candidate.detectorId !== "observed_reliability") {
    return confidence;
  }

  const profile = normalizedControlProfileForPacket(packet);
  if (profile.readiness === "strong") {
    return confidence;
  }
  if (profile.readiness === "partial") {
    return confidence === "high" ? "medium" : confidence;
  }
  return downgradeConfidence(confidence);
}

async function loadReviewDecisions(path: string) {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return FindingReviewDecisionsArtifactSchema.parse(await file.json());
}

async function loadPromotedFindings(path: string) {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return PromotedFindingsArtifactSchema.parse(await file.json());
}

function approvalDecision(decision: string): boolean {
  return decision === "approve" || decision === "approve_with_revisions";
}

function candidateSignature(input: {
  detectorId: string;
  month: string;
  scopeKind: string;
  scopeId: string;
  routeId: string | null;
  physicalId: string | null;
  reasonCode: string;
  windowStart: string | null;
  windowEnd: string | null;
}): string {
  return [
    input.detectorId,
    input.month,
    input.scopeKind,
    input.scopeId,
    input.routeId ?? "",
    input.physicalId ?? "",
    input.reasonCode,
    input.windowStart ?? "",
    input.windowEnd ?? "",
  ].join("\u001f");
}

function buildConfidenceCalibration(args: {
  packets: readonly FindingReviewPacket[];
  goldMatchedCandidateIds: ReadonlySet<string>;
  reviewDecisions: z.output<typeof FindingReviewDecisionsArtifactSchema> | null;
  promotedFindings: z.output<typeof PromotedFindingsArtifactSchema> | null;
}) {
  const decisionsByCandidate = new Map(
    args.reviewDecisions?.decisions.map((decision) => [decision.candidateId, decision]) ?? [],
  );
  const promotedBySignature = new Map(
    args.promotedFindings?.findings.map(
      (finding) => [candidateSignature(finding.sourceCandidate), finding] as const,
    ) ?? [],
  );
  const rows = new Map<
    string,
    {
      detectorId: string;
      confidence: Confidence;
      candidateCount: number;
      goldMatchedCandidateCount: number;
      reviewedCandidateCount: number;
      approvedDecisionCount: number;
      nonPromotedDecisionCount: number;
      approvalRate: number | null;
    }
  >();
  const controlRows = new Map<
    string,
    {
      detectorId: string;
      confidence: Confidence;
      adjustedConfidence: Confidence;
      normalizedControlReadiness: NormalizedControlReadiness;
      plannedServiceControlStatus: string;
      plannedServiceBestMatchMethod: string;
      passengerLoadControlStatus: string;
      incidentControlStatus: string;
      controlledWindowSampleSupport: string;
      candidateCount: number;
      goldMatchedCandidateCount: number;
      reviewedCandidateCount: number;
      approvedDecisionCount: number;
      nonPromotedDecisionCount: number;
      approvalRate: number | null;
    }
  >();
  const warnings: string[] = [];
  let controlAdjustedCandidateCount = 0;
  const matchedReviewDecisionCandidateIds = new Set<string>();
  const matchedPromotedFindingIds = new Set<string>();

  for (const packet of args.packets) {
    const confidence = packet.candidate.confidence as Confidence;
    const controlProfile = normalizedControlProfileForPacket(packet);
    const adjustedConfidence = adjustedConfidenceForPacket(packet);
    if (adjustedConfidence !== confidence) {
      controlAdjustedCandidateCount += 1;
    }
    const key = `${packet.candidate.detectorId}:${confidence}`;
    const row =
      rows.get(key) ??
      ({
        detectorId: packet.candidate.detectorId,
        confidence,
        candidateCount: 0,
        goldMatchedCandidateCount: 0,
        reviewedCandidateCount: 0,
        approvedDecisionCount: 0,
        nonPromotedDecisionCount: 0,
        approvalRate: null,
      } satisfies {
        detectorId: string;
        confidence: Confidence;
        candidateCount: number;
        goldMatchedCandidateCount: number;
        reviewedCandidateCount: number;
        approvedDecisionCount: number;
        nonPromotedDecisionCount: number;
        approvalRate: number | null;
      });
    row.candidateCount += 1;
    if (args.goldMatchedCandidateIds.has(packet.candidate.candidateId)) {
      row.goldMatchedCandidateCount += 1;
    }
    const decision = decisionsByCandidate.get(packet.candidate.candidateId);
    const signaturePromotedFinding =
      decision === undefined
        ? promotedBySignature.get(candidateSignature(packet.candidate))
        : undefined;
    const reviewed = decision !== undefined || signaturePromotedFinding !== undefined;
    const approved =
      decision !== undefined
        ? approvalDecision(decision.decision)
        : signaturePromotedFinding !== undefined;
    if (reviewed) {
      row.reviewedCandidateCount += 1;
      if (decision !== undefined) {
        matchedReviewDecisionCandidateIds.add(decision.candidateId);
      }
      if (signaturePromotedFinding !== undefined) {
        matchedPromotedFindingIds.add(signaturePromotedFinding.promotedFindingId);
      }
      if (approved) {
        row.approvedDecisionCount += 1;
        if (confidence === "low" || confidence === "insufficient") {
          warnings.push(
            `${packet.candidate.candidateId} was approved despite ${confidence} detector confidence`,
          );
        }
        if (
          packet.candidate.detectorId === "observed_reliability" &&
          controlProfile.readiness !== "strong"
        ) {
          warnings.push(
            `${packet.candidate.candidateId} was approved with ${controlProfile.readiness} normalized observed-reliability controls`,
          );
        }
      } else {
        row.nonPromotedDecisionCount += 1;
        if (confidence === "high") {
          warnings.push(
            `${packet.candidate.candidateId} was not promoted despite high detector confidence`,
          );
        }
      }
    }
    rows.set(key, row);

    const controlKey = [
      packet.candidate.detectorId,
      confidence,
      adjustedConfidence,
      controlProfile.readiness,
      controlProfile.plannedServiceControlStatus,
      controlProfile.plannedServiceBestMatchMethod,
      controlProfile.passengerLoadControlStatus,
      controlProfile.incidentControlStatus,
      controlProfile.controlledWindowSampleSupport,
    ].join(":");
    const controlRow =
      controlRows.get(controlKey) ??
      ({
        detectorId: packet.candidate.detectorId,
        confidence,
        adjustedConfidence,
        normalizedControlReadiness: controlProfile.readiness,
        plannedServiceControlStatus: controlProfile.plannedServiceControlStatus,
        plannedServiceBestMatchMethod: controlProfile.plannedServiceBestMatchMethod,
        passengerLoadControlStatus: controlProfile.passengerLoadControlStatus,
        incidentControlStatus: controlProfile.incidentControlStatus,
        controlledWindowSampleSupport: controlProfile.controlledWindowSampleSupport,
        candidateCount: 0,
        goldMatchedCandidateCount: 0,
        reviewedCandidateCount: 0,
        approvedDecisionCount: 0,
        nonPromotedDecisionCount: 0,
        approvalRate: null,
      } satisfies {
        detectorId: string;
        confidence: Confidence;
        adjustedConfidence: Confidence;
        normalizedControlReadiness: NormalizedControlReadiness;
        plannedServiceControlStatus: string;
        plannedServiceBestMatchMethod: string;
        passengerLoadControlStatus: string;
        incidentControlStatus: string;
        controlledWindowSampleSupport: string;
        candidateCount: number;
        goldMatchedCandidateCount: number;
        reviewedCandidateCount: number;
        approvedDecisionCount: number;
        nonPromotedDecisionCount: number;
        approvalRate: number | null;
      });
    controlRow.candidateCount += 1;
    if (args.goldMatchedCandidateIds.has(packet.candidate.candidateId)) {
      controlRow.goldMatchedCandidateCount += 1;
    }
    if (reviewed) {
      controlRow.reviewedCandidateCount += 1;
      if (approved) {
        controlRow.approvedDecisionCount += 1;
      } else {
        controlRow.nonPromotedDecisionCount += 1;
      }
    }
    controlRows.set(controlKey, controlRow);
  }

  const byDetectorConfidence = [...rows.values()]
    .map((row) => ({
      ...row,
      approvalRate:
        row.reviewedCandidateCount === 0
          ? null
          : row.approvedDecisionCount / row.reviewedCandidateCount,
    }))
    .sort((left, right) => {
      const detectorDelta = left.detectorId.localeCompare(right.detectorId);
      if (detectorDelta !== 0) return detectorDelta;
      return CONFIDENCE_ORDER[right.confidence] - CONFIDENCE_ORDER[left.confidence];
    });
  const byDetectorConfidenceAndControls = [...controlRows.values()]
    .map((row) => ({
      ...row,
      approvalRate:
        row.reviewedCandidateCount === 0
          ? null
          : row.approvedDecisionCount / row.reviewedCandidateCount,
    }))
    .sort((left, right) => {
      const detectorDelta = left.detectorId.localeCompare(right.detectorId);
      if (detectorDelta !== 0) return detectorDelta;
      const adjustedDelta =
        CONFIDENCE_ORDER[right.adjustedConfidence] - CONFIDENCE_ORDER[left.adjustedConfidence];
      if (adjustedDelta !== 0) return adjustedDelta;
      const rawDelta = CONFIDENCE_ORDER[right.confidence] - CONFIDENCE_ORDER[left.confidence];
      if (rawDelta !== 0) return rawDelta;
      return (
        CONTROL_READINESS_ORDER[right.normalizedControlReadiness] -
        CONTROL_READINESS_ORDER[left.normalizedControlReadiness]
      );
    });

  return {
    reviewDecisionCount: args.reviewDecisions?.decisionCount ?? 0,
    promotedFindingCount: args.promotedFindings?.promotedFindingCount ?? 0,
    reviewedCandidateCount: matchedReviewDecisionCandidateIds.size + matchedPromotedFindingIds.size,
    approvedDecisionCount: byDetectorConfidence.reduce(
      (sum, row) => sum + row.approvedDecisionCount,
      0,
    ),
    decisionMatchSummary: {
      directReviewDecisionMatchCount: matchedReviewDecisionCandidateIds.size,
      signaturePromotedFindingMatchCount: matchedPromotedFindingIds.size,
      unmatchedReviewDecisionCount: Math.max(
        0,
        decisionsByCandidate.size - matchedReviewDecisionCandidateIds.size,
      ),
      unmatchedPromotedFindingCount: Math.max(
        0,
        (args.promotedFindings?.promotedFindingCount ?? 0) - matchedPromotedFindingIds.size,
      ),
    },
    byDetectorConfidence,
    byDetectorConfidenceAndControls,
    controlAdjustmentSummary: {
      adjustedCandidateCount: controlAdjustedCandidateCount,
      observedReliabilityCandidateCount: args.packets.filter(
        (packet) => packet.candidate.detectorId === "observed_reliability",
      ).length,
      strongControlCandidateCount: args.packets.filter(
        (packet) => normalizedControlProfileForPacket(packet).readiness === "strong",
      ).length,
      partialControlCandidateCount: args.packets.filter(
        (packet) => normalizedControlProfileForPacket(packet).readiness === "partial",
      ).length,
      weakOrMissingControlCandidateCount: args.packets.filter((packet) =>
        ["weak", "missing"].includes(normalizedControlProfileForPacket(packet).readiness),
      ).length,
    },
    warnings,
  };
}

export async function auditFindingsBacktest(args: Args = {}): Promise<FindingsBacktestResult> {
  const options = createMonthContext(args);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const reviewPacketsPath = findingsReviewPacketsPath(artifactRoot, options.isoMonth);
  const artifactPath = findingsBacktestArtifactPath(artifactRoot, options.isoMonth);
  const reviewDecisionsPath =
    args.reviewDecisionsPath ?? findingsReviewDecisionsPath(artifactRoot, options.isoMonth);
  const promotedFindingsPath =
    args.promotedFindingsPath ?? findingsPromotedFindingsPath(artifactRoot, options.isoMonth);
  const [reviewPackets, goldSet, reviewDecisions, promotedFindings] = await Promise.all([
    Bun.file(reviewPacketsPath)
      .json()
      .then((json) => FindingReviewPacketsArtifactSchema.parse(json)),
    loadGoldSet(args.goldSetPath),
    loadReviewDecisions(reviewDecisionsPath),
    loadPromotedFindings(promotedFindingsPath),
  ]);

  const results = goldSet.map((expectation) => {
    const matches = reviewPackets.packets.filter((packet) =>
      packetMatchesExpectation(packet, expectation),
    );
    const confidenceQualifiedMatches = matches.filter((packet) =>
      packetMeetsMinimumConfidence(packet, expectation.minimumConfidence),
    );
    const controlQualifiedMatches = confidenceQualifiedMatches.filter((packet) =>
      packetMeetsMinimumNormalizedControlReadiness(
        packet,
        expectation.minimumNormalizedControlReadiness,
      ),
    );
    const status =
      expectation.expectedOutcome === "should_not_surface"
        ? matches.length === 0
          ? "clean"
          : "unexpected_match"
        : matches.length === 0
          ? "missing"
          : confidenceQualifiedMatches.length === 0
            ? "confidence_miss"
            : controlQualifiedMatches.length === 0
              ? "control_miss"
              : "matched";
    return {
      ...expectation,
      status,
      matchedCandidateIds: matches.map((packet) => packet.candidate.candidateId),
      matchedPacketIds: matches.map((packet) => packet.packetId),
      matchedConfidences: matches.map((packet) => packet.candidate.confidence),
      matchedAdjustedConfidences: matches.map((packet) => adjustedConfidenceForPacket(packet)),
      matchedNormalizedControlReadiness: matches.map(
        (packet) => normalizedControlProfileForPacket(packet).readiness,
      ),
    };
  });
  const missingExpectationCount = results.filter((result) => result.status === "missing").length;
  const unexpectedMatchCount = results.filter(
    (result) => result.status === "unexpected_match",
  ).length;
  const confidenceMissCount = results.filter(
    (result) => result.status === "confidence_miss",
  ).length;
  const controlMissCount = results.filter((result) => result.status === "control_miss").length;
  const matchedExpectationCount =
    results.length -
    missingExpectationCount -
    unexpectedMatchCount -
    confidenceMissCount -
    controlMissCount;
  const status =
    missingExpectationCount === 0 &&
    unexpectedMatchCount === 0 &&
    confidenceMissCount === 0 &&
    controlMissCount === 0
      ? "pass"
      : "fail";
  const goldMatchedCandidateIds = new Set(
    results
      .filter((result) => result.status === "matched" || result.status === "confidence_miss")
      .flatMap((result) => result.matchedCandidateIds),
  );
  const confidenceCalibration = buildConfidenceCalibration({
    packets: reviewPackets.packets,
    goldMatchedCandidateIds,
    reviewDecisions,
    promotedFindings,
  });

  await mkdir(dirname(artifactPath), { recursive: true });
  await writeJson(artifactPath, {
    artifactKind: "finding_backtest",
    schemaVersion: 1,
    month: options.isoMonth,
    generatedAt: new Date().toISOString(),
    reviewPacketsArtifactPath: reviewPacketsPath,
    goldSetPath: args.goldSetPath ?? null,
    reviewDecisionsArtifactPath: reviewDecisions === null ? null : reviewDecisionsPath,
    promotedFindingsArtifactPath: promotedFindings === null ? null : promotedFindingsPath,
    status,
    summary: {
      expectationCount: results.length,
      matchedExpectationCount,
      missingExpectationCount,
      unexpectedMatchCount,
      confidenceMissCount,
      controlMissCount,
    },
    confidenceCalibration,
    results,
  });

  return {
    isoMonth: options.isoMonth,
    status,
    expectationCount: results.length,
    matchedExpectationCount,
    missingExpectationCount,
    unexpectedMatchCount,
    confidenceMissCount,
    controlMissCount,
    artifactPath,
  };
}

export async function auditFindingsBacktestFromCli(
  args: string[],
): Promise<FindingsBacktestResult> {
  const result = await auditFindingsBacktest(parseCliArgs(args));
  console.log(
    `findings-backtest ${result.isoMonth}: status=${result.status} matched=${result.matchedExpectationCount}/${result.expectationCount} artifact=${result.artifactPath}`,
  );
  return result;
}
