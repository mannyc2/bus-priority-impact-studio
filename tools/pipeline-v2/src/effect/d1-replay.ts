import { Database } from "bun:sqlite";
import type { D1ServingDb } from "@bp/db/d1";
import { createBunSqliteServingDb } from "@bp/db/d1/bun-sqlite";
import { Context, Effect, Layer } from "effect";
import { D1ReplayCommandError } from "./errors.ts";
import { runPipelineEffect } from "./runtime.ts";

export type D1ReplaySpanAttributes = Record<string, string | number | boolean | null>;

export type D1ReplayDatabase = {
  readonly database: Database;
  readonly db: D1ServingDb;
};

export type D1ReplayTaskInput<A> = {
  readonly command: string;
  readonly operation: string;
  readonly schemaSql: string;
  readonly seedSql: string;
  readonly spanAttributes?: D1ReplaySpanAttributes | undefined;
  readonly run: (loaded: D1ReplayDatabase) => A | Promise<A>;
};

export class D1ReplayService extends Context.Service<
  D1ReplayService,
  {
    readonly run: <A>(input: D1ReplayTaskInput<A>) => Effect.Effect<A, D1ReplayCommandError>;
  }
>()("@bp/pipeline-v2/D1ReplayService") {}

function makeD1ReplayError(input: {
  readonly command: string;
  readonly operation: string;
  readonly cause: unknown;
}): D1ReplayCommandError {
  return D1ReplayCommandError.make({
    command: input.command,
    operation: input.operation,
    cause: input.cause,
  });
}

function openD1ReplayDatabase<A>(
  input: D1ReplayTaskInput<A>,
): Effect.Effect<D1ReplayDatabase, D1ReplayCommandError> {
  return Effect.try({
    try: () => {
      const database = new Database(":memory:");
      try {
        database.exec(input.schemaSql);
        database.exec(input.seedSql);
        return { database, db: createBunSqliteServingDb(database) };
      } catch (cause) {
        database.close();
        throw cause;
      }
    },
    catch: (cause) =>
      makeD1ReplayError({
        command: input.command,
        operation: input.operation,
        cause,
      }),
  });
}

export const D1ReplayServiceLayer: Layer.Layer<D1ReplayService> = Layer.succeed(D1ReplayService, {
  run: Effect.fn("D1ReplayService.run")(function* <A>(input: D1ReplayTaskInput<A>) {
    yield* Effect.annotateCurrentSpan({
      command: input.command,
      operation: input.operation,
      ...(input.spanAttributes ?? {}),
    });

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const loaded = yield* Effect.acquireRelease(openD1ReplayDatabase(input), (database) =>
          Effect.sync(() => database.database.close()),
        );

        return yield* Effect.tryPromise({
          try: () => Promise.resolve(input.run(loaded)),
          catch: (cause) =>
            makeD1ReplayError({
              command: input.command,
              operation: input.operation,
              cause,
            }),
        });
      }),
    );
  }),
});

export const runD1Replay = Effect.fn("runD1Replay")(function* <A>(input: D1ReplayTaskInput<A>) {
  const service = yield* D1ReplayService;
  const result = yield* service.run(input);

  yield* Effect.logInfo(`${input.command} D1 replay complete`);

  return result;
});

export function runD1ReplayBoundary<A>(input: D1ReplayTaskInput<A>): Promise<A> {
  return runPipelineEffect(runD1Replay(input), D1ReplayServiceLayer);
}
