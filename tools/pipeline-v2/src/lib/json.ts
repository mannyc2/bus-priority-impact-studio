import { Result, type Schema } from "effect";
import { runPipelineFileSystemBoundary } from "../effect/file-system.ts";
import {
  decodeSchemaEitherPreserve,
  decodeSchemaEitherStrict,
  decodeSchemaEitherStrip,
} from "./schema-decode.ts";

const COMMAND = "pipeline.json";
type DecodePolicy = "preserve" | "strict" | "strip";

function parseJsonArtifact<S extends Schema.Constraint>(
  path: string,
  raw: unknown,
  schema: S,
  policy: DecodePolicy,
): S["Type"] {
  const decoder =
    policy === "preserve"
      ? decodeSchemaEitherPreserve
      : policy === "strict"
        ? decodeSchemaEitherStrict
        : decodeSchemaEitherStrip;
  const parsed = decoder(schema, raw);
  if (Result.isFailure(parsed)) {
    throw new Error(`Failed to parse artifact at ${path}: ${String(parsed.failure)}`);
  }
  return parsed.success;
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await runPipelineFileSystemBoundary({
    command: COMMAND,
    operation: "writeJson",
    run: (files) =>
      files.writeText({
        command: COMMAND,
        operation: "writeJson",
        path,
        contents: `${JSON.stringify(data, null, 2)}\n`,
      }),
  });
}

export async function readJsonIfExists<T>(path: string): Promise<T | null>;
export async function readJsonIfExists(path: string): Promise<unknown | null> {
  return runPipelineFileSystemBoundary({
    command: COMMAND,
    operation: "readJsonIfExists",
    run: (files) =>
      files.readJsonIfExists({
        command: COMMAND,
        operation: "readJsonIfExists",
        path,
      }),
  });
}

export async function readJsonArtifact<S extends Schema.Constraint>(
  path: string,
  schema: S,
  policy: DecodePolicy = "strip",
): Promise<S["Type"]> {
  const raw = await readJsonIfExists<unknown>(path);
  if (raw === null) {
    throw new Error(`Artifact not found at ${path}`);
  }
  return parseJsonArtifact(path, raw, schema, policy);
}

export async function readOptionalJsonArtifact<S extends Schema.Constraint>(
  path: string | null,
  schema: S,
  policy: DecodePolicy = "strip",
): Promise<S["Type"] | null> {
  if (!path) return null;
  const raw = await readJsonIfExists<unknown>(path);
  if (raw === null) return null;
  return parseJsonArtifact(path, raw, schema, policy);
}
