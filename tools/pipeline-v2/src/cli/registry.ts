import { Glob } from "bun";
import { Effect } from "effect";
import { type Command as CliCommand, Command } from "effect/unstable/cli";
import type { CommandDefinition } from "./compat.ts";
import { emitResult } from "./json-output.ts";
import { buildCliConfig, objectShape, parseCliOptions } from "./options.ts";

export type CommandRegistrySnapshot = Record<string, string[]>;

export async function discoverCommandDescriptors(): Promise<CommandDefinition[]> {
  const glob = new Glob("commands/**/*.ts");
  const commands: CommandDefinition[] = [];
  const sourceRoot = new URL("../", import.meta.url);

  for await (const path of glob.scan({ cwd: sourceRoot.pathname })) {
    const mod = await import(`../${path}`);
    if (!mod.default) continue;
    const command = mod.default as CommandDefinition;
    if (isCommandDefinition(command)) commands.push(command);
  }

  return commands.sort((left, right) => left.path.join(" ").localeCompare(right.path.join(" ")));
}

export function buildCommandRegistrySnapshot(
  commands: readonly CommandDefinition[],
): CommandRegistrySnapshot {
  const snapshot: CommandRegistrySnapshot = {};
  for (const command of commands) {
    const [group, name] = command.path;
    if (!name) continue;
    snapshot[group] ??= [];
    snapshot[group].push(name);
  }

  for (const names of Object.values(snapshot)) names.sort();
  return Object.fromEntries(
    Object.entries(snapshot).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function buildRootCommand(commands: readonly CommandDefinition[]): CliCommand.Command.Any {
  const byGroup = groupCommands(commands);
  const groups = Object.entries(byGroup).map(([group, groupCommands]) =>
    Command.make(group).pipe(
      Command.withSubcommands(groupCommands.map((command) => buildLeafCommand(command))),
    ),
  );

  return Command.make("pipeline").pipe(
    Command.withDescription("Bus Priority pipeline CLI"),
    Command.withSubcommands(groups),
  );
}

function buildLeafCommand(command: CommandDefinition): CliCommand.Command.Any {
  if (command.path.length !== 2) {
    throw new Error(`Expected two-part command path, received ${command.path.join(" ")}`);
  }

  const name = command.path[1];
  if (!name) throw new Error(`Missing command name for path ${command.path.join(" ")}`);
  const optionsSchema = command.input?.options;
  const config = buildCliConfig(optionsSchema);
  const leaf = Command.make(name, config as CliCommand.Command.Config, (rawConfig) => {
    const parsed = parseCliOptions(optionsSchema, rawConfig as Record<string, unknown>);
    return Effect.tryPromise({
      try: () =>
        Promise.resolve(
          command.run({
            ctx: { isTty: Boolean(process.stdout.isTTY) },
            input: { options: parsed.options },
          }),
        ),
      catch: normalizeCommandError,
    }).pipe(Effect.flatMap((result) => emitResult(result, parsed.controls)));
  });

  return command.summary ? leaf.pipe(Command.withDescription(command.summary)) : leaf;
}

function groupCommands(
  commands: readonly CommandDefinition[],
): Record<string, CommandDefinition[]> {
  const byGroup: Record<string, CommandDefinition[]> = {};
  for (const command of commands) {
    const [group] = command.path;
    byGroup[group] ??= [];
    byGroup[group].push(command);
  }
  return Object.fromEntries(
    Object.entries(byGroup).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function isCommandDefinition(value: unknown): value is CommandDefinition {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CommandDefinition>;
  return Array.isArray(candidate.path) && typeof candidate.run === "function";
}

function normalizeCommandError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

export function optionNames(command: CommandDefinition): string[] {
  const optionsSchema = command.input?.options;
  return optionsSchema ? Object.keys(objectShape(optionsSchema)).sort() : [];
}
