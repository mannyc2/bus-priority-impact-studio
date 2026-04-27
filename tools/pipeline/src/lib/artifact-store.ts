import { mkdir } from "node:fs/promises";
import type * as z from "zod";
import { writeJson } from "./json.js";

/** Ensure a directory exists (recursive mkdir). */
export function ensureDir(dirPath: string): Promise<void> {
  return mkdir(dirPath, { recursive: true }).then(() => undefined);
}

/** Read a JSON file and parse it with a Zod schema. */
export async function readArtifact<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await Bun.file(path).json());
}

/** Read a JSON file if it exists, returning null if absent. */
export async function readArtifactIfPresent<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }

  return schema.parse(await file.json());
}

/** Ensure parent directory and write a JSON artifact atomically. */
export async function writeArtifact(
  dirPath: string,
  filePath: string,
  data: unknown,
): Promise<void> {
  await ensureDir(dirPath);
  await writeJson(filePath, data);
}
