import * as BunFileSystem from "@effect/platform-bun/BunFileSystem";
import * as BunPath from "@effect/platform-bun/BunPath";
import { Context, Effect, Layer } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { PipelineFileSystemError } from "./errors.ts";
import { runPipelineEffect } from "./runtime.ts";

export type PipelineFileSpanAttributes = Record<string, string | number | boolean | null>;

export type PipelineFileInput = {
  readonly command: string;
  readonly operation: string;
  readonly path: string;
  readonly spanAttributes?: PipelineFileSpanAttributes | undefined;
};

export type PipelineFileWriteInput = PipelineFileInput & {
  readonly contents: string;
  readonly ensureParentDirectory?: boolean | undefined;
};

export type PipelineFileSystem = {
  readonly readText: (input: PipelineFileInput) => Effect.Effect<string, PipelineFileSystemError>;
  readonly readTextIfExists: (
    input: PipelineFileInput,
  ) => Effect.Effect<string | null, PipelineFileSystemError>;
  readonly readJsonIfExists: (
    input: PipelineFileInput,
  ) => Effect.Effect<unknown | null, PipelineFileSystemError>;
  readonly writeText: (
    input: PipelineFileWriteInput,
  ) => Effect.Effect<void, PipelineFileSystemError>;
};

export class PipelineFileSystemService extends Context.Service<
  PipelineFileSystemService,
  PipelineFileSystem
>()("@bp/pipeline-v2/PipelineFileSystemService") {}

function fileError(input: PipelineFileInput, cause: unknown): PipelineFileSystemError {
  return PipelineFileSystemError.make({
    command: input.command,
    operation: input.operation,
    path: input.path,
    cause,
  });
}

function annotateFileSpan(input: PipelineFileInput): Effect.Effect<void> {
  return Effect.annotateCurrentSpan({
    command: input.command,
    operation: input.operation,
    path: input.path,
    ...(input.spanAttributes ?? {}),
  });
}

export const PipelineFileSystemServiceLayer: Layer.Layer<
  PipelineFileSystemService,
  never,
  FileSystem.FileSystem | Path.Path
> = Layer.effect(
  PipelineFileSystemService,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const readText = Effect.fn("PipelineFileSystemService.readText")(function* (
      input: PipelineFileInput,
    ) {
      yield* annotateFileSpan(input);
      return yield* fs
        .readFileString(input.path)
        .pipe(Effect.mapError((cause) => fileError(input, cause)));
    });

    const readTextIfExists = Effect.fn("PipelineFileSystemService.readTextIfExists")(function* (
      input: PipelineFileInput,
    ) {
      yield* annotateFileSpan(input);
      const exists = yield* fs
        .exists(input.path)
        .pipe(Effect.mapError((cause) => fileError(input, cause)));
      if (!exists) return null;
      return yield* readText(input);
    });

    const readJsonIfExists = Effect.fn("PipelineFileSystemService.readJsonIfExists")(function* (
      input: PipelineFileInput,
    ) {
      const text = yield* readTextIfExists(input);
      if (text === null) return null;
      return yield* Effect.try({
        try: () => {
          const parsed: unknown = JSON.parse(text);
          return parsed;
        },
        catch: (cause) => fileError(input, cause),
      });
    });

    const writeText = Effect.fn("PipelineFileSystemService.writeText")(function* (
      input: PipelineFileWriteInput,
    ) {
      yield* annotateFileSpan(input);
      if (input.ensureParentDirectory !== false) {
        yield* fs
          .makeDirectory(path.dirname(input.path), { recursive: true })
          .pipe(Effect.mapError((cause) => fileError(input, cause)));
      }
      yield* fs
        .writeFileString(input.path, input.contents)
        .pipe(Effect.mapError((cause) => fileError(input, cause)));
    });

    return { readText, readTextIfExists, readJsonIfExists, writeText };
  }),
);

export const PipelineFileSystemLayer: Layer.Layer<PipelineFileSystemService> =
  PipelineFileSystemServiceLayer.pipe(
    Layer.provide(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)),
  );

export type PipelineFileSystemTaskInput<A> = {
  readonly command: string;
  readonly operation: string;
  readonly run: (files: PipelineFileSystem) => Effect.Effect<A, PipelineFileSystemError>;
};

export const runPipelineFileSystemTask = Effect.fn("runPipelineFileSystemTask")(function* <A>(
  input: PipelineFileSystemTaskInput<A>,
) {
  yield* Effect.annotateCurrentSpan({
    command: input.command,
    operation: input.operation,
  });

  const files = yield* PipelineFileSystemService;
  const result = yield* input.run(files);

  yield* Effect.logInfo(`${input.command} file task complete`);

  return result;
});

export function runPipelineFileSystemBoundary<A>(
  input: PipelineFileSystemTaskInput<A>,
): Promise<A> {
  return runPipelineEffect(runPipelineFileSystemTask(input), PipelineFileSystemLayer);
}
