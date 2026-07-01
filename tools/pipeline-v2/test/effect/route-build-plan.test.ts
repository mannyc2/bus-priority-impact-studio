import { describe, expect, test } from "bun:test";
import type { RouteBuildPlanResult } from "@bp/pipeline-v2/local-db-aggregates";
import { Effect, Layer } from "effect";
import { RouteBuildPlanCommandError } from "../../src/effect/errors.ts";
import {
  RouteBuildPlanService,
  runRouteBuildPlanCommand,
} from "../../src/effect/route-build-plan.ts";
import { runPipelineEffect } from "../../src/effect/runtime.ts";

const fixtureResult: RouteBuildPlanResult = {
  isoMonth: "2026-03",
  routeCount: 2,
  selectedRouteCount: 1,
  alreadyBuiltRouteCount: 0,
  blockedRouteCount: 0,
  backlogRouteCount: 1,
  dbPath: "fixture.sqlite",
};

describe("route build-plan Effect workflow", () => {
  test("runs the workflow through an injectable service layer", async () => {
    const layer = Layer.succeed(RouteBuildPlanService, {
      buildPlan: () => Effect.succeed(fixtureResult),
    });

    const result = await runPipelineEffect(
      runRouteBuildPlanCommand({
        year: 2026,
        month: 3,
        limit: 20,
      }),
      layer,
    );

    expect(result).toEqual(fixtureResult);
  });

  test("preserves typed command errors at the runtime boundary", async () => {
    const layer = Layer.succeed(RouteBuildPlanService, {
      buildPlan: (input) =>
        Effect.fail(
          RouteBuildPlanCommandError.make({
            year: input.year,
            month: input.month,
            operation: "fixture",
            cause: new Error("boom"),
          }),
        ),
    });

    await expect(
      runPipelineEffect(
        runRouteBuildPlanCommand({
          year: 2026,
          month: 3,
          limit: 20,
        }),
        layer,
      ),
    ).rejects.toMatchObject({
      _tag: "RouteBuildPlanCommandError",
      operation: "fixture",
    });
  });
});
