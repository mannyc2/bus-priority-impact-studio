import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { RouteLocalDbCommandError } from "../../src/effect/errors.ts";
import {
  type RouteBriefModelResult,
  RouteBriefModelService,
  runRouteBriefModelCommand,
} from "../../src/effect/route-brief-model.ts";
import { runPipelineEffect } from "../../src/effect/runtime.ts";

const routeBriefModelResult: RouteBriefModelResult = {
  isoMonth: "2026-03",
  routeCount: 2,
  routesWithObservedSpeedCount: 2,
  scorecardRowCount: 2,
  briefSummaryRowCount: 2,
  comparisonRankRowCount: 2,
  routeSliceArtifactCount: 2,
  issueCount: 0,
  dbPath: "fixture.sqlite",
};

describe("route brief-model Effect workflow", () => {
  test("runs the workflow through an injectable service layer", async () => {
    const layer = Layer.succeed(RouteBriefModelService, {
      buildBriefModel: () => Effect.succeed(routeBriefModelResult),
    });

    await expect(
      runPipelineEffect(
        runRouteBriefModelCommand({
          year: 2026,
          month: 3,
          routes: ["M1"],
        }),
        layer,
      ),
    ).resolves.toEqual(routeBriefModelResult);
  });

  test("preserves typed route brief model command errors at the runtime boundary", async () => {
    const layer = Layer.succeed(RouteBriefModelService, {
      buildBriefModel: (input) =>
        Effect.fail(
          RouteLocalDbCommandError.make({
            command: "route.brief-model",
            year: input.year,
            month: input.month,
            operation: "fixture",
            cause: new Error("boom"),
          }),
        ),
    });

    await expect(
      runPipelineEffect(
        runRouteBriefModelCommand({
          year: 2026,
          month: 3,
          routes: ["M1"],
        }),
        layer,
      ),
    ).rejects.toMatchObject({
      _tag: "RouteLocalDbCommandError",
      command: "route.brief-model",
      operation: "fixture",
    });
  });
});
