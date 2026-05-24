import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  FindingReviewDecisionsArtifactSchema,
  type FindingReviewPacket,
  FindingReviewPacketsArtifactSchema,
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
};

export type FindingsBacktestResult = {
  isoMonth: string;
  status: "pass" | "fail";
  expectationCount: number;
  matchedExpectationCount: number;
  missingExpectationCount: number;
  unexpectedMatchCount: number;
  confidenceMissCount: number;
  artifactPath: string;
};

const ConfidenceSchema = z.enum(["insufficient", "low", "medium", "high"]);

type Confidence = z.output<typeof ConfidenceSchema>;

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

async function loadReviewDecisions(path: string) {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return FindingReviewDecisionsArtifactSchema.parse(await file.json());
}

function approvalDecision(decision: string): boolean {
  return decision === "approve" || decision === "approve_with_revisions";
}

function buildConfidenceCalibration(args: {
  packets: readonly FindingReviewPacket[];
  goldMatchedCandidateIds: ReadonlySet<string>;
  reviewDecisions: z.output<typeof FindingReviewDecisionsArtifactSchema> | null;
}) {
  const decisionsByCandidate = new Map(
    args.reviewDecisions?.decisions.map((decision) => [decision.candidateId, decision]) ?? [],
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
  const warnings: string[] = [];

  for (const packet of args.packets) {
    const confidence = packet.candidate.confidence as Confidence;
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
    if (decision !== undefined) {
      row.reviewedCandidateCount += 1;
      if (approvalDecision(decision.decision)) {
        row.approvedDecisionCount += 1;
        if (confidence === "low" || confidence === "insufficient") {
          warnings.push(
            `${packet.candidate.candidateId} was approved despite ${confidence} detector confidence`,
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

  return {
    reviewDecisionCount: args.reviewDecisions?.decisionCount ?? 0,
    reviewedCandidateCount: [...decisionsByCandidate.keys()].length,
    approvedDecisionCount:
      args.reviewDecisions?.decisions.filter((decision) => approvalDecision(decision.decision))
        .length ?? 0,
    byDetectorConfidence,
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
  const [reviewPackets, goldSet, reviewDecisions] = await Promise.all([
    Bun.file(reviewPacketsPath)
      .json()
      .then((json) => FindingReviewPacketsArtifactSchema.parse(json)),
    loadGoldSet(args.goldSetPath),
    loadReviewDecisions(reviewDecisionsPath),
  ]);

  const results = goldSet.map((expectation) => {
    const matches = reviewPackets.packets.filter((packet) =>
      packetMatchesExpectation(packet, expectation),
    );
    const confidenceQualifiedMatches = matches.filter((packet) =>
      packetMeetsMinimumConfidence(packet, expectation.minimumConfidence),
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
            : "matched";
    return {
      ...expectation,
      status,
      matchedCandidateIds: matches.map((packet) => packet.candidate.candidateId),
      matchedPacketIds: matches.map((packet) => packet.packetId),
      matchedConfidences: matches.map((packet) => packet.candidate.confidence),
    };
  });
  const missingExpectationCount = results.filter((result) => result.status === "missing").length;
  const unexpectedMatchCount = results.filter(
    (result) => result.status === "unexpected_match",
  ).length;
  const confidenceMissCount = results.filter(
    (result) => result.status === "confidence_miss",
  ).length;
  const matchedExpectationCount =
    results.length - missingExpectationCount - unexpectedMatchCount - confidenceMissCount;
  const status =
    missingExpectationCount === 0 && unexpectedMatchCount === 0 && confidenceMissCount === 0
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
    status,
    summary: {
      expectationCount: results.length,
      matchedExpectationCount,
      missingExpectationCount,
      unexpectedMatchCount,
      confidenceMissCount,
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
