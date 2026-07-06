import { Option } from "effect";
import { Flag, Param } from "effect/unstable/cli";
import { getObjectShape, getSchemaInfo, type ZodType } from "@bp/domain/schema-compat";
import type * as z from "@bp/domain/schema-compat";

export type ParsedCliControls = {
  json: boolean;
  fullOutput: boolean;
};

type OptionInfo = {
  schema: ZodType;
  description: string | undefined;
  optional: boolean;
  hasDefault: boolean;
  defaultValue: unknown;
  baseType: string | undefined;
};

type ParsedOptions = {
  controls: ParsedCliControls;
  options: Record<string, unknown>;
};

type CliConfig = Record<string, unknown> & {
  json?: unknown;
  fullOutput?: unknown;
};

const controlKeys = new Set(["json", "fullOutput"]);

export function buildCliConfig(optionsSchema: z.ZodType | undefined): CliConfig {
  const shape = optionsSchema ? objectShape(optionsSchema) : {};
  const config: CliConfig = {};
  for (const [key, schema] of Object.entries(shape)) {
    config[key] = buildFlag(key, schema as z.ZodType);
  }
  config.json = Flag.boolean("json").pipe(Flag.withDefault(false));
  config.fullOutput = Flag.boolean("full-output").pipe(
    Flag.withAlias("fullOutput"),
    Flag.withDefault(false),
  );
  return config;
}

export function parseCliOptions(
  optionsSchema: z.ZodType | undefined,
  rawConfig: CliConfig,
): ParsedOptions {
  const rawOptions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawConfig)) {
    if (controlKeys.has(key)) continue;
    const unwrapped = unwrapOptionValue(value);
    if (unwrapped !== undefined) rawOptions[key] = unwrapped;
  }

  return {
    controls: {
      json: rawConfig.json === true,
      fullOutput: rawConfig.fullOutput === true,
    },
    options: optionsSchema ? (optionsSchema.parse(rawOptions) as Record<string, unknown>) : {},
  };
}

export function objectShape(schema: z.ZodType): Record<string, unknown> {
  return getObjectShape(schema);
}

function buildFlag(key: string, schema: z.ZodType): unknown {
  const info = optionInfo(schema);
  const flagName = kebabCase(key);
  const description = info.description;

  if (info.baseType === "array") {
    let flag = Param.variadic(Flag.string(flagName));
    if (key !== flagName) flag = flag.pipe(Param.withAlias(key));
    if (description) flag = flag.pipe(Param.withDescription(description));
    return flag;
  }

  if (info.baseType === "boolean") {
    let flag = Flag.boolean(flagName);
    if (key !== flagName) flag = flag.pipe(Flag.withAlias(key));
    if (description) flag = flag.pipe(Flag.withDescription(description));
    if (info.hasDefault) return flag.pipe(Flag.withDefault(Boolean(info.defaultValue)));
    if (info.optional) return flag.pipe(Flag.optional);
    return flag;
  }

  let flag = Flag.string(flagName);
  if (key !== flagName) flag = flag.pipe(Flag.withAlias(key));
  if (description) flag = flag.pipe(Flag.withDescription(description));
  if (info.hasDefault && isPrimitiveDefault(info.defaultValue)) {
    return flag.pipe(Flag.withDefault(String(info.defaultValue)));
  }
  if (info.optional || info.hasDefault) return flag.pipe(Flag.optional);
  return flag;
}

function optionInfo(schema: z.ZodType): OptionInfo {
  let current = schema;
  let optional = false;
  let hasDefault = false;
  let defaultValue: unknown;
  let description = getSchemaInfo(schema).description;

  for (;;) {
    const info = getSchemaInfo(current);
    if (!description && info.description) description = info.description;

    if (info.hasDefault) {
      hasDefault = true;
      defaultValue = info.defaultValue;
      current = info.innerType ?? current;
      continue;
    }

    if (info.optional) {
      optional = true;
      current = info.innerType ?? current;
      continue;
    }

    if (info.nullable) {
      current = info.innerType ?? current;
      continue;
    }

    return {
      schema: current,
      description,
      optional,
      hasDefault,
      defaultValue,
      baseType: info.kind,
    };
  }
}

function unwrapOptionValue(value: unknown): unknown {
  return Option.isOption(value) ? Option.getOrUndefined(value) : value;
}

function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function isPrimitiveDefault(value: unknown): boolean {
  return ["string", "number", "boolean"].includes(typeof value);
}
