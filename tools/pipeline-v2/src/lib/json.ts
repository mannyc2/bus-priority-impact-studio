import type { ZodType } from "zod";

export function writeJson(path: string, data: unknown): Promise<number> {
  return Bun.write(path, `${JSON.stringify(data, null, 2)}\n`);
}

export async function readJsonIfExists<T>(path: string): Promise<T | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return (await file.json()) as T;
}

export async function readJsonArtifact<T>(
  path: string,
  schema: ZodType<T>,
): Promise<T> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Artifact not found at ${path}`);
  }
  const raw = await file.json();
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

export async function readOptionalJsonArtifact<T>(
  path: string | null,
  schema: ZodType<T>,
): Promise<T | null> {
  if (!path) return null;
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return await readJsonArtifact(path, schema);
}
