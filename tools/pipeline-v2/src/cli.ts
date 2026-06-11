import {
  defineCli,
  help,
  outputControls,
  reflectionControls,
  run,
  type DeclarativeCommand,
  version,
} from "@liche/core";
import { Glob } from "bun";

async function discoverCommands(): Promise<DeclarativeCommand[]> {
  const glob = new Glob("commands/**/*.ts");
  const commands: DeclarativeCommand[] = [];
  for await (const path of glob.scan({ cwd: import.meta.dir })) {
    try {
      const mod = await import(`./${path}`);
      if (mod.default) commands.push(mod.default as DeclarativeCommand);
    } catch (err) {
      console.error(`pipeline: skipping ${path} (${(err as Error).message.split("\n")[0]})`);
    }
  }
  return commands;
}

export const cli = defineCli({
  name: "pipeline",
  version: "0.0.1",
  extensions: [
    help(),
    version(),
    outputControls({ format: true, fullOutput: true, json: true }),
    reflectionControls({ schema: true }),
  ],
  commands: await discoverCommands(),
});

if (import.meta.main) await run(cli);
