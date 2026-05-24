import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  FindingPromotionQueueArtifactSchema,
  FindingReviewDecisionsArtifactSchema,
  FindingReviewerDecisionInputSchema,
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
  decisionsPath?: string;
};

export type BuildPromotedFindingsResult = {
  isoMonth: string;
  decisionCount: number;
  promotedFindingCount: number;
  reviewDecisionsArtifactPath: string;
  promotedFindingsArtifactPath: string;
};

const DecisionInputFileSchema = z.union([
  z.array(FindingReviewerDecisionInputSchema),
  z
    .object({
      decisions: z.array(FindingReviewerDecisionInputSchema),
    })
    .strict(),
]);

const PROMOTION_DECISION_VALUES = [
  "approve",
  "approve_with_revisions",
  "defer",
  "reject",
  "downgrade_to_context",
] as const;

function parseCliArgs(args: string[]): Args {
  return parseMonthDbCliArgs(args, {} as Args, [
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--decisions"],
      apply: (output, value) => {
        if (value !== undefined) output.decisionsPath = fromCliPath(value);
      },
    },
  ]);
}

export function findingPromotionQueuePath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "findings", month, "promotion-queue.json");
}

export function findingReviewDecisionsArtifactPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "findings", month, "review-decisions.json");
}

export function promotedFindingsArtifactPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "findings", month, "promoted-findings.json");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}_${sha256(value).slice(0, 32)}`;
}

function emptyDecisionCounts(): Record<(typeof PROMOTION_DECISION_VALUES)[number], number> {
  return Object.fromEntries(PROMOTION_DECISION_VALUES.map((decision) => [decision, 0])) as Record<
    (typeof PROMOTION_DECISION_VALUES)[number],
    number
  >;
}

function packetEvidenceRefs(packet: FindingReviewPacket): Set<string> {
  const links = [
    ...packet.evidence.primary,
    ...packet.evidence.context,
    ...packet.evidence.counterEvidence,
    ...packet.evidence.caveats,
    ...packet.evidence.missingData,
    ...packet.evidence.coverageAudit,
  ];
  return new Set(links.flatMap((link) => [link.linkId, link.evidenceRef]));
}

function isApprovalDecision(decision: string): boolean {
  return decision === "approve" || decision === "approve_with_revisions";
}

async function loadDecisionInputs(decisionsPath: string) {
  const parsed = DecisionInputFileSchema.parse(await Bun.file(decisionsPath).json());
  return Array.isArray(parsed) ? parsed : parsed.decisions;
}

export async function buildPromotedFindings(args: Args = {}): Promise<BuildPromotedFindingsResult> {
  const options = createMonthContext(args);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  if (args.decisionsPath === undefined) {
    throw new Error("Missing required argument: --decisions");
  }

  const promotionQueueArtifactPath = findingPromotionQueuePath(artifactRoot, options.isoMonth);
  const reviewDecisionsArtifactPath = findingReviewDecisionsArtifactPath(
    artifactRoot,
    options.isoMonth,
  );
  const promotedFindingsOutputPath = promotedFindingsArtifactPath(artifactRoot, options.isoMonth);
  const [promotionQueue, decisionInputs] = await Promise.all([
    Bun.file(promotionQueueArtifactPath)
      .json()
      .then((json) => FindingPromotionQueueArtifactSchema.parse(json)),
    loadDecisionInputs(args.decisionsPath),
  ]);
  const reviewPackets = await Bun.file(promotionQueue.reviewPacketsArtifactPath)
    .json()
    .then((json) => FindingReviewPacketsArtifactSchema.parse(json));
  const queueItemsByCandidate = new Map(
    promotionQueue.candidates.map((candidate) => [candidate.candidate.candidateId, candidate]),
  );
  const packetsByCandidate = new Map(
    reviewPackets.packets.map((packet) => [packet.candidate.candidateId, packet]),
  );
  const seenCandidateIds = new Set<string>();

  const decisions = decisionInputs.map((decision) => {
    if (seenCandidateIds.has(decision.candidateId)) {
      throw new Error(`Duplicate reviewer decision for candidate ${decision.candidateId}`);
    }
    seenCandidateIds.add(decision.candidateId);
    const queueItem = queueItemsByCandidate.get(decision.candidateId);
    const packet = packetsByCandidate.get(decision.candidateId);
    if (queueItem === undefined || packet === undefined) {
      throw new Error(`Reviewer decision references unknown candidate ${decision.candidateId}`);
    }

    const promoted = isApprovalDecision(decision.decision);
    if (promoted) {
      if (queueItem.promotionBlockers.length > 0 || queueItem.maxPromotableClaimStrength <= 0) {
        throw new Error(`Candidate ${decision.candidateId} is blocked from promotion`);
      }
      if (decision.evidenceRefsApproved.length === 0) {
        throw new Error(`Approved candidate ${decision.candidateId} needs evidenceRefsApproved`);
      }
      if (decision.decision === "approve_with_revisions" && decision.revisedClaimText === null) {
        throw new Error(
          `Candidate ${decision.candidateId} uses approve_with_revisions without revisedClaimText`,
        );
      }
      const validEvidenceRefs = packetEvidenceRefs(packet);
      const unknownRefs = decision.evidenceRefsApproved.filter(
        (ref) => !validEvidenceRefs.has(ref),
      );
      if (unknownRefs.length > 0) {
        throw new Error(
          `Approved candidate ${decision.candidateId} references unknown evidence refs: ${unknownRefs.join(
            ", ",
          )}`,
        );
      }
    }

    const decisionHash = sha256({
      month: options.isoMonth,
      candidateId: decision.candidateId,
      decision: decision.decision,
      revisedClaimText: decision.revisedClaimText,
      rationale: decision.rationale,
      evidenceRefsApproved: [...decision.evidenceRefsApproved].sort(),
      reviewer: decision.reviewer,
      reviewedAt: decision.reviewedAt,
    });
    return {
      decisionId: stableId("review_decision", {
        candidateId: decision.candidateId,
        decisionHash,
      }),
      decisionHash,
      packetId: packet.packetId,
      candidateId: decision.candidateId,
      detectorId: packet.candidate.detectorId,
      routeId: packet.candidate.routeId,
      decision: decision.decision,
      revisedClaimText: decision.revisedClaimText,
      rationale: decision.rationale,
      evidenceRefsApproved: decision.evidenceRefsApproved,
      reviewer: decision.reviewer,
      reviewedAt: decision.reviewedAt,
      promoted,
    };
  });

  const decisionCounts = emptyDecisionCounts();
  for (const decision of decisions) {
    decisionCounts[decision.decision as (typeof PROMOTION_DECISION_VALUES)[number]] += 1;
  }
  const reviewDecisionsArtifact = FindingReviewDecisionsArtifactSchema.parse({
    artifactKind: "finding_review_decisions",
    schemaVersion: 1,
    month: options.isoMonth,
    generatedAt: new Date().toISOString(),
    promotionQueueArtifactPath,
    reviewPacketsArtifactPath: promotionQueue.reviewPacketsArtifactPath,
    decisionCount: decisions.length,
    summary: {
      decisionCount: decisions.length,
      decisionCounts,
      promotedDecisionCount: decisions.filter((decision) => decision.promoted).length,
      nonPromotedDecisionCount: decisions.filter((decision) => !decision.promoted).length,
    },
    decisions,
  });

  const promotedFindings = decisions
    .filter((decision) => decision.promoted)
    .map((decision) => {
      const queueItem = queueItemsByCandidate.get(decision.candidateId);
      const packet = packetsByCandidate.get(decision.candidateId);
      if (queueItem === undefined || packet === undefined) {
        throw new Error(`Promoted decision references unknown candidate ${decision.candidateId}`);
      }
      const claimText = decision.revisedClaimText ?? packet.candidate.claimText;
      const candidateSnapshotHash = sha256(packet.candidate);
      const promotedFindingHash = sha256({
        sourceCandidateId: decision.candidateId,
        sourceDecisionId: decision.decisionId,
        claimText,
        approvedEvidenceRefs: [...decision.evidenceRefsApproved].sort(),
        candidateSnapshotHash,
        decisionHash: decision.decisionHash,
      });
      return {
        promotedFindingId: stableId("promoted_finding", promotedFindingHash),
        sourceCandidateId: decision.candidateId,
        sourceDecisionId: decision.decisionId,
        sourcePacketId: decision.packetId,
        detectorId: packet.candidate.detectorId,
        month: packet.candidate.month,
        scopeKind: packet.candidate.scopeKind,
        scopeId: packet.candidate.scopeId,
        routeId: packet.candidate.routeId,
        category: packet.candidate.category,
        severity: packet.candidate.severity,
        confidence: packet.candidate.confidence,
        reasonCode: packet.candidate.reasonCode,
        claimText,
        approvedClaimStrength: queueItem.maxPromotableClaimStrength,
        approvedEvidenceRefs: decision.evidenceRefsApproved,
        reviewer: decision.reviewer,
        reviewedAt: decision.reviewedAt,
        reviewRationale: decision.rationale,
        sourceCandidate: packet.candidate,
        decisionHash: decision.decisionHash,
        candidateSnapshotHash,
        promotedFindingHash,
      };
    });
  const detectorCounts: Record<string, number> = {};
  for (const finding of promotedFindings) {
    detectorCounts[finding.detectorId] = (detectorCounts[finding.detectorId] ?? 0) + 1;
  }

  const promotedFindingsArtifact = PromotedFindingsArtifactSchema.parse({
    artifactKind: "promoted_findings",
    schemaVersion: 1,
    month: options.isoMonth,
    generatedAt: new Date().toISOString(),
    promotionQueueArtifactPath,
    reviewDecisionsArtifactPath,
    promotedFindingCount: promotedFindings.length,
    summary: {
      promotedFindingCount: promotedFindings.length,
      detectorCounts,
      routeCount: new Set(promotedFindings.map((finding) => finding.routeId).filter(Boolean)).size,
    },
    findings: promotedFindings,
  });

  await mkdir(dirname(reviewDecisionsArtifactPath), { recursive: true });
  await writeJson(reviewDecisionsArtifactPath, reviewDecisionsArtifact);
  await writeJson(promotedFindingsOutputPath, promotedFindingsArtifact);

  return {
    isoMonth: options.isoMonth,
    decisionCount: decisions.length,
    promotedFindingCount: promotedFindings.length,
    reviewDecisionsArtifactPath,
    promotedFindingsArtifactPath: promotedFindingsOutputPath,
  };
}

export async function buildPromotedFindingsFromCli(
  args: string[],
): Promise<BuildPromotedFindingsResult> {
  const result = await buildPromotedFindings(parseCliArgs(args));
  console.log(
    `findings-promote ${result.isoMonth}: decisions=${result.decisionCount} promoted=${result.promotedFindingCount} decisionsArtifact=${result.reviewDecisionsArtifactPath} promotedArtifact=${result.promotedFindingsArtifactPath}`,
  );
  return result;
}
