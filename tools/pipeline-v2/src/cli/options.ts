import { decodeStrip } from "@bp/domain/decode";
import { Option, type Schema } from "effect";
import { Flag, Param } from "effect/unstable/cli";
import {
  type CliSchemaField,
  inspectStructFields,
  serviceFreeSchema,
} from "./schema-introspect.ts";

export type ParsedCliControls = {
  json: boolean;
  fullOutput: boolean;
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

export function buildCliConfig(optionsSchema: Schema.Constraint | undefined): CliConfig {
  const fields = optionsSchema ? inspectStructFields(optionsSchema) : [];
  const config: CliConfig = {};
  for (const field of fields) {
    config[field.key] = buildFlag(field);
  }
  config.json = Flag.boolean("json").pipe(Flag.withDefault(false));
  config.fullOutput = Flag.boolean("full-output").pipe(
    Flag.withAlias("fullOutput"),
    Flag.withDefault(false),
  );
  return config;
}

export function parseCliOptions(
  optionsSchema: Schema.Constraint | undefined,
  rawConfig: CliConfig,
): ParsedOptions {
  const rawOptions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawConfig)) {
    if (controlKeys.has(key)) continue;
    const unwrapped = unwrapOptionValue(value);
    if (unwrapped !== undefined) rawOptions[key] = unwrapped;
  }

  const options = optionsSchema ? decodeStrip(serviceFreeSchema(optionsSchema))(rawOptions) : {};
  if (!isRecord(options)) {
    throw new Error("CLI options schema must decode to an object.");
  }

  return {
    controls: {
      json: rawConfig.json === true,
      fullOutput: rawConfig.fullOutput === true,
    },
    options,
  };
}

export function objectShape(schema: Schema.Constraint): Record<string, CliSchemaField> {
  return Object.fromEntries(inspectStructFields(schema).map((field) => [field.key, field]));
}

function buildFlag(info: CliSchemaField): unknown {
  const flagName = kebabCase(info.key);
  const description = info.description;

  if (info.baseType === "array") {
    let flag = Param.variadic(Flag.string(flagName));
    if (info.key !== flagName) flag = flag.pipe(Param.withAlias(info.key));
    if (description) flag = flag.pipe(Param.withDescription(description));
    return flag;
  }

  if (info.baseType === "boolean") {
    let flag = Flag.boolean(flagName);
    if (info.key !== flagName) flag = flag.pipe(Flag.withAlias(info.key));
    if (description) flag = flag.pipe(Flag.withDescription(description));
    if (info.hasDefault) return flag.pipe(Flag.withDefault(Boolean(info.defaultValue)));
    if (info.optional) return flag.pipe(Flag.optional);
    return flag;
  }

  let flag = Flag.string(flagName);
  if (info.key !== flagName) flag = flag.pipe(Flag.withAlias(info.key));
  if (description) flag = flag.pipe(Flag.withDescription(description));
  if (info.hasDefault && isPrimitiveDefault(info.defaultValue)) {
    return flag.pipe(Flag.withDefault(String(info.defaultValue)));
  }
  if (info.optional || info.hasDefault) return flag.pipe(Flag.optional);
  return flag;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
