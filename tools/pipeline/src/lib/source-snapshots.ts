import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { writeJson } from "./json.js";

type RawSourceSnapshotInput = {
  path: string;
  sourceId: string;
  fetchedAt: Date | string;
  query: unknown;
  rows: unknown[];
  extra?: Record<string, unknown>;
  schemaVersion?: number;
};

function fetchedAtIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function rawSourceSnapshot(input: Omit<RawSourceSnapshotInput, "path">) {
  return {
    schemaVersion: input.schemaVersion ?? 1,
    sourceId: input.sourceId,
    ...input.extra,
    fetchedAt: fetchedAtIso(input.fetchedAt),
    query: input.query,
    rows: input.rows,
  };
}

export async function writeRawSourceSnapshot(input: RawSourceSnapshotInput): Promise<number> {
  await mkdir(dirname(input.path), { recursive: true });
  return writeJson(input.path, rawSourceSnapshot(input));
}
