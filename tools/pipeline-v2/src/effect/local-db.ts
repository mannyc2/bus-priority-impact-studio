import type { OpenLocalDbOptions, OpenLocalPipelineDb } from "../lib/local-db.ts";
import { defaultLocalPipelineDbPath, openLocalPipelineDb } from "../lib/local-db.ts";
import { Context, Effect, Layer } from "effect";
import { LocalDbOpenError } from "./errors.ts";

export type LocalDbConfigShape = {
  readonly path: string | undefined;
  readonly options: OpenLocalDbOptions;
};

export class LocalDbConfig extends Context.Service<LocalDbConfig, LocalDbConfigShape>()(
  "@bp/pipeline-v2/LocalDbConfig",
) {}

export class LocalDbConnection extends Context.Service<LocalDbConnection, OpenLocalPipelineDb>()(
  "@bp/pipeline-v2/LocalDbConnection",
) {}

export function makeLocalDbConfigLayer(input: {
  readonly path?: string | undefined;
  readonly options?: OpenLocalDbOptions | undefined;
}): Layer.Layer<LocalDbConfig> {
  return Layer.succeed(LocalDbConfig, {
    path: input.path,
    options: input.options ?? {},
  });
}

export const LocalDbConnectionLayer: Layer.Layer<
  LocalDbConnection,
  LocalDbOpenError,
  LocalDbConfig
> = Layer.effect(
  LocalDbConnection,
  Effect.gen(function* () {
    const config = yield* LocalDbConfig;
    const resolvedPath = config.path ?? defaultLocalPipelineDbPath();

    return yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => openLocalPipelineDb(config.path, config.options),
        catch: (cause) =>
          LocalDbOpenError.make({
            path: resolvedPath,
            operation: "openLocalPipelineDb",
            cause,
          }),
      }),
      (local) => Effect.sync(() => local.sqlite.close()),
    );
  }),
);

export function makeLocalDbLayer(input: {
  readonly path?: string | undefined;
  readonly options?: OpenLocalDbOptions | undefined;
}): Layer.Layer<LocalDbConnection, LocalDbOpenError> {
  return LocalDbConnectionLayer.pipe(Layer.provide(makeLocalDbConfigLayer(input)));
}
