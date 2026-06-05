import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildTier2AgenticSelfHealPlan } from "../../../../src/commands/docs/tier2/_agentic-self-heal.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-agentic-self-heal");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

async function writeCompletedShard(input: {
  shardId: string;
  windowId: string;
  attemptStatus: string;
  httpStatus: number;
  blockerCount: number;
  issueCodes?: string[];
  submitState?: string;
  acceptedCount?: number;
  rejectedCount?: number;
  validationIssueCount?: number;
}) {
  const shardDir = join(workingRoot, input.shardId);
  const windowDir = join(shardDir, "window");
  await mkdir(windowDir, { recursive: true });
  const artifactPath = join(windowDir, "artifact.json");
  const auditPath = join(windowDir, "audit.json");
  await writeJson(artifactPath, {
    temperature: 1,
    summary: {
      draftCount: (input.acceptedCount ?? 0) + (input.rejectedCount ?? 0),
      acceptedCount: input.acceptedCount ?? 0,
      rejectedCount: input.rejectedCount ?? 0,
      validationIssueCount: input.validationIssueCount ?? 0,
      llmAttemptCount: 1,
    },
    submitResult: { state: input.submitState ?? "accepted" },
    llmAttempts: [
      {
        status: input.attemptStatus,
        httpStatus: input.httpStatus,
      },
    ],
  });
  await writeJson(auditPath, {
    blockerCount: input.blockerCount,
    issues: (input.issueCodes ?? []).map((code) => ({
      severity: "error",
      code,
      path: "fixture",
      message: code,
    })),
  });
  await writeJson(join(shardDir, "manifest.json"), {
    windows: [
      {
        windowId: input.windowId,
        artifactPath,
        auditPath,
        auditBlockerCount: input.blockerCount,
      },
    ],
  });
  return {
    shardId: input.shardId,
    outputDir: shardDir,
    windowIds: [input.windowId],
    sourceIds: [input.windowId.split(":")[0] ?? "fixture"],
  };
}

describe("Tier 2 agentic self-heal planner", () => {
  test("classifies clean, retryable, source-tool, and pending shards", async () => {
    const clean = await writeCompletedShard({
      shardId: "shard-0001",
      windowId: "source-a:1",
      attemptStatus: "accepted",
      httpStatus: 200,
      blockerCount: 0,
      acceptedCount: 2,
    });
    const provider = await writeCompletedShard({
      shardId: "shard-0002",
      windowId: "source-b:2",
      attemptStatus: "provider_failed",
      httpStatus: 503,
      blockerCount: 1,
      issueCodes: ["llm_provider_failed"],
    });
    const tool = await writeCompletedShard({
      shardId: "shard-0003",
      windowId: "source-c:3",
      attemptStatus: "tool_response_parse_failed",
      httpStatus: 200,
      blockerCount: 1,
      issueCodes: ["llm_no_parseable_tool_response"],
    });
    const validator = await writeCompletedShard({
      shardId: "shard-0004",
      windowId: "source-d:4",
      attemptStatus: "partial_accepted",
      httpStatus: 200,
      blockerCount: 1,
      issueCodes: ["artifact_has_validation_failures", "route_selection_field_path_not_canonical"],
      submitState: "partial_accepted",
      acceptedCount: 1,
      rejectedCount: 1,
      validationIssueCount: 1,
    });
    const sourceTool = await writeCompletedShard({
      shardId: "shard-0005",
      windowId: "source-e:5",
      attemptStatus: "partial_accepted",
      httpStatus: 200,
      blockerCount: 1,
      issueCodes: ["missing_data_requires_search_transcript"],
      submitState: "partial_accepted",
      validationIssueCount: 1,
    });
    const pendingDir = join(workingRoot, "shard-0006");
    await mkdir(join(pendingDir, ".claim"), { recursive: true });
    await writeJson(join(pendingDir, ".claim", "claim.json"), { workerId: "fixture" });
    const pending = {
      shardId: "shard-0006",
      outputDir: pendingDir,
      windowIds: ["source-f:6"],
      sourceIds: ["source-f"],
    };
    const queuePath = join(workingRoot, "queue.json");
    const outputPath = join(workingRoot, "self-heal-plan.json");
    await writeJson(queuePath, {
      runId: "fixture-run",
      outputRoot: workingRoot,
      workerCountPlanned: 10,
      provider: "pioneer",
      model: "fixture-model",
      maxTokens: 16000,
      temperature: 1,
      timeoutMs: 300000,
      maxAttempts: 1,
      maxRepairRounds: 1,
      shards: [clean, provider, tool, validator, sourceTool, pending],
    });

    const plan = await buildTier2AgenticSelfHealPlan({
      queuePath,
      outputPath,
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(plan.summary.completedShardCount).toBe(5);
    expect(plan.summary.laneCounts.clean).toBe(1);
    expect(plan.summary.laneCounts.provider_transient_retry).toBe(1);
    expect(plan.summary.laneCounts.tool_response_retry).toBe(1);
    expect(plan.summary.laneCounts.validator_feedback_retry).toBe(1);
    expect(plan.summary.laneCounts.source_tool_enrichment).toBe(1);
    expect(plan.summary.laneCounts.pending_or_in_progress).toBe(1);
    expect(plan.summary.retryEligibleCount).toBe(3);
    expect(plan.summary.sourceToolEnrichmentCount).toBe(1);
    expect(plan.nextRun.provider).toBe("pioneer");
    expect(plan.nextRun.temperature).toBe(1);
    expect(plan.nextRun.recommendedWorkerCount).toBe(8);
    expect(plan.retryWindowIdsByLane.provider_transient_retry).toEqual(["source-b:2"]);
    expect(plan.retryWindowIdsByLane.source_tool_enrichment).toEqual(["source-e:5"]);
    expect(await Bun.file(outputPath).exists()).toBe(true);
  });
});
