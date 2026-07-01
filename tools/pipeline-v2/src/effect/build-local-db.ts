import {
  type BuildContextEventsResult,
  type BuildLionGeometryIndexResult,
  type BuildObservedHeadwaysResult,
  type BuildRouteLionLinkResult,
  runBuildContextEvents,
  runBuildLionGeometryIndex,
  runBuildObservedHeadways,
  runBuildRouteLionLink,
} from "@bp/pipeline-v2/local-db-aggregates";
import { Context, Effect, Layer } from "effect";
import type { OpenLocalDbOptions } from "../lib/local-db.ts";
import { BuildLocalDbCommandError, type LocalDbOpenError } from "./errors.ts";
import { LocalDbConnection, makeLocalDbLayer } from "./local-db.ts";

export type BuildObservedHeadwaysCommandInput = {
  readonly runId: string;
};

export type BuildRouteLionLinkCommandInput = {
  readonly bufferMeters: number;
  readonly routeIds?: readonly string[] | undefined;
};

export type BuildLionGeometryIndexCommandInput = {
  readonly limit?: number | undefined;
};

export class BuildLocalDbService extends Context.Service<
  BuildLocalDbService,
  {
    readonly buildContextEvents: () => Effect.Effect<
      BuildContextEventsResult,
      BuildLocalDbCommandError
    >;
    readonly buildObservedHeadways: (
      input: BuildObservedHeadwaysCommandInput,
    ) => Effect.Effect<BuildObservedHeadwaysResult, BuildLocalDbCommandError>;
    readonly buildRouteLionLink: (
      input: BuildRouteLionLinkCommandInput,
    ) => Effect.Effect<BuildRouteLionLinkResult, BuildLocalDbCommandError>;
    readonly buildLionGeometryIndex: (
      input: BuildLionGeometryIndexCommandInput,
    ) => Effect.Effect<BuildLionGeometryIndexResult, BuildLocalDbCommandError>;
  }
>()("@bp/pipeline-v2/BuildLocalDbService") {}

export const BuildLocalDbServiceLayer: Layer.Layer<BuildLocalDbService, never, LocalDbConnection> =
  Layer.effect(
    BuildLocalDbService,
    Effect.gen(function* () {
      const local = yield* LocalDbConnection;

      return {
        buildContextEvents: Effect.fn("BuildLocalDbService.buildContextEvents")(function* () {
          yield* Effect.annotateCurrentSpan({
            command: "build.context-events",
            dbPath: local.path,
          });

          return yield* Effect.tryPromise({
            try: () => runBuildContextEvents({ local }),
            catch: (cause) =>
              BuildLocalDbCommandError.make({
                command: "build.context-events",
                operation: "runBuildContextEvents",
                cause,
              }),
          });
        }),
        buildObservedHeadways: Effect.fn("BuildLocalDbService.buildObservedHeadways")(function* (
          input: BuildObservedHeadwaysCommandInput,
        ) {
          yield* Effect.annotateCurrentSpan({
            command: "build.observed-headways",
            runId: input.runId,
            dbPath: local.path,
          });

          return yield* Effect.tryPromise({
            try: () =>
              runBuildObservedHeadways({
                local,
                runId: input.runId,
              }),
            catch: (cause) =>
              BuildLocalDbCommandError.make({
                command: "build.observed-headways",
                operation: "runBuildObservedHeadways",
                cause,
              }),
          });
        }),
        buildRouteLionLink: Effect.fn("BuildLocalDbService.buildRouteLionLink")(function* (
          input: BuildRouteLionLinkCommandInput,
        ) {
          yield* Effect.annotateCurrentSpan({
            command: "build.route-lion-link",
            bufferMeters: input.bufferMeters,
            routeCount: input.routeIds?.length ?? 0,
            dbPath: local.path,
          });

          return yield* Effect.try({
            try: () =>
              runBuildRouteLionLink({
                local,
                bufferMeters: input.bufferMeters,
                routeIds: input.routeIds,
              }),
            catch: (cause) =>
              BuildLocalDbCommandError.make({
                command: "build.route-lion-link",
                operation: "runBuildRouteLionLink",
                cause,
              }),
          });
        }),
        buildLionGeometryIndex: Effect.fn("BuildLocalDbService.buildLionGeometryIndex")(function* (
          input: BuildLionGeometryIndexCommandInput,
        ) {
          yield* Effect.annotateCurrentSpan({
            command: "build.lion-geometry-index",
            limit: input.limit ?? null,
            dbPath: local.path,
          });

          return yield* Effect.try({
            try: () =>
              runBuildLionGeometryIndex({
                local,
                limit: input.limit,
              }),
            catch: (cause) =>
              BuildLocalDbCommandError.make({
                command: "build.lion-geometry-index",
                operation: "runBuildLionGeometryIndex",
                cause,
              }),
          });
        }),
      };
    }),
  );

export const runBuildContextEventsCommand = Effect.fn("runBuildContextEventsCommand")(function* () {
  const service = yield* BuildLocalDbService;
  const result = yield* service.buildContextEvents();

  yield* Effect.logInfo(`context events complete: ${result.total} rows inserted`);

  return result;
});

export const runBuildObservedHeadwaysCommand = Effect.fn("runBuildObservedHeadwaysCommand")(
  function* (input: BuildObservedHeadwaysCommandInput) {
    const service = yield* BuildLocalDbService;
    const result = yield* service.buildObservedHeadways(input);

    yield* Effect.logInfo(
      `observed headways complete: ${result.headwaySampleCount} samples from ${result.vehiclePositionCount} vehicle positions`,
    );

    return result;
  },
);

export const runBuildRouteLionLinkCommand = Effect.fn("runBuildRouteLionLinkCommand")(function* (
  input: BuildRouteLionLinkCommandInput,
) {
  const service = yield* BuildLocalDbService;
  const result = yield* service.buildRouteLionLink(input);

  yield* Effect.logInfo(
    `route LION link complete: ${result.totalLinks} links across ${result.routesProcessed} routes`,
  );

  return result;
});

export const runBuildLionGeometryIndexCommand = Effect.fn("runBuildLionGeometryIndexCommand")(
  function* (input: BuildLionGeometryIndexCommandInput) {
    const service = yield* BuildLocalDbService;
    const result = yield* service.buildLionGeometryIndex(input);

    yield* Effect.logInfo(
      `LION geometry index complete: ${result.inserted} inserted, ${result.skipped} skipped`,
    );

    return result;
  },
);

export function makeBuildLocalDbCommandLayer(input: {
  readonly dbPath?: string | undefined;
  readonly localDbOptions?: OpenLocalDbOptions | undefined;
}): Layer.Layer<BuildLocalDbService, LocalDbOpenError> {
  return BuildLocalDbServiceLayer.pipe(
    Layer.provide(
      makeLocalDbLayer({
        path: input.dbPath,
        options: input.localDbOptions,
      }),
    ),
  );
}
