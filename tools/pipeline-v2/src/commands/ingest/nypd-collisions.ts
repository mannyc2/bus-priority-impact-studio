import { join } from "node:path";
import { upsertNypdCollisions } from "@bp/db/local";
import { arg, defineCommand, z } from "@bp/pipeline-v2/cli/compat";
import { normalizeNypdCollisionRows } from "@bp/sources/adapters/nyc-open-data/nypd-collisions";
import { getSocrataSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth, isoMonthStart, nextIsoMonthStart } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
} from "../../lib/soda3.ts";
import { writeRawSourceSnapshot } from "../../lib/source-snapshots.ts";

const sourceId = "nypd_motor_vehicle_collisions";

export type NypdCollisionsRunInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  fetchedAt?: Date | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  snapshotPath?: string | undefined;
};

export type NypdCollisionsIngestResult = {
  rawPath: string;
  isoMonth: string;
  rowCount: number;
};

export async function runNypdCollisionsIngest(
  inputs: NypdCollisionsRunInputs,
): Promise<NypdCollisionsIngestResult> {
  const monthKey = isoMonth(inputs.year, inputs.month);
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(loadSourceManifestYaml(manifestText), sourceId);
  const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
  const rawPath =
    inputs.snapshotPath ??
    fromRepoRoot(join("data/raw/nypd-collisions", `nypd-collisions-${monthKey}.json`));

  const query: Soda3SoqlQuery = {
    where: [
      `crash_date >= '${isoMonthStart(inputs.year, inputs.month)}'`,
      `crash_date < '${nextIsoMonthStart(inputs.year, inputs.month)}'`,
    ].join(" AND "),
    order: "collision_id",
  };
  const rawRows: SocrataRow[] = [
    ...(await fetchSoda3RowsForSource(source, query, {
      fetcher: inputs.fetcher,
    })),
  ];
  const rows = normalizeNypdCollisionRows(rawRows).map((r) => ({
    ...r,
    // Ingest doesn't know geocode results; the geocode job populates these,
    // and ON CONFLICT preserves them on re-ingest.
    physicalId: null,
    geocodeConfidence: null,
  }));

  await upsertNypdCollisions(inputs.local.db, rows);

  await writeRawSourceSnapshot({
    path: rawPath,
    sourceId,
    extra: { isoMonth: monthKey },
    fetchedAt,
    query: { grain: "collision_id", month: monthKey },
    rows: rawRows,
  });

  return { rawPath, isoMonth: monthKey, rowCount: rows.length };
}

export default defineCommand({
  path: ["ingest", "nypd-collisions"],
  summary: "Fetch monthly NYPD motor vehicle collisions.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
    }),
  },
  output: z.object({
    rawPath: z.string(),
    isoMonth: z.string(),
    rowCount: z.number(),
  }),
  async run({ input }) {
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      command: "ingest.nypd-collisions",
      operation: "runNypdCollisionsIngest",
      spanAttributes: {
        year: input.options.year,
        month: input.options.month,
      },
      run: (local) =>
        runNypdCollisionsIngest({
          local,
          year: input.options.year,
          month: input.options.month,
        }),
    });
  },
});
