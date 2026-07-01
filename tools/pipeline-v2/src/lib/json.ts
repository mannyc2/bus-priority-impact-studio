import type { ZodType } from "zod";
import { runPipelineFileSystemBoundary } from "../effect/file-system.ts";

const COMMAND = "pipeline.json";

function parseJsonArtifact<T>(path: string, raw: unknown, schema: ZodType<T>): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new Error(`Failed to parse artifact at ${path}: ${detail}`);
  }
  return parsed.data;
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

export async function readJsonArtifact<T>(path: string, schema: ZodType<T>): Promise<T> {
  const raw = await readJsonIfExists<unknown>(path);
  if (raw === null) {
    throw new Error(`Artifact not found at ${path}`);
  }
  return parseJsonArtifact(path, raw, schema);
}

export async function readOptionalJsonArtifact<T>(
  path: string | null,
  schema: ZodType<T>,
): Promise<T | null> {
  if (!path) return null;
  const raw = await readJsonIfExists<unknown>(path);
  if (raw === null) return null;
  return parseJsonArtifact(path, raw, schema);
}
