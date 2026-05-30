import * as z from "zod";

import {
  type AgentFindingProposal,
  AgentFindingProposalSchema,
  type AgentFindingProposalValidationArtifact,
} from "@bp/domain";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "@earendil-works/pi-ai";

import type { CodemodeTerminationSignal } from "../../lib/codemode/index.ts";

import type { LoadedCorpus } from "./_corpus.ts";
import { validateProposal } from "./_validation.ts";

// ---------------------------------------------------------------------------
// Submission tool — replaces the "model emits final JSON; runner parses + validates"
// path. The model calls this tool when it's ready; the tool runs the same
// Zod + validator pipeline the runner used post-hoc and returns the result
// inside the tool's response so the model can self-correct on failure.
//
// On all-valid: the tool records the proposals + validations in the store
// and returns `terminateLoop: true` — the codemode tool-loop ends.
// On any-rejected: the tool records nothing, returns the per-proposal errors
// as text, and the loop continues so the model can re-submit a fixed batch.

const submitParams = Type.Object(
  {
    proposals: Type.Array(
      Type.Object(
        {
          routeId: Type.Union([Type.String(), Type.Null()], {
            description: "Route ID this proposal scopes to, or null for system-level.",
          }),
          scopeKind: Type.String({
            description: "One of: route | segment | corridor | system.",
          }),
          category: Type.String({
            description: "One of: reliability | speed | intervention | data_quality | context.",
          }),
          severity: Type.String({
            description: "One of: info | low | medium | high.",
          }),
          confidence: Type.String({
            description: "One of: insufficient | low | medium | high.",
          }),
          claimText: Type.String({
            maxLength: 500,
            description:
              "The observation (<=500 chars). Every quantitative number in this string must also appear as a metricClaim with a matching evidenceRef.",
          }),
          claimStrength: Type.String({
            description: "One of: observation | qualified_claim | blocked.",
          }),
          evidenceRefs: Type.Array(Type.Record(Type.String(), Type.Unknown()), {
            description:
              "Discriminated union of {kind: review_packet_link | signal_feature | promoted_finding | intervention_record | document_candidate | context_appendix | code_execution} plus the fields each kind requires. context_appendix requires {kind,routeId,section,month}. code_execution requires {kind,language,code,stdoutHash}.",
          }),
          counterEvidenceRefs: Type.Optional(
            Type.Array(Type.Record(Type.String(), Type.Unknown())),
          ),
          interventionRecordIds: Type.Optional(Type.Array(Type.String())),
          documentCandidateIds: Type.Optional(Type.Array(Type.String())),
          metricClaims: Type.Optional(
            Type.Array(Type.Record(Type.String(), Type.Unknown()), {
              description:
                "One per number in claimText. Shape: {variable, value, units?, evidenceRef}. The evidenceRef carries the SAME required fields as the top-level evidenceRefs entries (e.g. context_appendix needs month).",
            }),
          ),
          caveats: Type.Optional(Type.Array(Type.String())),
          missingEvidence: Type.Optional(Type.Array(Type.String())),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

type SubmitArgs = Static<typeof submitParams>;

export type SubmitResultDetails = CodemodeTerminationSignal & {
  outcome: "accepted" | "rejected" | "schema_invalid";
  acceptedCount: number;
  rejectedCount: number;
  errorsByIndex: Array<{ index: number; errors: string[] }>;
};

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

export type ProposalStore = {
  proposals: AgentFindingProposal[];
  validations: AgentFindingProposalValidationArtifact["validations"];
  attempts: number;
};

export type BuildProposalFn = (input: {
  runId: string;
  month: string;
  draft: z.output<typeof ModelProposalDraftSchema>;
}) => AgentFindingProposal;

export type SubmitToolOptions = {
  runId: string;
  corpus: LoadedCorpus;
  buildProposal: BuildProposalFn;
  store: ProposalStore;
};

const DESCRIPTION =
  "Submit your finding proposals for validation and acceptance. Provide one or more proposals; if all pass validation the run ends. If any are rejected, you receive per-proposal errors and can call this tool again with a corrected batch. Do not emit final JSON in a text response — only this tool advances the run.";

function formatErrorsText(
  errorsByIndex: SubmitResultDetails["errorsByIndex"],
  total: number,
): string {
  const lines: string[] = [
    `Submission rejected. ${errorsByIndex.length}/${total} proposals had validation errors.`,
    "",
    "Fix each error below and call submit_finding_proposals again with the corrected batch.",
    "",
  ];
  for (const entry of errorsByIndex) {
    lines.push(`proposals[${entry.index}]:`);
    for (const err of entry.errors) lines.push(`  - ${err}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function buildSubmitFindingProposalsTool(
  opts: SubmitToolOptions,
): AgentTool<typeof submitParams, SubmitResultDetails> {
  return {
    name: "submit_finding_proposals",
    label: "Submit findings",
    description: DESCRIPTION,
    parameters: submitParams,
    execute: async (
      _toolCallId,
      args: SubmitArgs,
    ): Promise<AgentToolResult<SubmitResultDetails>> => {
      opts.store.attempts += 1;
      const total = args.proposals.length;

      if (total === 0) {
        const details: SubmitResultDetails = {
          terminateLoop: false,
          outcome: "rejected",
          acceptedCount: 0,
          rejectedCount: 0,
          errorsByIndex: [{ index: -1, errors: ["proposals array was empty"] }],
        };
        return {
          content: [
            {
              type: "text",
              text: "Submission rejected: proposals array was empty. Submit at least one proposal, or none if you genuinely have nothing to propose (in which case call the tool with a single placeholder is not allowed — instead say so in your final text and the run will end).",
            },
          ],
          details,
        };
      }

      const built: AgentFindingProposal[] = [];
      const validations: AgentFindingProposalValidationArtifact["validations"] = [];
      const errorsByIndex: SubmitResultDetails["errorsByIndex"] = [];

      for (let i = 0; i < args.proposals.length; i += 1) {
        const raw = args.proposals[i];
        // Step 1: Permissive draft parse (catches missing/mistyped fields with
        // model-friendly Zod errors before the strict schema does).
        const draftParse = ModelProposalDraftSchema.safeParse(raw);
        if (!draftParse.success) {
          errorsByIndex.push({
            index: i,
            errors: draftParse.error.issues
              .slice(0, 8)
              .map((iss) => `${iss.path.join(".") || "<root>"}: ${iss.message}`),
          });
          continue;
        }

        // Step 2: Build the full proposal with runId, month, defaults.
        const proposal = opts.buildProposal({
          runId: opts.runId,
          month: opts.corpus.month,
          draft: draftParse.data,
        });

        // Step 3: Strict schema validation (discriminated-union evidenceRefs,
        // enum constraints, etc.) — same as the post-hoc check that used to run
        // in _runner.ts.
        const strict = AgentFindingProposalSchema.safeParse(proposal);
        if (!strict.success) {
          errorsByIndex.push({
            index: i,
            errors: strict.error.issues
              .slice(0, 8)
              .map((iss) => `${iss.path.join(".") || "<root>"}: ${iss.message}`),
          });
          continue;
        }

        // Step 4: Semantic validators (evidence resolution, metric consistency,
        // language, scope blocks, dedupe, code_execution re-run).
        const record = await validateProposal(opts.corpus, strict.data);
        if (record.validationState !== "valid") {
          errorsByIndex.push({ index: i, errors: record.errors });
          continue;
        }

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
        built.push(validated);
        validations.push(record);
      }

      if (errorsByIndex.length > 0) {
        const details: SubmitResultDetails = {
          terminateLoop: false,
          outcome: built.length === 0 ? "rejected" : "rejected",
          acceptedCount: built.length,
          rejectedCount: errorsByIndex.length,
          errorsByIndex,
        };
        return {
          content: [
            {
              type: "text",
              text: formatErrorsText(errorsByIndex, total),
            },
          ],
          details,
        };
      }

      // All valid — commit and terminate.
      opts.store.proposals = built;
      opts.store.validations = validations;
      const details: SubmitResultDetails = {
        terminateLoop: true,
        outcome: "accepted",
        acceptedCount: built.length,
        rejectedCount: 0,
        errorsByIndex: [],
      };
      return {
        content: [
          {
            type: "text",
            text: `Submission accepted. ${built.length} proposal(s) recorded. Run complete.`,
          },
        ],
        details,
      };
    },
  };
}

// Type-safety re-export so callers don't have to import zod just to use the
// build function. The runner constructs proposals from the same draft shape.
export { ModelProposalDraftSchema };
