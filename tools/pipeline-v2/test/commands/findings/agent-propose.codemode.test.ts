import { describe, expect, test } from "bun:test";

import type { AgentFindingProposalModelMeta } from "@bp/domain";

import { sha256Hex } from "../../../src/commands/findings/_code_execution.ts";
import type { LoadedCorpus } from "../../../src/commands/findings/_corpus.ts";
import { runAgentPropose } from "../../../src/commands/findings/_runner.ts";
import type {
  ModelToolLoop,
  ToolUseTraceEntry,
} from "../../../src/commands/findings/_tool_loop.ts";
import { runPython } from "../../../src/lib/sandbox.ts";

// Step 7 + 8: codemode end-to-end. Mock the `ModelToolLoop` so the test
// doesn't need a real LLM, but let `preExecuteCodeRefs` (called inside
// `validateProposal`) hit the real bp-sandbox. A proposal with a
// `code_execution` ref is "valid" iff the cited code re-runs in the sandbox
// and its stdout hashes to the cited `stdoutHash`.

const SANDBOX_AVAILABLE = (() => {
  try {
    const r = Bun.spawnSync(["docker", "image", "inspect", "bp-sandbox:latest"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return r.exitCode === 0;
  } catch {
    return false;
  }
})();

const maybe = SANDBOX_AVAILABLE ? describe : describe.skip;

function emptyCorpus(): LoadedCorpus {
  return {
    month: "2026-03" as never,
    paths: {
      reviewPackets: "/tmp/review-packets.json",
      promotionQueue: null,
      promotedFindings: null,
      signalFeatures: null,
      contextAppendix: null,
      interventionPublishable: null,
      interventionPublishableByRoute: null,
      interventionRecords: null,
      documentCandidates: null,
    },
    routes: new Set(["B44"]) as never,
    reviewPackets: new Map(),
    reviewPacketsByRoute: new Map() as never,
    evidenceLinks: new Map(),
    promotionQueue: null,
    promotedFindings: new Map(),
    promotedFindingsByRoute: new Map() as never,
    signalFeaturesArtifact: null,
    signalFeaturesByRoute: new Map() as never,
    contextAppendixByRoute: new Map() as never,
    interventionRecords: new Map(),
    interventionRecordsByRoute: new Map() as never,
    documentCandidates: new Map(),
    publishableInterventions: [],
    publishableInterventionsByRoute: new Map() as never,
    briefs: new Map(),
    briefsByRouteSlug: new Map(),
  };
}

const model: AgentFindingProposalModelMeta = {
  provider: "mock",
  modelId: "mock/v0",
  temperature: 0,
  maxOutputTokens: 4096,
};

// Helper: pre-compute a stdoutHash by running the cited code through the real
// sandbox. In a real run the agent would observe stdout via `python_exec` and
// declare the matching hash in its proposal. Here we shortcut the loop and
// just pre-run to get the value the model would have seen.
async function captureHash(code: string): Promise<string> {
  const r = await runPython(code);
  if (r.exitCode !== 0) {
    throw new Error(
      `captureHash: code exited ${r.exitCode}: stderr=${r.stderr.slice(0, 200)}`,
    );
  }
  return sha256Hex(r.stdout);
}

maybe("runAgentPropose codemode (mock loop + real sandbox)", () => {
  test("a code_execution ref re-validates end-to-end", async () => {
    const corpus = emptyCorpus();
    const code = "print(42)";
    const stdoutHash = await captureHash(code);

    const fakeTrace: ToolUseTraceEntry[] = [
      {
        toolCallId: "fake-tc-1",
        tool: "python_exec",
        code,
        timeoutSec: undefined,
        exitCode: 0,
        stdoutPreview: "42\n",
        stderrPreview: "",
        durationMs: 12,
        stdoutBytes: 3,
        stdoutTruncated: false,
        timedOut: false,
      },
    ];

    const seenSystemPrompts: string[] = [];
    const modelToolLoop: ModelToolLoop = async ({ systemPrompt }) => {
      seenSystemPrompts.push(systemPrompt);
      return {
        finalText: JSON.stringify({
          proposals: [
            {
              proposalId: "p-codemode-1",
              routeId: "B44",
              scopeKind: "route",
              category: "context",
              severity: "low",
              confidence: "low",
              claimText:
                "Observation: a sandbox computation reports value 42 for this route's reference probe.",
              claimStrength: "observation",
              evidenceRefs: [
                {
                  kind: "code_execution",
                  language: "python",
                  code,
                  stdoutHash,
                  citedValuePath: undefined,
                },
              ],
              counterEvidenceRefs: [],
              interventionRecordIds: [],
              documentCandidateIds: [],
              metricClaims: [
                {
                  variable: "value",
                  value: 42,
                  units: null,
                  evidenceRef: {
                    kind: "code_execution",
                    language: "python",
                    code,
                    stdoutHash,
                    citedValuePath: undefined,
                  },
                },
              ],
              caveats: [],
              missingEvidence: [],
            },
          ],
        }),
        toolUseTrace: fakeTrace,
        capsHit: null,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: 0 },
        retries: 0,
        iterations: 2,
      };
    };

    const result = await runAgentPropose({
      corpus,
      routes: ["B44"],
      maxProposalsPerRoute: 1,
      runId: "run-codemode-1",
      model,
      modelComplete: async () => {
        throw new Error("non-codemode path should not be reached");
      },
      enableCodemode: true,
      modelToolLoop,
      corpusMapMarkdown: "# Test corpus map\nbp_corpus is available.",
    });

    expect(seenSystemPrompts.length).toBe(1);
    expect(seenSystemPrompts[0]).toContain("Test corpus map");

    expect(result.proposals.length).toBe(1);
    const proposal = result.proposals[0]!;
    if (proposal.validationState !== "valid") {
      throw new Error(
        `expected valid, got ${proposal.validationState}: ${JSON.stringify(
          proposal.validationErrors,
        )}`,
      );
    }
    expect(result.toolUseTrace).toBeDefined();
    expect(result.toolUseTrace?.length).toBe(1);
    expect(result.toolCallCount).toBe(1);
    expect(result.toolLoopCapsHit).toBeNull();
  });

  test("a code_execution ref with a tampered stdoutHash is rejected", async () => {
    const corpus = emptyCorpus();
    const code = "print(42)";

    const modelToolLoop: ModelToolLoop = async () => ({
      finalText: JSON.stringify({
        proposals: [
          {
            proposalId: "p-tampered-1",
            routeId: "B44",
            scopeKind: "route",
            category: "context",
            severity: "low",
            confidence: "low",
            claimText: "Tampered observation: cited code does not match its hash.",
            claimStrength: "observation",
            evidenceRefs: [
              {
                kind: "code_execution",
                language: "python",
                code,
                stdoutHash: "0".repeat(64), // deliberately wrong
              },
            ],
            counterEvidenceRefs: [],
            interventionRecordIds: [],
            documentCandidateIds: [],
            metricClaims: [],
            caveats: [],
            missingEvidence: [],
          },
        ],
      }),
      toolUseTrace: [],
      capsHit: null,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: 0 },
      retries: 0,
      iterations: 1,
    });

    const result = await runAgentPropose({
      corpus,
      routes: ["B44"],
      maxProposalsPerRoute: 1,
      runId: "run-codemode-tampered",
      model,
      modelComplete: async () => {
        throw new Error("non-codemode path should not be reached");
      },
      enableCodemode: true,
      modelToolLoop,
    });

    const proposal = result.proposals[0]!;
    expect(proposal.validationState).toBe("rejected");
    expect(
      proposal.validationErrors.some((e) =>
        e.includes("stdout hash mismatch"),
      ),
    ).toBe(true);
  });

  test("a code_execution ref with non-deterministic code is rejected before exec", async () => {
    const corpus = emptyCorpus();
    const code = "import time\nprint(time.time())";

    const modelToolLoop: ModelToolLoop = async () => ({
      finalText: JSON.stringify({
        proposals: [
          {
            proposalId: "p-nondeterm-1",
            routeId: "B44",
            scopeKind: "route",
            category: "context",
            severity: "low",
            confidence: "low",
            claimText: "Non-deterministic citation should be blocked at lint.",
            claimStrength: "observation",
            evidenceRefs: [
              {
                kind: "code_execution",
                language: "python",
                code,
                stdoutHash: "0".repeat(64),
              },
            ],
            counterEvidenceRefs: [],
            interventionRecordIds: [],
            documentCandidateIds: [],
            metricClaims: [],
            caveats: [],
            missingEvidence: [],
          },
        ],
      }),
      toolUseTrace: [],
      capsHit: null,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: 0 },
      retries: 0,
      iterations: 1,
    });

    const result = await runAgentPropose({
      corpus,
      routes: ["B44"],
      maxProposalsPerRoute: 1,
      runId: "run-codemode-nondeterm",
      model,
      modelComplete: async () => {
        throw new Error("non-codemode path should not be reached");
      },
      enableCodemode: true,
      modelToolLoop,
    });

    const proposal = result.proposals[0]!;
    expect(proposal.validationState).toBe("rejected");
    expect(
      proposal.validationErrors.some((e) =>
        e.includes("non-deterministic"),
      ),
    ).toBe(true);
  });
});

describe("runAgentPropose codemode (wiring)", () => {
  test("throws when enableCodemode is true but modelToolLoop is missing", async () => {
    const corpus = emptyCorpus();
    await expect(
      runAgentPropose({
        corpus,
        routes: ["B44"],
        maxProposalsPerRoute: 1,
        runId: "run-codemode-bad",
        model,
        modelComplete: async () => "{}",
        enableCodemode: true,
      }),
    ).rejects.toThrow(/modelToolLoop was not supplied/);
  });
});
