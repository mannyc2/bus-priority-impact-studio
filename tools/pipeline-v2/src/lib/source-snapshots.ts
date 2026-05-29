import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type RawSourceSnapshot = {
  path: string;
  sourceId: string;
  fetchedAt: Date | string;
  query: unknown;
  rows: unknown[];
  extra?: Record<string, unknown>;
  schemaVersion?: number;
};

export async function writeRawSourceSnapshot(input: RawSourceSnapshot): Promise<number> {
  await mkdir(dirname(input.path), { recursive: true });
  const payload = {
    schemaVersion: input.schemaVersion ?? 1,
    sourceId: input.sourceId,
    ...input.extra,
    fetchedAt: input.fetchedAt instanceof Date ? input.fetchedAt.toISOString() : input.fetchedAt,
    query: input.query,
    rows: input.rows,
  };
  return Bun.write(input.path, `${JSON.stringify(payload, null, 2)}\n`);
}
