import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildTier2AgenticCanonicalMerge } from "../../../../src/commands/docs/tier2/_agentic-canonical-merge.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-agentic-canonical-merge");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

async function writeArtifact(input: {
  name: string;
  sourceId: string;
  page: number;
  surfaceKinds: string[];
}) {
  const path = join(workingRoot, `${input.name}.json`);
  await writeJson(path, {
    source: {
      sourceId: input.sourceId,
      pageNumbers: [input.page],
    },
    submitResult: {
      accepted: input.surfaceKinds.map((surfaceKind, index) => ({
        surface: {
          surfaceId: `${input.name}-${index}`,
          surfaceKind,
        },
      })),
    },
  });
  return path;
}

function item(input: {
  shardId: string;
  windowId: string;
  lane: string;
  artifactPath: string | null;
  acceptedCount?: number;
  rejectedCount?: number;
  validationIssueCount?: number;
}) {
  return {
    shardId: input.shardId,
    windowIds: [input.windowId],
    sourceIds: [input.windowId.split(":")[0] ?? "source"],
    primaryLane: input.lane,
    decision: input.lane === "clean" ? "no_action" : "retry",
    reasons: input.lane === "clean" ? [] : [input.lane],
    manifestPath: join(workingRoot, `${input.shardId}-manifest.json`),
    artifactPath: input.artifactPath,
    auditPath: input.artifactPath?.replace(/\.json$/, "-audit.json") ?? null,
    lastAttemptStatus: input.lane === "provider_transient_retry" ? "provider_failed" : "accepted",
    lastHttpStatus: input.lane === "provider_transient_retry" ? 504 : 200,
    submitState: input.lane === "clean" ? "accepted" : "partial_accepted",
    auditBlockerCount: input.lane === "clean" ? 0 : 1,
    validationIssueCount: input.validationIssueCount ?? 0,
    rejectedCount: input.rejectedCount ?? 0,
    acceptedCount: input.acceptedCount ?? 0,
    draftCount: (input.acceptedCount ?? 0) + (input.rejectedCount ?? 0),
    issueCodes: input.lane === "provider_transient_retry" ? ["llm_provider_failed"] : [],
  };
}

async function writeSelfHealPlan(input: {
  name: string;
  runId: string;
  items: ReturnType<typeof item>[];
}) {
  const path = join(workingRoot, `${input.name}.json`);
  await writeJson(path, {
    artifactKind: "bp.tier2_agentic_self_heal_plan.v1",
    sourceRunId: input.runId,
    sourceQueuePath: join(workingRoot, `${input.name}-queue.json`),
    sourceOutputRoot: workingRoot,
    summary: {
      shardCount: input.items.length,
      cleanCount: input.items.filter((planItem) => planItem.primaryLane === "clean").length,
      acceptedSurfaceCount: input.items.reduce((sum, planItem) => sum + planItem.acceptedCount, 0),
      retryEligibleCount: input.items.filter((planItem) => planItem.primaryLane !== "clean").length,
      quarantineCount: 0,
    },
    items: input.items,
  });
  return path;
}

describe("Tier 2 agentic canonical merge", () => {
  test("selects latest clean candidate without letting failed retries displace clean base rows", async () => {
    const baseA = await writeArtifact({
      name: "base-a",
      sourceId: "source-a",
      page: 1,
      surfaceKinds: ["claim"],
    });
    const baseC = await writeArtifact({
      name: "base-c",
      sourceId: "source-c",
      page: 3,
      surfaceKinds: ["context_signal"],
    });
    const retryB = await writeArtifact({
      name: "retry-b",
      sourceId: "source-b",
      page: 2,
      surfaceKinds: ["metric_observation", "claim"],
    });

    const basePlan = await writeSelfHealPlan({
      name: "base-plan",
      runId: "qv8",
      items: [
        item({ shardId: "base-a", windowId: "source-a:1", lane: "clean", artifactPath: baseA, acceptedCount: 1 }),
        item({ shardId: "base-b", windowId: "source-b:2", lane: "provider_transient_retry", artifactPath: null }),
        item({ shardId: "base-c", windowId: "source-c:3", lane: "clean", artifactPath: baseC, acceptedCount: 1 }),
      ],
    });
    const retryPlan = await writeSelfHealPlan({
      name: "retry-plan",
      runId: "qv9",
      items: [
        item({ shardId: "retry-b", windowId: "source-b:2", lane: "clean", artifactPath: retryB, acceptedCount: 2 }),
        item({ shardId: "retry-c", windowId: "source-c:3", lane: "provider_transient_retry", artifactPath: null }),
      ],
    });

    const outputPath = join(workingRoot, "merge.json");
    const merge = await buildTier2AgenticCanonicalMerge({
      selfHealPlanPaths: [basePlan, retryPlan],
      outputPath,
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(merge.summary.uniqueWindowCount).toBe(3);
    expect(merge.summary.canonicalWindowCount).toBe(3);
    expect(merge.summary.unresolvedWindowCount).toBe(0);
    expect(merge.summary.canonicalAcceptedSurfaceCount).toBe(4);
    expect(merge.summary.canonicalRunCounts).toEqual({ qv8: 2, qv9: 1 });
    expect(merge.summary.canonicalSurfaceKindCounts).toEqual({
      claim: 2,
      context_signal: 1,
      metric_observation: 1,
    });
    expect(merge.canonicalArtifacts.find((artifact) => artifact.windowId === "source-b:2")?.runId).toBe("qv9");
    expect(merge.canonicalArtifacts.find((artifact) => artifact.windowId === "source-c:3")?.runId).toBe("qv8");
    expect(await Bun.file(outputPath).exists()).toBe(true);
  });
});
