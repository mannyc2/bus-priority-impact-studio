import { describe, expect, test } from "bun:test";

import type { AgentFindingProposalModelMeta } from "@bp/domain";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";

import { sha256Hex } from "../../../src/commands/findings/_code_execution.ts";
import type { LoadedCorpus } from "../../../src/commands/findings/_corpus.ts";
import { runAgentPropose } from "../../../src/commands/findings/_runner.ts";
import type { SubmitResultDetails } from "../../../src/commands/findings/_submit_tool.ts";
import type { ModelToolLoop } from "../../../src/lib/codemode/index.ts";
import { runPython } from "../../../src/lib/sandbox.ts";

// Helper for the codemode tests: invoke the submit_finding_proposals tool
// that runAgentPropose adds to extraTools, capture its response, and return
// a minimal ToolLoopResult that ends the loop. Each test asserts on the
// captured submit-tool details.
async function invokeSubmit(
  extraTools: NonNullable<Parameters<ModelToolLoop>[0]["extraTools"]>,
  proposals: unknown[],
): Promise<{ details: SubmitResultDetails | undefined; result: AgentToolResult<unknown> }> {
  const submitTool = extraTools.find((t) => t.name === "submit_finding_proposals");
  if (!submitTool) throw new Error("submit_finding_proposals tool not in extraTools");
  const result = (await submitTool.execute(
    "tc-submit-1",
    { proposals },
  )) as AgentToolResult<unknown>;
  return {
    details: result.details as SubmitResultDetails | undefined,
    result,
  };
}

function emptyLoopResult() {
  return {
    finalText: "",
    toolUseTrace: [],
    capsHit: null,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: 0 },
    retries: 0,
    iterations: 1,
  };
}

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
  test("a valid code_execution submission is accepted end-to-end", async () => {
    const corpus = emptyCorpus();
    const code = "print(42)";
    const stdoutHash = await captureHash(code);

    const seenSystemPrompts: string[] = [];
    let captured: SubmitResultDetails | undefined;
    const modelToolLoop: ModelToolLoop = async ({ systemPrompt, extraTools }) => {
      seenSystemPrompts.push(systemPrompt);
      const { details } = await invokeSubmit(extraTools ?? [], [
        {
          routeId: "B44",
          scopeKind: "route",
          category: "context",
          severity: "low",
          confidence: "low",
          claimText:
            "Observation: a sandbox computation reports value 42 for this route's reference probe.",
          claimStrength: "observation",
          evidenceRefs: [
            { kind: "code_execution", language: "python", code, stdoutHash },
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
              },
            },
          ],
          caveats: [],
          missingEvidence: [],
        },
      ]);
      captured = details;
      return emptyLoopResult();
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

    expect(captured?.outcome).toBe("accepted");
    expect(captured?.terminateLoop).toBe(true);
    expect(result.proposals.length).toBe(1);
    const proposal = result.proposals[0]!;
    expect(proposal.validationState).toBe("valid");
  });

  test("a code_execution ref with a tampered stdoutHash is rejected by the submit tool", async () => {
    const corpus = emptyCorpus();
    const code = "print(42)";

    let captured: SubmitResultDetails | undefined;
    const modelToolLoop: ModelToolLoop = async ({ extraTools }) => {
      const { details } = await invokeSubmit(extraTools ?? [], [
        {
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
      ]);
      captured = details;
      return emptyLoopResult();
    };

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

    expect(captured?.outcome).toBe("rejected");
    expect(captured?.terminateLoop).toBe(false);
    expect(captured?.errorsByIndex[0]?.errors.some((e) => e.includes("stdout hash mismatch"))).toBe(true);
    // Rejected proposals are not committed to the artifact under the new flow.
    expect(result.proposals.length).toBe(0);
  });

  test("non-deterministic code is rejected by the submit tool before sandbox exec", async () => {
    const corpus = emptyCorpus();
    const code = "import time\nprint(time.time())";

    let captured: SubmitResultDetails | undefined;
    const modelToolLoop: ModelToolLoop = async ({ extraTools }) => {
      const { details } = await invokeSubmit(extraTools ?? [], [
        {
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
      ]);
      captured = details;
      return emptyLoopResult();
    };

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

    expect(captured?.outcome).toBe("rejected");
    expect(captured?.errorsByIndex[0]?.errors.some((e) => e.includes("non-deterministic"))).toBe(true);
    expect(result.proposals.length).toBe(0);
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

  test("throws when the model never calls submit_finding_proposals", async () => {
    const corpus = emptyCorpus();
    const modelToolLoop: ModelToolLoop = async () => emptyLoopResult();
    await expect(
      runAgentPropose({
        corpus,
        routes: ["B44"],
        maxProposalsPerRoute: 1,
        runId: "run-codemode-nosubmit",
        model,
        modelComplete: async () => {
          throw new Error("non-codemode path should not be reached");
        },
        enableCodemode: true,
        modelToolLoop,
      }),
    ).rejects.toThrow(/codemode loop ended without a submit_finding_proposals call/);
  });
});
