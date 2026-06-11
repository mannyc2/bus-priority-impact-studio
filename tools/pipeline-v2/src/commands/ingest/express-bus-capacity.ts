import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { normalizeExpressBusCapacityRows } from "@bp/sources/adapters/mta/express-bus-capacity";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { defineCommand, z } from "@liche/core";
import { writeJson } from "../../lib/json.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import { fetchSoda3RowsForSource, type SocrataFetch, type SocrataRow } from "../../lib/soda3.ts";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.ts";

const sourceId = "mta_express_bus_capacity_2023";
const staticPeriod = "2023-04-2023-09";

export type IngestExpressBusCapacityArgs = {
  rawPath?: string;
  normalizedPath?: string;
  fetchedAt?: Date;
  fetcher?: SocrataFetch;
  manifestText?: string;
};

export type IngestExpressBusCapacityResult = {
  rawPath: string;
  normalizedPath: string;
  rawRowCount: number;
  normalizedRowCount: number;
  routeCount: number;
};

const defaultRawPath = () =>
  fromRepoRoot(join("data/raw/express-bus-capacity", `express-bus-capacity-${staticPeriod}.json`));

export const defaultExpressBusCapacityNormalizedPath = () =>
  fromRepoRoot(
    join(
      "data/working/express-bus-capacity",
      `express-bus-capacity-normalized-${staticPeriod}.json`,
    ),
  );

export async function ingestExpressBusCapacity(
  args: IngestExpressBusCapacityArgs = {},
): Promise<IngestExpressBusCapacityResult> {
  const manifestText =
    args.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(loadSourceManifestYaml(manifestText), sourceId);
  const rawPath = args.rawPath ?? defaultRawPath();
  const normalizedPath = args.normalizedPath ?? defaultExpressBusCapacityNormalizedPath();
  const fetchedAt = args.fetchedAt ?? new Date();

  const rawRows: SocrataRow[] = [
    ...(await fetchSoda3RowsForSource(
      source,
      { order: "route,direction,day_type,hour,week" },
      {
        fetcher: args.fetcher,
        pageSize: 50_000,
      },
    )),
  ];
  const rows = normalizeExpressBusCapacityRows(rawRows);

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    fetchedAt,
    query: { grain: "route x direction x dayType x hour x week", period: staticPeriod },
    rows: rawRows,
  });

  await mkdir(dirname(normalizedPath), { recursive: true });
  await writeJson(normalizedPath, {
    schemaVersion: 1,
    sourceId,
    period: staticPeriod,
    generatedAt: fetchedAt.toISOString(),
    caveat:
      "Express-only maximum-load-point capacity context; not stop boardings or local/SBS passenger load.",
    rows,
  });

  return {
    rawPath,
    normalizedPath,
    rawRowCount: rawRows.length,
    normalizedRowCount: rows.length,
    routeCount: new Set(rows.map((row) => row.routeId)).size,
  };
}

export default defineCommand({
  path: ["ingest", "express-bus-capacity"],
  summary:
    "Fetch the static MTA Express Bus Capacity dataset and write raw + normalized snapshots.",
  input: {
    options: z.object({
      rawOutput: z.string().optional().describe("Raw snapshot output path"),
      normalizedOutput: z.string().optional().describe("Normalized output path"),
    }),
  },
  output: z.object({
    rawPath: z.string(),
    normalizedPath: z.string(),
    rawRowCount: z.number(),
    normalizedRowCount: z.number(),
    routeCount: z.number(),
  }),
  async run({ input }) {
    return ingestExpressBusCapacity({
      ...(input.options.rawOutput === undefined ? {} : { rawPath: input.options.rawOutput }),
      ...(input.options.normalizedOutput === undefined
        ? {}
        : { normalizedPath: input.options.normalizedOutput }),
    });
  },
});
