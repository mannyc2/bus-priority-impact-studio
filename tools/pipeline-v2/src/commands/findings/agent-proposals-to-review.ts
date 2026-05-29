import { defineCommand, z } from "@liche/core";
import { join } from "node:path";

import {
  type AgentFindingProposal,
  AgentFindingProposalsArtifactSchema,
  AgentFindingProposalValidationArtifactSchema,
} from "@bp/domain";

import { agentProposalsDir } from "../../lib/paths.ts";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";

// One bridged-queue candidate matches the structural shape of the existing
// ReviewQueueCandidate (studio/_release-types.ts:468) so reviewer tooling can
// consume both files with the same parser. Source is the new `"agent_proposal"`
// enum value added to StudioFindingReviewSchema.source.

type BridgedReviewQueueCandidate = {
  candidateId: string;
  detectorId: string;
  routeId: string | null;
  reasonCode: string;
  category: string;
  severity: string;
  confidence: string;
  detectorScore: number;
  claimText: string;
  reviewState: "unreviewed";
  evidenceRefCount: number;
  evidenceRefs: string[];
  source: "agent_proposal";
  proposalId: string;
};

type BridgedReviewQueueArtifact = {
  artifactKind: "agent_bridged_review_queue";
  schemaVersion: 1;
  month: string;
  runId: string;
  proposalsArtifactPath: string;
  validationArtifactPath: string;
  generatedAt: string;
  summary: {
    totalCandidates: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  candidates: BridgedReviewQueueCandidate[];
};

const SEVERITY_SCORE: Record<string, number> = {
  info: 0.1,
  low: 0.25,
  medium: 0.5,
  high: 0.75,
};

const CONFIDENCE_BOOST: Record<string, number> = {
  insufficient: 0,
  low: 0,
  medium: 0.1,
  high: 0.2,
};

function deriveDetectorScore(proposal: AgentFindingProposal): number {
  const base = SEVERITY_SCORE[proposal.severity] ?? 0.25;
  const boost = CONFIDENCE_BOOST[proposal.confidence] ?? 0;
  return Math.min(1, base + boost);
}

function evidenceRefsToStrings(proposal: AgentFindingProposal): string[] {
  return proposal.evidenceRefs.map((ref) => {
    switch (ref.kind) {
      case "review_packet_link":
        return `packet:${ref.packetId}:${ref.linkId}`;
      case "signal_feature":
        return `signal:${ref.routeId}:${ref.window}:${ref.feature}`;
      case "promoted_finding":
        return `promoted:${ref.promotedFindingId}`;
      case "intervention_record":
        return `intervention:${ref.recordId}`;
      case "document_candidate":
        return `document:${ref.candidateId}`;
      case "context_appendix":
        return `context:${ref.routeId}:${ref.section}`;
    }
  });
}

function tally(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

export function buildBridgedReviewQueue(input: {
  month: string;
  runId: string;
  proposals: readonly AgentFindingProposal[];
  proposalsArtifactPath: string;
  validationArtifactPath: string;
}): BridgedReviewQueueArtifact {
  const valid = input.proposals.filter((p) => p.validationState === "valid");
  const candidates: BridgedReviewQueueCandidate[] = valid.map((proposal) => ({
    candidateId: proposal.proposalId,
    detectorId: "agent_proposal",
    routeId: proposal.routeId,
    reasonCode: `agent_${proposal.category}`,
    category: proposal.category,
    severity: proposal.severity,
    confidence: proposal.confidence,
    detectorScore: deriveDetectorScore(proposal),
    claimText: proposal.claimText,
    reviewState: "unreviewed",
    evidenceRefCount: proposal.evidenceRefs.length,
    evidenceRefs: evidenceRefsToStrings(proposal),
    source: "agent_proposal",
    proposalId: proposal.proposalId,
  }));
  return {
    artifactKind: "agent_bridged_review_queue",
    schemaVersion: 1,
    month: input.month,
    runId: input.runId,
    proposalsArtifactPath: input.proposalsArtifactPath,
    validationArtifactPath: input.validationArtifactPath,
    generatedAt: new Date().toISOString(),
    summary: {
      totalCandidates: candidates.length,
      byCategory: tally(candidates.map((c) => c.category)),
      bySeverity: tally(candidates.map((c) => c.severity)),
    },
    candidates,
  };
}

export default defineCommand({
  path: ["findings", "agent-proposals-to-review"],
  summary:
    "Promote validated agent proposals into a bridged-review-queue artifact for reviewer consumption. Skips rejected proposals; never touches promoted-findings.",
  input: {
    options: z.object({
      year: z.coerce.number().int().min(2000).max(2100).describe("Calendar year."),
      month: z.coerce.number().int().min(1).max(12).describe("Calendar month 1-12."),
      runId: z
        .string()
        .min(1)
        .describe("Run ID emitted by findings:agent-propose (printed as runId on its result)."),
      execute: z
        .union([z.boolean(), z.string()])
        .default(false)
        .describe(
          "Without --execute (dry run), the command prints the would-be summary. With --execute, writes bridged-review-queue.json next to the proposals artifact.",
        ),
    }),
  },
  output: z.object({
    command: z.literal("findings:agent-proposals-to-review"),
    runId: z.string(),
    month: z.string(),
    executed: z.boolean(),
    proposalsArtifactPath: z.string(),
    validationArtifactPath: z.string(),
    bridgedArtifactPath: z.string().nullable(),
    summary: z.object({
      totalProposals: z.number(),
      validProposals: z.number(),
      rejectedProposals: z.number(),
      bridgedCandidates: z.number(),
    }),
  }),
  async run({ input }) {
    const options = input.options;
    const monthIso = `${String(options.year).padStart(4, "0")}-${String(options.month).padStart(2, "0")}`;
    const runDir = agentProposalsDir(monthIso, options.runId);
    const proposalsArtifactPath = join(runDir, "agent-finding-proposals.json");
    const validationArtifactPath = join(runDir, "agent-finding-proposal-validation.json");

    const proposalsArtifact = await readJsonArtifact(
      proposalsArtifactPath,
      AgentFindingProposalsArtifactSchema,
    );
    await readJsonArtifact(validationArtifactPath, AgentFindingProposalValidationArtifactSchema);

    const bridged = buildBridgedReviewQueue({
      month: monthIso,
      runId: options.runId,
      proposals: proposalsArtifact.proposals,
      proposalsArtifactPath,
      validationArtifactPath,
    });

    const executeFlag =
      typeof options.execute === "string"
        ? options.execute === "true" || options.execute === "1"
        : options.execute;

    let bridgedArtifactPath: string | null = null;
    if (executeFlag) {
      bridgedArtifactPath = join(runDir, "bridged-review-queue.json");
      await writeJson(bridgedArtifactPath, bridged);
    }

    return {
      command: "findings:agent-proposals-to-review" as const,
      runId: options.runId,
      month: monthIso,
      executed: executeFlag,
      proposalsArtifactPath,
      validationArtifactPath,
      bridgedArtifactPath,
      summary: {
        totalProposals: proposalsArtifact.proposals.length,
        validProposals: proposalsArtifact.summary.validCount,
        rejectedProposals: proposalsArtifact.summary.rejectedCount,
        bridgedCandidates: bridged.candidates.length,
      },
    };
  },
});
