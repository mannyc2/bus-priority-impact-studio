import * as z from "zod";

import {
  type AgentFindingProposal,
  AgentFindingProposalSchema,
  type AgentFindingProposalModelMeta,
  type AgentFindingProposalsArtifact,
  type AgentFindingProposalValidationArtifact,
  type FindingCategory,
  type FindingScopeKind,
  type FindingSeverity,
} from "@bp/domain";

import type { ModelToolLoop, ToolUseTraceEntry } from "../../lib/codemode/index.ts";

import type { LoadedCorpus } from "./_corpus.ts";
import {
  buildSubmitFindingProposalsTool,
  type ProposalStore,
} from "./_submit_tool.ts";
import {
  getRouteContextDigest,
  type RouteContextDigest,
} from "./_tools.ts";
import { validateProposal } from "./_validation.ts";

// ---------------------------------------------------------------------------
// Model seam
//
// The runner is intentionally model-agnostic. A `ModelCompletion` returns the
// text the model produced — the real implementation calls pi-ai's `complete()`,
// the smoke test injects a canned response. The runner does the prompt
// assembly, JSON parsing, retry, validation, and artifact stitching.

export type ModelCompletionInput = {
  systemPrompt: string;
  userMessage: string;
};

export type ModelCompletion = (input: ModelCompletionInput) => Promise<string>;

// ---------------------------------------------------------------------------
// Model output shape
//
// The model returns a JSON object `{ proposals: [...] }`. We parse with a
// permissive front-end (assistant text often has stray prose) and then validate
// each proposal against the strict AgentFindingProposalSchema.

const ModelProposalDraftSchema = z
  .object({
    proposalId: z.string().optional(),
    routeId: z.string().nullable(),
    scopeKind: z.string(),
    category: z.string(),
    severity: z.string(),
    confidence: z.string(),
    claimText: z.string(),
    claimStrength: z.enum(["observation", "qualified_claim", "blocked"]),
    evidenceRefs: z.array(z.record(z.string(), z.unknown())),
    counterEvidenceRefs: z.array(z.record(z.string(), z.unknown())).optional(),
    interventionRecordIds: z.array(z.string()).optional(),
    documentCandidateIds: z.array(z.string()).optional(),
    metricClaims: z.array(z.record(z.string(), z.unknown())).optional(),
    caveats: z.array(z.string()).optional(),
    missingEvidence: z.array(z.string()).optional(),
  })
  .strict();

const ModelResponseSchema = z
  .object({
    proposals: z.array(ModelProposalDraftSchema),
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

const COMMON_RULES = `# Hard rules
- Only reference evidence that appears in the corpus block. Never invent packetIds, linkIds, recordIds, candidateIds, or signal-feature column names.
- Never assert causal effect ("caused", "led to", "because of"). Stay observational.
- Never recommend policy ("should", "must", "we recommend").
- Never use marketing tone ("breakthrough", "transformative", "amazing").
- If you say "implemented" / "installed" / "completed", at least one cited intervention record must have recordKind=implemented or in_progress.
- claimStrength choices: observation (descriptive), qualified_claim (highest you may assert), blocked (you reached a non-permitted claim and are flagging it for review).
- claimText max 500 characters.
- **Every number you put in claimText must also appear as a metricClaim.** The metricClaim must name the exact field from the cited evidence payload (e.g. "highConfidenceTouchCount", not "touchCount") and its value must match what that field actually holds. We resolve the cited packet/signal payload and check field-by-field — fabricated qualifiers ("X high-confidence" when X is actually the total) will be rejected. Year-month strings (e.g. 2026-03), bare years (2024), route IDs (Q65), packet/link IDs, and HH:MM times don't count as numbers — only quantitative figures do.

# Categories you may use
reliability, speed, intervention, data_quality, context

# Severity: info, low, medium, high
# Confidence: insufficient, low, medium, high`;

const SYSTEM_PROMPT = `You are the **Bus Priority Impact Studio** findings-proposal agent.

Your job is to propose candidate findings about NYC bus performance, grounded in the corpus passed to you. You do **not** publish findings — every proposal goes through deterministic validation and a human reviewer.

${COMMON_RULES}

# Output shape
Return JSON only:
{
  "proposals": [
    {
      "routeId": "B44",            // string or null
      "scopeKind": "route",        // route | segment | corridor | system
      "category": "reliability",
      "severity": "moderate",
      "confidence": "moderate",
      "claimText": "...",
      "claimStrength": "observation",
      "evidenceRefs": [
        { "kind": "review_packet_link", "packetId": "...", "linkId": "..." },
        { "kind": "signal_feature", "routeId": "B44", "window": "weekday_peak", "feature": "routeWeightedAverageSpeedMph" },
        { "kind": "promoted_finding", "promotedFindingId": "..." },
        { "kind": "intervention_record", "recordId": "..." },
        { "kind": "document_candidate", "candidateId": "..." },
        { "kind": "context_appendix", "routeId": "B44", "section": "weather" }
      ],
      "counterEvidenceRefs": [...],
      "interventionRecordIds": [...],
      "documentCandidateIds": [...],
      "metricClaims": [{ "variable": "...", "value": 0, "units": "...", "evidenceRef": {...} }],
      "caveats": ["..."],
      "missingEvidence": ["..."]
    }
  ]
}

Return nothing else. No commentary, no markdown, no preamble.`;

// Codemode prompt: no JSON output shape — the agent submits proposals by
// calling submit_finding_proposals. Validation runs inside the tool and
// returns per-proposal errors the agent can fix and re-submit.
const SYSTEM_PROMPT_CODEMODE = `You are the **Bus Priority Impact Studio** findings-proposal agent.

Your job is to investigate NYC bus performance using the sandbox tools (python_exec, bash_exec) and then submit candidate findings via the submit_finding_proposals tool. You do **not** publish findings — every accepted proposal still goes through a human reviewer.

${COMMON_RULES}

# Workflow (mandatory)

You have a small budget of investigation tool calls before you MUST submit.

1. Spend at most **6–8** python_exec / bash_exec calls inspecting the corpus to gather evidence.
2. Then call \`submit_finding_proposals({proposals: [...]})\` with what you have.
3. If the submit tool returns validation errors, fix the offending fields and call it again. You may iterate on submission up to **3 times**.
4. If after investigation you have nothing supportable to propose, call \`submit_finding_proposals\` with a single proposal whose \`claimStrength\` is \`"blocked"\` explaining what's missing — do not just stop exploring.

Do not emit JSON in a text response — only \`submit_finding_proposals\` advances the run. Final text responses are ignored. The run ends only when the submit tool accepts your proposals.

# Submit tool reminders

- The tool returns per-proposal errors with full Zod paths. Read them carefully — the same evidenceRef shape is required on top-level \`evidenceRefs\` AND on every \`metricClaims[].evidenceRef\` (e.g. \`context_appendix\` requires \`{kind, routeId, section, month}\` in BOTH places).
- Re-submit the entire batch each time, not just the corrected entries.`;

function buildUserMessage(input: {
  digests: RouteContextDigest[];
  maxProposalsPerRoute: number;
}): string {
  const header = [
    `Generate up to ${input.maxProposalsPerRoute} proposals per route below.`,
    "Skip routes where the corpus does not support any proposal.",
    "Follow the workflow described in the system prompt.",
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

export type RunProposalsInput = {
  corpus: LoadedCorpus;
  routes: string[];
  maxProposalsPerRoute: number;
  runId: string;
  model: AgentFindingProposalModelMeta;
  modelComplete: ModelCompletion;
  // Codemode (step 7). When `enableCodemode` is true the runner uses
  // `modelToolLoop` instead of `modelComplete`, appends `corpusMapMarkdown`
  // to the system prompt, and surfaces `toolUseTrace` on the result.
  enableCodemode?: boolean;
  modelToolLoop?: ModelToolLoop;
  corpusMapMarkdown?: string;
};

export type RunProposalsResult = {
  proposals: AgentFindingProposal[];
  proposalsArtifact: AgentFindingProposalsArtifact;
  validationArtifact: AgentFindingProposalValidationArtifact;
  // Total tool calls the model issued during this run. In codemode this is
  // sandbox calls (python_exec + bash_exec, from toolUseTrace) PLUS the
  // submit_finding_proposals attempts. Non-codemode path returns 0 since
  // the model emits text only.
  toolCallCount: number;
  // Codemode-only: how many times the model called submit_finding_proposals.
  // >1 indicates the model self-corrected after validator rejections.
  submitAttempts?: number;
  durationMs: number;
  // Populated when codemode is on. The trace records every sandbox tool call
  // the model issued during proposal generation, in order. Distinct from the
  // re-execution that happens during validation.
  toolUseTrace?: ToolUseTraceEntry[];
  toolLoopCapsHit?: "calls" | "stdout" | "walltime" | null;
};

let counter = 0;
function makeProposalId(runId: string): string {
  counter += 1;
  return `${runId}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEvidenceRef(
  ref: Record<string, unknown>,
  month: string,
): Record<string, unknown> {
  if (
    (ref["kind"] === "signal_feature" || ref["kind"] === "context_appendix") &&
    ref["month"] === undefined
  ) {
    return { ...ref, month };
  }
  return ref;
}

function buildProposal(input: {
  runId: string;
  month: string;
  draft: z.output<typeof ModelProposalDraftSchema>;
}): AgentFindingProposal {
  const draft = input.draft;
  const proposal: AgentFindingProposal = {
    proposalId: draft.proposalId ?? makeProposalId(input.runId),
    runId: input.runId,
    routeId: (draft.routeId ?? null) as AgentFindingProposal["routeId"],
    scopeKind: draft.scopeKind as FindingScopeKind,
    category: draft.category as FindingCategory,
    severity: draft.severity as FindingSeverity,
    confidence: draft.confidence as AgentFindingProposal["confidence"],
    claimText: draft.claimText,
    claimStrength: draft.claimStrength as AgentFindingProposal["claimStrength"],
    evidenceRefs: draft.evidenceRefs.map((ref) =>
      normalizeEvidenceRef(ref, input.month),
    ) as AgentFindingProposal["evidenceRefs"],
    counterEvidenceRefs:
      ((draft.counterEvidenceRefs ?? []).map((ref) =>
        normalizeEvidenceRef(ref, input.month),
      ) as AgentFindingProposal["counterEvidenceRefs"]),
    interventionRecordIds: draft.interventionRecordIds ?? [],
    documentCandidateIds: draft.documentCandidateIds ?? [],
    metricClaims: (draft.metricClaims as AgentFindingProposal["metricClaims"]) ?? [],
    caveats: draft.caveats ?? [],
    missingEvidence: draft.missingEvidence ?? [],
    duplicateCheck: {
      matchedPromotedFindingId: null,
      reason: "no peer findings checked",
    },
    validationState: "pending" as AgentFindingProposal["validationState"],
    validationErrors: [],
  };
  return proposal;
}

export async function runAgentPropose(
  input: RunProposalsInput,
): Promise<RunProposalsResult> {
  const start = Date.now();
  const digests = input.routes.map((routeId) =>
    getRouteContextDigest(input.corpus, routeId),
  );
  const userMessage = buildUserMessage({
    digests,
    maxProposalsPerRoute: input.maxProposalsPerRoute,
  });
  let toolUseTrace: ToolUseTraceEntry[] | undefined;
  let toolLoopCapsHit: "calls" | "stdout" | "walltime" | null | undefined;
  let submitAttempts: number | undefined;
  let proposals: AgentFindingProposal[] = [];
  let validations: AgentFindingProposalValidationArtifact["validations"] = [];

  if (input.enableCodemode) {
    if (!input.modelToolLoop) {
      throw new Error("enableCodemode is true but modelToolLoop was not supplied");
    }
    const systemPrompt = input.corpusMapMarkdown
      ? `${SYSTEM_PROMPT_CODEMODE}\n\n# Corpus map (codemode)\n\n${input.corpusMapMarkdown}`
      : SYSTEM_PROMPT_CODEMODE;
    const store: ProposalStore = { proposals: [], validations: [], attempts: 0 };
    const submitTool = buildSubmitFindingProposalsTool({
      runId: input.runId,
      corpus: input.corpus,
      buildProposal,
      store,
    });
    const loopResult = await input.modelToolLoop({
      systemPrompt,
      userMessage,
      extraTools: [submitTool],
    });
    toolUseTrace = loopResult.toolUseTrace;
    toolLoopCapsHit = loopResult.capsHit;
    submitAttempts = store.attempts;
    if (store.attempts === 0) {
      throw new Error(
        `codemode loop ended without a submit_finding_proposals call (capsHit=${loopResult.capsHit ?? "null"}, iterations=${loopResult.iterations}, toolCalls=${loopResult.toolUseTrace.length}). The model must call the submit tool to record proposals.`,
      );
    }
    proposals = store.proposals;
    validations = store.validations;
  } else {
    const text = await input.modelComplete({
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
    });
    let parsed: z.output<typeof ModelResponseSchema>;
    try {
      const json = JSON.parse(extractJsonObject(text));
      const result = ModelResponseSchema.safeParse(json);
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
      throw new Error(`failed to parse model response: ${message}`);
    }

    for (const draft of parsed.proposals) {
      const proposal = buildProposal({
        runId: input.runId,
        month: input.corpus.month,
        draft,
      });
      const strict = AgentFindingProposalSchema.safeParse(proposal);
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
      const record = await validateProposal(input.corpus, strict.data);
      const validated: AgentFindingProposal = {
        ...strict.data,
        validationState: record.validationState,
        validationErrors: record.errors,
      };
      const dupCheck = record.checks.find((c) => c.name === "duplicate");
      if (dupCheck && !dupCheck.passed) {
        const match = dupCheck.errors[0]?.match(/duplicate of promoted finding (\S+):/);
        if (match?.[1]) {
          validated.duplicateCheck = {
            matchedPromotedFindingId: match[1],
            reason: dupCheck.errors[0] ?? "",
          };
        }
      }
      proposals.push(validated);
      validations.push(record);
    }
  }

  const durationMs = Date.now() - start;
  const summary = {
    totalProposals: proposals.length,
    validCount: proposals.filter((p) => p.validationState === "valid").length,
    rejectedCount: proposals.filter((p) => p.validationState === "rejected").length,
    byCategory: tally(proposals.map((p) => p.category)),
    bySeverity: tally(proposals.map((p) => p.severity)),
    byScope: tally(proposals.map((p) => p.scopeKind)),
  };

  const sandboxToolCalls = toolUseTrace?.length ?? 0;
  const toolCallCount = sandboxToolCalls + (submitAttempts ?? 0);
  const proposalsArtifact: AgentFindingProposalsArtifact = {
    artifactKind: "agent_finding_proposals",
    schemaVersion: 1,
    month: input.corpus.month,
    runId: input.runId,
    model: input.model,
    corpusPaths: input.corpus.paths,
    generatedAt: new Date().toISOString(),
    durationMs,
    toolCallCount,
    proposals,
    summary,
  };

  const validationArtifact: AgentFindingProposalValidationArtifact = {
    artifactKind: "agent_finding_proposal_validation",
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
    toolCallCount,
    durationMs,
    ...(submitAttempts === undefined ? {} : { submitAttempts }),
    ...(toolUseTrace === undefined ? {} : { toolUseTrace }),
    ...(toolLoopCapsHit === undefined ? {} : { toolLoopCapsHit }),
  };
}

function tally<T extends string>(values: readonly T[]): Record<T, number> {
  const out: Record<string, number> = {};
  for (const v of values) {
    out[v] = (out[v] ?? 0) + 1;
  }
  return out as Record<T, number>;
}
