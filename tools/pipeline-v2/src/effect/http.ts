import { Context, Effect, Layer, Schedule } from "effect";
import { HttpRequestError, RateLimitError } from "./errors.ts";
import { runPipelineEffect } from "./runtime.ts";

type HttpRetryMeta = {
  readonly command: string;
  readonly operation: string;
  readonly url: string;
};

export type PipelineHttpAttemptContext = {
  readonly attempt: number;
  readonly maxAttempts: number;
};

export type PipelineHttpRetryError = HttpRequestError | RateLimitError;

type PipelineHttpRetryInput<A> = HttpRetryMeta & {
  readonly maxAttempts: number;
  readonly retryDelayMs?: number | undefined;
  readonly run: (context: PipelineHttpAttemptContext) => Effect.Effect<A, PipelineHttpRetryError>;
  readonly onAttemptFailed?:
    | ((input: PipelineHttpAttemptContext & { readonly error: PipelineHttpRetryError }) => void)
    | undefined;
};

export type PipelineHttpPromiseInput<A> = HttpRetryMeta & {
  readonly maxAttempts: number;
  readonly retryDelayMs?: number | undefined;
  readonly run: (context: PipelineHttpAttemptContext) => Promise<A>;
  readonly onAttemptFailed?:
    | ((input: PipelineHttpAttemptContext & { readonly error: PipelineHttpRetryError }) => void)
    | undefined;
};

export class PipelineHttpService extends Context.Service<
  PipelineHttpService,
  {
    readonly withRetry: <A>(
      input: PipelineHttpRetryInput<A>,
    ) => Effect.Effect<A, PipelineHttpRetryError>;
  }
>()("@bp/pipeline-v2/PipelineHttpService") {}

function retrySchedule(maxAttempts: number, retryDelayMs: number | undefined) {
  const retries = Math.max(0, maxAttempts - 1);
  const baseDelayMs = Math.max(0, retryDelayMs ?? 1_000);
  if (baseDelayMs === 0) {
    return Schedule.recurs(retries).pipe(Schedule.map(() => undefined));
  }
  return Schedule.exponential(baseDelayMs, 1.5).pipe(
    Schedule.jittered,
    Schedule.both(Schedule.recurs(retries)),
    Schedule.map(() => undefined),
  );
}

function statusFromCause(cause: unknown): number {
  if (!(cause instanceof Error) || !cause.message.startsWith("HTTP ")) return 0;
  const status = Number(cause.message.slice(5));
  return Number.isFinite(status) ? status : 0;
}

function retryError(
  input: HttpRetryMeta,
  context: PipelineHttpAttemptContext,
  cause: unknown,
): PipelineHttpRetryError {
  if (cause instanceof Error && cause.message === "HTTP 429") {
    return RateLimitError.make({
      ...input,
      ...context,
      status: 429,
      retryAfterMs: 0,
      cause,
    });
  }
  return HttpRequestError.make({
    ...input,
    ...context,
    status: statusFromCause(cause),
    cause,
  });
}

const PipelineHttpServiceLive = {
  withRetry: Effect.fn("PipelineHttpService.withRetry")(function* <A>(
    input: PipelineHttpRetryInput<A>,
  ) {
    const maxAttempts = Math.max(1, Math.floor(input.maxAttempts));
    let nextAttempt = 1;
    const attempt = Effect.gen(function* () {
      const context = { attempt: nextAttempt, maxAttempts };
      nextAttempt += 1;
      yield* Effect.annotateCurrentSpan({ ...input, ...context });
      return yield* input
        .run(context)
        .pipe(
          Effect.tapError((error) =>
            context.attempt < maxAttempts
              ? Effect.sync(() => input.onAttemptFailed?.({ ...context, error }))
              : Effect.void,
          ),
        );
    });

    return yield* attempt.pipe(Effect.retry(retrySchedule(maxAttempts, input.retryDelayMs)));
  }),
};

export const PipelineHttpServiceLayer: Layer.Layer<PipelineHttpService> = Layer.succeed(
  PipelineHttpService,
  PipelineHttpServiceLive,
);

export function runPipelineHttpPromise<A>(input: PipelineHttpPromiseInput<A>): Promise<A> {
  return runPipelineEffect(
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({
        command: input.command,
        operation: input.operation,
      });
      const http = yield* PipelineHttpService;
      return yield* http.withRetry({
        ...input,
        run: (context) =>
          Effect.tryPromise({
            try: () => input.run(context),
            catch: (cause) => retryError(input, context, cause),
          }),
      });
    }),
    PipelineHttpServiceLayer,
  );
}
