import { writeJson } from "./json.ts";

export type RawSourceSnapshot = {
  path: string;
  sourceId: string;
  fetchedAt: Date | string;
  query: unknown;
  rows: unknown[];
  extra?: Record<string, unknown>;
  schemaVersion?: number;
};

export async function writeRawSourceSnapshot(input: RawSourceSnapshot): Promise<void> {
  const payload = {
    schemaVersion: input.schemaVersion ?? 1,
    sourceId: input.sourceId,
    ...input.extra,
    fetchedAt: input.fetchedAt instanceof Date ? input.fetchedAt.toISOString() : input.fetchedAt,
    query: input.query,
    rows: input.rows,
  };
  await writeJson(input.path, payload);
}
