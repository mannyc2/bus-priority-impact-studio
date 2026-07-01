import { Context, Effect, Layer } from "effect";
import type { OpenLocalDbOptions, OpenLocalPipelineDb } from "../lib/local-db.ts";
import { LocalDbOpenError, PipelineLocalDbCommandError } from "./errors.ts";
import { LocalDbConnection, makeLocalDbLayer } from "./local-db.ts";
import { runPipelineEffect } from "./runtime.ts";

export type LocalDbCommandSpanAttributes = Record<string, string | number | boolean | null>;

export type LocalDbCommandTaskInput<A> = {
  readonly command: string;
  readonly operation: string;
  readonly spanAttributes?: LocalDbCommandSpanAttributes | undefined;
  readonly run: (local: OpenLocalPipelineDb) => Promise<A>;
};

export class LocalDbCommandService extends Context.Service<
  LocalDbCommandService,
  {
    readonly run: <A>(
      input: LocalDbCommandTaskInput<A>,
    ) => Effect.Effect<A, PipelineLocalDbCommandError>;
  }
>()("@bp/pipeline-v2/LocalDbCommandService") {}

export const LocalDbCommandServiceLayer: Layer.Layer<
  LocalDbCommandService,
  never,
  LocalDbConnection
> = Layer.effect(
  LocalDbCommandService,
  Effect.gen(function* () {
    const local = yield* LocalDbConnection;
    const run = Effect.fn("LocalDbCommandService.run")(function* <A>(
      input: LocalDbCommandTaskInput<A>,
    ) {
      yield* Effect.annotateCurrentSpan({
        command: input.command,
        operation: input.operation,
        dbPath: local.path,
        ...(input.spanAttributes ?? {}),
      });

      return yield* Effect.tryPromise({
        try: () => input.run(local),
        catch: (cause) =>
          PipelineLocalDbCommandError.make({
            command: input.command,
            operation: input.operation,
            cause,
          }),
      });
    });

    return { run };
  }),
);

export const runLocalDbCommand = Effect.fn("runLocalDbCommand")(function* <A>(
  input: LocalDbCommandTaskInput<A>,
) {
  const service = yield* LocalDbCommandService;
  const result = yield* service.run(input);

  yield* Effect.logInfo(`${input.command} complete`);

  return result;
});

export function makeLocalDbCommandLayer(input: {
  readonly dbPath?: string | undefined;
  readonly localDbOptions?: OpenLocalDbOptions | undefined;
}): Layer.Layer<LocalDbCommandService, LocalDbOpenError> {
  return LocalDbCommandServiceLayer.pipe(
    Layer.provide(
      makeLocalDbLayer({
        path: input.dbPath,
        options: input.localDbOptions,
      }),
    ),
  );
}

export function runLocalDbCommandBoundary<A>(
  input: LocalDbCommandTaskInput<A> & {
    readonly dbPath?: string | undefined;
    readonly localDbOptions?: OpenLocalDbOptions | undefined;
  },
): Promise<A> {
  return runPipelineEffect(
    runLocalDbCommand({
      command: input.command,
      operation: input.operation,
      spanAttributes: input.spanAttributes,
      run: input.run,
    }),
    makeLocalDbCommandLayer({
      dbPath: input.dbPath,
      localDbOptions: input.localDbOptions,
    }),
  );
}
