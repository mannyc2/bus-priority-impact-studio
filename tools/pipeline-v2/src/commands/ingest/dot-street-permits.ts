import { join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { upsertDotStreetPermits } from "@bp/db/local";
import {
  getSocrataSource,
  normalizeDotStreetPermitRows,
  parseSourceManifest,
  type PermitKind,
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

const sourceIdForKind: Record<PermitKind, string> = {
  construction: "nyc_dot_street_construction_permits",
  opening: "nyc_dot_street_opening_permits",
};

export type DotStreetPermitsRunInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  kind?: PermitKind | undefined;
  // Backfill mode: read rows from a local raw snapshot file instead of hitting
  // Socrata. Used when re-running normalization against an existing capture.
  fromSnapshot?: string | undefined;
  fetchedAt?: Date | undefined;
  fetcher?: SocrataFetch | undefined;
  manifestText?: string | undefined;
  snapshotPath?: string | undefined;
};

export type DotStreetPermitsIngestResult = {
  rawPath: string;
  isoMonth: string;
  rowCount: number;
  kind: PermitKind;
};

export async function runDotStreetPermitsIngest(
  inputs: DotStreetPermitsRunInputs,
): Promise<DotStreetPermitsIngestResult> {
  const kind: PermitKind = inputs.kind ?? "construction";
  const sourceId = sourceIdForKind[kind];
  const monthKey = isoMonth(inputs.year, inputs.month);
  const manifestText =
    inputs.manifestText ??
    (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text());
  const source = getSocrataSource(parseSourceManifest(manifestText), sourceId);
  const fetchedAt = (inputs.fetchedAt ?? new Date()).toISOString();
  const rawPath =
    inputs.snapshotPath ??
    fromRepoRoot(join("data/raw/dot-permits", `dot-${kind}-permits-${monthKey}.json`));

  let rawRows: SocrataRow[];
  if (inputs.fromSnapshot) {
    const snap = (await Bun.file(inputs.fromSnapshot).json()) as { rows?: unknown };
    rawRows = (Array.isArray(snap.rows) ? snap.rows : []) as SocrataRow[];
  } else {
    const query: SocrataRowsQuery = {
      where: [
        `permitissuedate >= '${isoMonthStart(inputs.year, inputs.month)}'`,
        `permitissuedate < '${nextIsoMonthStart(inputs.year, inputs.month)}'`,
      ].join(" AND "),
      order: "permitnumber",
    };
    rawRows = await SocrataClient.fromSource(source, { fetcher: inputs.fetcher }).rows(query);
  }

  const rows = normalizeDotStreetPermitRows(rawRows, kind).map((r) => ({
    ...r,
    // Set by geocode job; preserved on re-ingest via ON CONFLICT.
    physicalId: null,
    geocodeConfidence: null,
  }));

  await upsertDotStreetPermits(inputs.local.db, rows);

  // Skip snapshot rewrite in backfill mode; the snapshot we read is the
  // authoritative input.
  if (!inputs.fromSnapshot) {
    await writeRawSourceSnapshot({
      path: rawPath,
      sourceId,
      extra: { isoMonth: monthKey, kind },
      fetchedAt,
      query: { grain: "permit_number", month: monthKey },
      rows: rawRows,
    });
  }

  return { rawPath, isoMonth: monthKey, rowCount: rows.length, kind };
}

export default defineCommand({
  path: ["ingest", "dot-street-permits"],
  summary: "Fetch monthly DOT street construction or opening permits.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      kind: z
        .enum(["construction", "opening"])
        .default("construction")
        .describe("Permit dataset to fetch"),
      fromSnapshot: z
        .string()
        .optional()
        .describe("Reuse rows from a local raw snapshot file instead of fetching"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    rawPath: z.string(),
    isoMonth: z.string(),
    rowCount: z.number(),
    kind: z.enum(["construction", "opening"]),
  }),
  async run({ ctx, input }) {
    return runDotStreetPermitsIngest({
      local: localDbFromCtx(ctx),
      year: input.options.year,
      month: input.options.month,
      kind: input.options.kind,
      fromSnapshot: input.options.fromSnapshot,
    });
  },
});
