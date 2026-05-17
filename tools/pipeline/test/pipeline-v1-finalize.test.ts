import { describe, expect, test } from "bun:test";
import { finalizePipelineV1 } from "../src/jobs/build/pipeline-v1-finalize.js";

function passingCheck() {
  return {
    isoMonth: "2026-08",
    status: "pass",
    issueCount: 0,
    issues: [],
    counts: {},
    audit: { status: "pass" },
    d1: { status: "pass" },
  };
}

describe("pipeline v1 finalization", () => {
  test("runs the v1 finish chain with observed GTFS-RT samples", async () => {
    const calls: string[] = [];
    const backfillRemaining = [3, 0];
    const deps = {
      ingestRouteTrends: async (args: { includeRidership?: boolean }) => {
        calls.push(`trends:${String(args.includeRidership)}`);
        return { startMonth: "2025-01", endMonth: "2026-08", rowCount: 10 };
      },
      backfillRouteRidershipTrends: async (args: { limit?: number; concurrency?: number }) => {
        calls.push(`ridership:${args.limit}:${args.concurrency}`);
        return {
          startMonth: "2025-01",
          endMonth: "2026-08",
          attemptedChunkCount: 2,
          updatedRowCount: 2,
          remainingRidershipMissingCount: backfillRemaining.shift() ?? 0,
        };
      },
      buildObservedHeadways: async (args: { runId?: string }) => {
        calls.push(`observed-headways:${args.runId}`);
        return { runId: args.runId, stopEventCount: 4, headwaySampleCount: 2 };
      },
      buildRouteObservedReliability: async (args: { runId?: string }) => {
        calls.push(`observed-reliability:${args.runId}`);
        return { isoMonth: "2026-08", runId: args.runId, observedRouteCount: 1 };
      },
      buildRouteInterventionEvaluation: async () => {
        calls.push("interventions");
        return { isoMonth: "2026-08", comparisonCount: 1 };
      },
      buildCorridorModel: async () => {
        calls.push("corridors");
        return { isoMonth: "2026-08", corridorCount: 1 };
      },
      buildBriefArtifacts: async () => {
        calls.push("briefs");
        return { isoMonth: "2026-08", routeArtifactCount: 3, corridorArtifactCount: 3 };
      },
      buildRouteBatchAudit: async () => {
        calls.push("audit");
        return { isoMonth: "2026-08", status: "pass" };
      },
      verifyD1Export: async () => {
        calls.push("verify:d1");
        return { isoMonth: "2026-08", status: "pass" };
      },
      checkPipelineV1: async (args: {
        allowInsufficientGtfsRt?: boolean;
        minObservedRouteCount?: number;
        minObservedRouteShare?: number;
      }) => {
        calls.push(
          `check:${String(args.allowInsufficientGtfsRt)}:${String(args.minObservedRouteCount)}:${String(args.minObservedRouteShare)}`,
        );
        return passingCheck();
      },
    };

    const result = await finalizePipelineV1(
      {
        year: 2026,
        month: 8,
        dbPath: "/tmp/pipeline.sqlite",
        runId: "fixture-gtfs-rt",
        ridershipBackfillLimit: 2,
        ridershipBackfillConcurrency: 3,
        minObservedRouteCount: 300,
        minObservedRouteShare: 0.9,
      },
      deps as never,
    );

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth: "2026-08",
        gtfsRtRunId: "fixture-gtfs-rt",
        strictGtfsRt: true,
      }),
    );
    expect(result.ridershipBackfills).toHaveLength(2);
    expect(calls).toEqual([
      "trends:false",
      "ridership:2:3",
      "ridership:2:3",
      "observed-headways:fixture-gtfs-rt",
      "observed-reliability:fixture-gtfs-rt",
      "interventions",
      "corridors",
      "briefs",
      "audit",
      "verify:d1",
      "check:undefined:300:0.9",
    ]);
  });

  test("requires a GTFS-RT run id unless structural mode is explicit", async () => {
    await expect(
      finalizePipelineV1(
        {
          year: 2026,
          month: 8,
          dbPath: "/tmp/pipeline.sqlite",
        },
        {} as never,
      ),
    ).rejects.toThrow("Missing required argument: --run-id");
  });

  test("can run structural mode with explicit insufficient GTFS-RT allowance", async () => {
    const calls: string[] = [];
    const deps = {
      ingestRouteTrends: async () => {
        calls.push("trends");
        return {};
      },
      backfillRouteRidershipTrends: async () => {
        calls.push("ridership");
        return {};
      },
      buildObservedHeadways: async () => {
        calls.push("observed-headways");
        return {};
      },
      buildRouteObservedReliability: async (args: { runId?: string }) => {
        calls.push(`observed-reliability:${args.runId}`);
        return {};
      },
      buildRouteInterventionEvaluation: async () => {
        calls.push("interventions");
        return {};
      },
      buildCorridorModel: async () => {
        calls.push("corridors");
        return {};
      },
      buildBriefArtifacts: async () => {
        calls.push("briefs");
        return {};
      },
      buildRouteBatchAudit: async () => {
        calls.push("audit");
        return {};
      },
      verifyD1Export: async () => {
        calls.push("verify:d1");
        return {};
      },
      checkPipelineV1: async (args: { allowInsufficientGtfsRt?: boolean }) => {
        calls.push(`check:${String(args.allowInsufficientGtfsRt)}`);
        return passingCheck();
      },
    };

    const result = await finalizePipelineV1(
      {
        year: 2026,
        month: 8,
        dbPath: "/tmp/pipeline.sqlite",
        refreshTrends: false,
        backfillRidership: false,
        allowInsufficientGtfsRt: true,
      },
      deps as never,
    );

    expect(result).toEqual(
      expect.objectContaining({
        gtfsRtRunId: "insufficient-gtfs-rt-2026-08",
        strictGtfsRt: false,
        trendRefresh: null,
        ridershipBackfills: [],
        observedHeadways: null,
      }),
    );
    expect(calls).toEqual([
      "observed-reliability:insufficient-gtfs-rt-2026-08",
      "interventions",
      "corridors",
      "briefs",
      "audit",
      "verify:d1",
      "check:true",
    ]);
  });
});
