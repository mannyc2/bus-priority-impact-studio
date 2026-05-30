import * as z from "zod";

import {
  type AgentBriefProposal,
  AgentBriefProposalSchema,
  type AgentBriefProposalsArtifact,
  type AgentBriefProposalValidationArtifact,
  type AgentFindingProposalModelMeta,
} from "@bp/domain";

import type { LoadedCorpus } from "./_corpus.ts";
import { validateBriefProposal } from "./_brief_validation.ts";
import {
  getRouteBriefDigest,
  type RouteBriefDigest,
  routeIdToBriefSlug,
} from "./_brief_tools.ts";

// ---------------------------------------------------------------------------
// Model seam — same shape as _runner.ts. The smoke test injects a canned
// response; the real CLI calls pi-ai.

export type BriefModelCompletionInput = {
  systemPrompt: string;
  userMessage: string;
};

export type BriefModelCompletion = (
  input: BriefModelCompletionInput,
) => Promise<string>;

// ---------------------------------------------------------------------------
// Model output shape — permissive front-end. The runner narrows each draft
// through the strict AgentBriefProposalSchema after assembly. We don't try to
// validate every sub-field with Zod up front — strict() on the embedded
// brief catches drift, and an unparseable response throws once with a
// useful message.

const ModelBriefProposalDraftSchema = z
  .object({
    proposalId: z.string().optional(),
    brief: z.record(z.string(), z.unknown()),
    evidenceProvenance: z.array(z.record(z.string(), z.unknown())).optional(),
    selectedFindingIds: z.array(z.string()).optional(),
    selectedInterventionRecordIds: z.array(z.string()).optional(),
    curationRationale: z.string(),
    caveats: z.array(z.string()).optional(),
    missingEvidence: z.array(z.string()).optional(),
  })
  .strict();

const ModelBriefResponseSchema = z
  .object({
    proposals: z.array(ModelBriefProposalDraftSchema),
  })
  .strict();

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf("{");
  if (start === -1) throw new Error("model response contained no JSON object");
  return trimmed.slice(start);
}

// ---------------------------------------------------------------------------
// Prompts

const BRIEF_SYSTEM_PROMPT = `You are the **Bus Priority Impact Studio** brief-proposal agent.

You draft route briefs grounded in the corpus passed to you. You do **not** publish briefs — every draft enters the reviewer queue with status="Draft" and an operator must promote before publication.

# Hard rules
- Only reference findings + interventions + signal rows that appear in the corpus block. Never invent IDs.
- brief.status MUST equal "Draft" and brief.version MUST equal "draft-v1". No exceptions.
- Every numeric figure in any prose field (summary, dek, kpis.value, sections[].body[], evidence[].detail, claims[].title|body, caveats[].body) MUST appear as a metricClaim in evidenceProvenance, naming the exact field from the cited evidence payload. We resolve the cited evidence payload and check field-by-field.
- Year-month (2026-03), bare years (2024), route IDs (Q65), NYC service codes (311), packet/link IDs, and HH:MM times don't count as numbers — only quantitative figures do.
- Never assert causal effect ("caused", "led to", "because of"). Stay observational.
- Never recommend policy ("should", "must", "we recommend").
- Never use marketing tone ("breakthrough", "transformative", "amazing").
- If you say "implemented" / "installed" / "completed", at least one cited intervention record must have recordKind=implemented or in_progress.
- brief.title max 200 chars. claim.title max 280 chars. summary max 800 chars. dek max 400 chars. section body lines max 800 chars.

# Output shape
Return JSON only:
{
  "proposals": [
    {
      "brief": {
        "routeSlug": "...",                    // lowercased route id by default
        "title": "...",
        "status": "Draft",
        "version": "draft-v1",
        "summary": "...",
        "dek": "...",
        "kpis": [{ "label": "...", "value": "...", "unit": "...", "sub": "...", "tone": "neutral" }],
        "sections": [{ "title": "...", "body": ["...", "..."] }],
        "claims": [{ "n": 1, "title": "...", "strength": 70, "evidenceIds": ["ev-1"], "caveatIds": ["cv-1"] }],
        "evidence": [{ "id": "ev-1", "kind": "number", "title": "...", "detail": "..." }],
        "caveats": [{ "id": "cv-1", "title": "...", "body": "..." }]
      },
      "evidenceProvenance": [
        { "evidenceId": "ev-1",
          "citedRefs": [{ "kind": "promoted_finding", "promotedFindingId": "..." }],
          "metricClaims": [{ "variable": "...", "value": 0, "units": "...", "evidenceRef": {...} }]
        }
      ],
      "selectedFindingIds": ["..."],
      "selectedInterventionRecordIds": [],
      "curationRationale": "Why these findings + interventions; what was excluded.",
      "caveats": ["..."],
      "missingEvidence": ["..."]
    }
  ]
}

Return nothing else. No commentary, no markdown, no preamble.`;

function buildBriefUserMessage(input: {
  digests: RouteBriefDigest[];
}): string {
  const header = [
    `Generate one brief proposal per route below.`,
    "If a route has zero promoted findings, skip it — a brief without findings has nothing to anchor to.",
    "If an existing brief already covers the same framing, skip the route (the validator will reject it as a duplicate anyway).",
    "Return a single JSON object as instructed in the system prompt.",
    "",
    "# Corpus",
  ];
  const blocks = input.digests.map((digest) => {
    const json = JSON.stringify(digest, null, 2);
    return `## Route ${digest.routeId}\n\`\`\`json\n${json}\n\`\`\``;
  });
  return [...header, ...blocks].join("\n\n");
}

// ---------------------------------------------------------------------------
// Runner

export type RunBriefProposalsInput = {
  corpus: LoadedCorpus;
  routes: string[];
  runId: string;
  model: AgentFindingProposalModelMeta;
  modelComplete: BriefModelCompletion;
  briefsPath?: string | null;
};

export type RunBriefProposalsResult = {
  proposals: AgentBriefProposal[];
  proposalsArtifact: AgentBriefProposalsArtifact;
  validationArtifact: AgentBriefProposalValidationArtifact;
  toolCallCount: number;
  durationMs: number;
};

let counter = 0;
function makeProposalId(runId: string): string {
  counter += 1;
  return `${runId}-brief-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildProposalFromDraft(input: {
  runId: string;
  draft: z.output<typeof ModelBriefProposalDraftSchema>;
}): AgentBriefProposal {
  const draft = input.draft;
  const proposal: AgentBriefProposal = {
    proposalId: draft.proposalId ?? makeProposalId(input.runId),
    runId: input.runId,
    brief: draft.brief as AgentBriefProposal["brief"],
    evidenceProvenance:
      (draft.evidenceProvenance ?? []) as AgentBriefProposal["evidenceProvenance"],
    selectedFindingIds: draft.selectedFindingIds ?? [],
    selectedInterventionRecordIds: draft.selectedInterventionRecordIds ?? [],
    curationRationale: draft.curationRationale,
    caveats: draft.caveats ?? [],
    missingEvidence: draft.missingEvidence ?? [],
    duplicateCheck: {
      matchedBriefId: null,
      reason: "no peer briefs checked",
    },
    validationState: "pending" as AgentBriefProposal["validationState"],
    validationErrors: [],
  };
  return proposal;
}

export async function runAgentBriefPropose(
  input: RunBriefProposalsInput,
): Promise<RunBriefProposalsResult> {
  const start = Date.now();
  const digests = input.routes.map((routeId) =>
    getRouteBriefDigest(input.corpus, routeId),
  );
  const userMessage = buildBriefUserMessage({ digests });
  const text = await input.modelComplete({
    systemPrompt: BRIEF_SYSTEM_PROMPT,
    userMessage,
  });

  let parsed: z.output<typeof ModelBriefResponseSchema>;
  try {
    const json = JSON.parse(extractJsonObject(text));
    const result = ModelBriefResponseSchema.safeParse(json);
    if (!result.success) {
      throw new Error(
        `model response failed schema validation: ${result.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      );
    }
    parsed = result.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to parse brief model response: ${message}`);
  }

  const proposals: AgentBriefProposal[] = [];
  const validations: AgentBriefProposalValidationArtifact["validations"] = [];
  for (const draft of parsed.proposals) {
    const proposal = buildProposalFromDraft({
      runId: input.runId,
      draft,
    });
    const strict = AgentBriefProposalSchema.safeParse(proposal);
    if (!strict.success) {
      const errors = strict.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`);
      proposal.validationState = "rejected" as typeof proposal.validationState;
      proposal.validationErrors = errors.map((e) => `[schema] ${e}`);
      proposals.push(proposal);
      validations.push({
        proposalId: proposal.proposalId,
        validationState: proposal.validationState,
        errors: proposal.validationErrors,
        checks: [],
      });
      continue;
    }
    const record = validateBriefProposal(input.corpus, strict.data);
    const validated: AgentBriefProposal = {
      ...strict.data,
      validationState: record.validationState,
      validationErrors: record.errors,
    };
    const dupCheck = record.checks.find((c) => c.name === "duplicate");
    if (dupCheck && !dupCheck.passed) {
      const match = dupCheck.errors[0]?.match(/duplicate of brief (\S+):/);
      if (match?.[1]) {
        validated.duplicateCheck = {
          matchedBriefId: match[1],
          reason: dupCheck.errors[0] ?? "",
        };
      }
    }
    proposals.push(validated);
    validations.push(record);
  }

  const durationMs = Date.now() - start;
  const summary = {
    totalProposals: proposals.length,
    validCount: proposals.filter((p) => p.validationState === "valid").length,
    rejectedCount: proposals.filter((p) => p.validationState === "rejected").length,
    byRoute: tally(proposals.map((p) => p.brief.routeSlug)),
  };

  const corpusPaths: AgentBriefProposalsArtifact["corpusPaths"] = {
    ...input.corpus.paths,
    briefs: input.briefsPath ?? null,
  };

  const proposalsArtifact: AgentBriefProposalsArtifact = {
    artifactKind: "agent_brief_proposals",
    schemaVersion: 1,
    month: input.corpus.month,
    runId: input.runId,
    model: input.model,
    corpusPaths,
    generatedAt: new Date().toISOString(),
    durationMs,
    toolCallCount: 0,
    proposals,
    summary,
  };

  const validationArtifact: AgentBriefProposalValidationArtifact = {
    artifactKind: "agent_brief_proposal_validation",
    schemaVersion: 1,
    proposalsArtifactPath: "",
    generatedAt: proposalsArtifact.generatedAt,
    summary: {
      totalProposals: summary.totalProposals,
      validCount: summary.validCount,
      rejectedCount: summary.rejectedCount,
    },
    validations,
  };

  return {
    proposals,
    proposalsArtifact,
    validationArtifact,
    toolCallCount: 0,
    durationMs,
  };
}

function tally<T extends string>(values: readonly T[]): Record<T, number> {
  const out: Record<string, number> = {};
  for (const v of values) {
    out[v] = (out[v] ?? 0) + 1;
  }
  return out as Record<T, number>;
}

export { routeIdToBriefSlug };
