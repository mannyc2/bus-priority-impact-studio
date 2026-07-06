import * as z from "@bp/domain/schema-compat";

export { z };

export type CommandRunContext<Options = Record<string, unknown>> = {
  ctx: {
    isTty: boolean;
  };
  input: {
    options: Options;
  };
};

export type CommandDefinition<Options = Record<string, unknown>, Output = unknown> = {
  path: readonly [string, ...string[]];
  summary?: string;
  input?: {
    options?: z.ZodType<Options>;
  };
  output?: z.ZodType<Output> | unknown;
  run: (ctx: CommandRunContext<Options>) => Output | Promise<Output>;
};

export type DeclarativeCommand<
  Options = Record<string, unknown>,
  Output = unknown,
> = CommandDefinition<Options, Output>;

export function defineCommand<const Options = Record<string, unknown>, const Output = unknown>(
  command: CommandDefinition<Options, Output>,
): CommandDefinition<Options, Output> {
  return command;
}

export const arg = {
  boolean: () => z.coerce.boolean(),
  int: () => z.coerce.number().int(),
  number: () => z.coerce.number(),
  positiveInt: () => z.coerce.number().int().positive(),
};
