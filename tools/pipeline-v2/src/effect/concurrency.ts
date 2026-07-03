import { availableParallelism } from "node:os";
import { Effect } from "effect";

export const localTransformConcurrency = Math.max(1, availableParallelism());

export type SettledPromiseResult<T> =
  | { readonly status: "fulfilled"; readonly value: T }
  | { readonly status: "rejected"; readonly reason: unknown };

export function runBoundedPromises<T, U>(
  values: readonly T[],
  concurrency: number,
  run: (value: T) => Promise<U>,
): Promise<U[]> {
  return Effect.runPromise(
    Effect.forEach(values, (value) => Effect.tryPromise(() => run(value)), {
      concurrency: Math.max(1, concurrency),
    }),
  );
}

export function runBoundedSettledPromises<T, U>(
  values: readonly T[],
  concurrency: number,
  run: (value: T) => Promise<U>,
): Promise<SettledPromiseResult<U>[]> {
  return runBoundedPromises(values, concurrency, async (value) => {
    try {
      return { status: "fulfilled", value: await run(value) };
    } catch (reason) {
      return { status: "rejected", reason };
    }
  });
}
