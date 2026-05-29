import { join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { upsertNypdCollisions } from "@bp/db/local";
import {
  getSocrataSource,
  normalizeNypdCollisionRows,
  parseSourceManifest,
  type SocrataFetch,
  type SocrataRow,
  type SocrataRowsQuery,
  SocrataClient,
} from "@bp/sources";
import { isoMonth, isoMonthStart, nextIsoMonthStart } from "../../lib/dates.ts";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
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
  const source = getSocrataSource(parseSourceManifest(manifestText), sourceId);
  const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
  const rawPath =
    inputs.snapshotPath ??
    fromRepoRoot(join("data/raw/nypd-collisions", `nypd-collisions-${monthKey}.json`));

  const query: SocrataRowsQuery = {
    where: [
      `crash_date >= '${isoMonthStart(inputs.year, inputs.month)}'`,
      `crash_date < '${nextIsoMonthStart(inputs.year, inputs.month)}'`,
    ].join(" AND "),
    order: "collision_id",
  };
  const rawRows: SocrataRow[] = await SocrataClient.fromSource(source, {
    fetcher: inputs.fetcher,
  }).rows(query);
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
  middleware: [withLocalDb()],
  output: z.object({
    rawPath: z.string(),
    isoMonth: z.string(),
    rowCount: z.number(),
  }),
  async run({ ctx, input }) {
    return runNypdCollisionsIngest({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
    });
  },
});
