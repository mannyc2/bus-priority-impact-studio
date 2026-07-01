import { ManagedRuntime } from "effect";
import type { Effect, Layer } from "effect";

export async function runPipelineEffect<A, E, R, ER>(
  effect: Effect.Effect<A, E, R>,
  layer: Layer.Layer<R, ER>,
): Promise<A> {
  const runtime = ManagedRuntime.make(layer);
  try {
    return await runtime.runPromise(effect);
  } finally {
    await runtime.dispose();
  }
}
