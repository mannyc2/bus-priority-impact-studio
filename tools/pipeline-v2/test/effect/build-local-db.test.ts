import { describe, expect, test } from "bun:test";
import type {
  BuildContextEventsResult,
  BuildLionGeometryIndexResult,
  BuildObservedHeadwaysResult,
  BuildRouteLionLinkResult,
} from "@bp/pipeline-v2/local-db-aggregates";
import { Effect, Layer } from "effect";
import { BuildLocalDbCommandError } from "../../src/effect/errors.ts";
import {
  BuildLocalDbService,
  runBuildContextEventsCommand,
  runBuildLionGeometryIndexCommand,
  runBuildObservedHeadwaysCommand,
  runBuildRouteLionLinkCommand,
} from "../../src/effect/build-local-db.ts";
import { runPipelineEffect } from "../../src/effect/runtime.ts";

const contextEventsResult: BuildContextEventsResult = {
  inserted311: 1,
  insertedCollisions: 2,
  insertedParking: 3,
  insertedPermits: 4,
  insertedTrafficVolumes: 5,
  insertedTrafficSpeeds: 6,
  insertedAceViolations: 7,
  total: 28,
};

const observedHeadwaysResult: BuildObservedHeadwaysResult = {
  runId: "fixture-run",
  vehiclePositionCount: 30,
  stopEventCount: 20,
  headwaySampleCount: 10,
};

const routeLionLinkResult: BuildRouteLionLinkResult = {
  routesProcessed: 2,
  totalLinks: 8,
  bufferMeters: 25,
};

const lionGeometryIndexResult: BuildLionGeometryIndexResult = {
  inserted: 10,
  skipped: 0,
  total: 10,
};

const successLayer = Layer.succeed(BuildLocalDbService, {
  buildContextEvents: () => Effect.succeed(contextEventsResult),
  buildObservedHeadways: () => Effect.succeed(observedHeadwaysResult),
  buildRouteLionLink: () => Effect.succeed(routeLionLinkResult),
  buildLionGeometryIndex: () => Effect.succeed(lionGeometryIndexResult),
});

describe("build local DB Effect workflows", () => {
  test("run related build workflows through one injectable service layer", async () => {
    await expect(runPipelineEffect(runBuildContextEventsCommand(), successLayer)).resolves.toEqual(
      contextEventsResult,
    );

    await expect(
      runPipelineEffect(
        runBuildObservedHeadwaysCommand({
          runId: "fixture-run",
        }),
        successLayer,
      ),
    ).resolves.toEqual(observedHeadwaysResult);

    await expect(
      runPipelineEffect(
        runBuildRouteLionLinkCommand({
          bufferMeters: 25,
          routeIds: ["M1", "M2"],
        }),
        successLayer,
      ),
    ).resolves.toEqual(routeLionLinkResult);

    await expect(
      runPipelineEffect(
        runBuildLionGeometryIndexCommand({
          limit: 10,
        }),
        successLayer,
      ),
    ).resolves.toEqual(lionGeometryIndexResult);
  });

  test("preserves typed build local DB command errors at the runtime boundary", async () => {
    const errorLayer = Layer.succeed(BuildLocalDbService, {
      buildContextEvents: () => Effect.succeed(contextEventsResult),
      buildObservedHeadways: () => Effect.succeed(observedHeadwaysResult),
      buildRouteLionLink: () =>
        Effect.fail(
          BuildLocalDbCommandError.make({
            command: "build.route-lion-link",
            operation: "fixture",
            cause: new Error("boom"),
          }),
        ),
      buildLionGeometryIndex: () => Effect.succeed(lionGeometryIndexResult),
    });

    await expect(
      runPipelineEffect(
        runBuildRouteLionLinkCommand({
          bufferMeters: 25,
        }),
        errorLayer,
      ),
    ).rejects.toMatchObject({
      _tag: "BuildLocalDbCommandError",
      command: "build.route-lion-link",
      operation: "fixture",
    });
  });
});
