import { Effect } from "effect";

export type OutputControls = {
  json: boolean;
  fullOutput: boolean;
};

export function formatResult(result: unknown, _controls: OutputControls): string | null {
  if (result === undefined) return null;
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}

export function emitResult(result: unknown, controls: OutputControls): Effect.Effect<void> {
  return Effect.sync(() => {
    const output = formatResult(result, controls);
    if (output !== null) console.log(output);
  });
}
