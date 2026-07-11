import { Schema, SchemaGetter } from "effect";

export { Schema };

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
    options?: Schema.Schema<Options>;
  };
  output?: Schema.Schema<Output>;
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

const CoercedBoolean = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform(Boolean),
    encode: SchemaGetter.passthrough(),
  }),
);

const CoercedNumber = Schema.Unknown.pipe(
  Schema.decodeTo(Schema.Number, {
    decode: SchemaGetter.transform(Number),
    encode: SchemaGetter.passthrough(),
  }),
);

export const arg = {
  boolean: () => CoercedBoolean,
  int: () => CoercedNumber.check(Schema.isInt()),
  number: () => CoercedNumber,
  positiveInt: () => CoercedNumber.check(Schema.isInt(), Schema.isGreaterThan(0)),
};
