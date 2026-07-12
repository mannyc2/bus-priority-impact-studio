import { BunRuntime } from "@effect/platform-bun";
import type { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { buildRootCommand, discoverCommandDescriptors } from "./cli/registry.ts";

export const pipelineCommands = await discoverCommandDescriptors();
export const cli = buildRootCommand(pipelineCommands);

if (import.meta.main) {
  const program = Command.runWith(cli, { version: "0.0.1" })(Bun.argv.slice(2)) as Effect.Effect<
    void,
    unknown,
    never
  >;
  BunRuntime.runMain(program);
}
